'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../extension/core.js');
const source = file => fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const KEY = 'sky-home-v1';
const RAW_KEY = `${KEY}-recovery-raw`;
const stamp = '2026-10-15T08:00:00.000Z';
const backup = state => ({ app: '坐井观天', schemaVersion: 1, exportedAt: stamp, state });
const add = (state, url = 'example.com', name = '示例') => core.apply(state, { type: 'saveSite', site: { name, url, group: 'tools' } });
const base = add(core.emptyState()).state;

function checkCore() {
  assert.deepEqual(core.GROUPS.map(item => item.id), ['watch', 'guitar', 'create', 'tools', 'learn', 'collect', 'social']);
  assert.equal(core.normalizeURL(' Example.COM/a?q=1 '), 'https://example.com/a?q=1');
  assert.equal(core.normalizeURL('localhost:8080/a'), 'https://localhost:8080/a');
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com\n', '', 'https://', 'x'.repeat(4097)]) {
    assert.throws(() => core.normalizeURL(value), Error);
  }
  for (const [url, expected] of [['youtube.com', 'watch'], ['songsterr.com', 'guitar'], ['claude.ai', 'create'], ['deepl.com', 'tools'], ['wikipedia.org', 'learn'], ['archive.org', 'collect'], ['reddit.com', 'social']]) {
    assert.equal(core.classifyBookmark({ name: '示例', url }), expected);
  }
  assert.equal(core.classifyBookmark({ name: '课程', folder: '学习', url: 'example.org' }), 'learn');
  for (const name of ['课堂派', '学校教务入口', '校园办事', '大学图书馆', '论文检索']) assert.equal(core.classifyBookmark({ name, url: 'example.org' }), 'learn');
  assert.equal(core.classifyBookmark({ name: '校内入口', folder: 'other/大学', url: 'example.org' }), 'learn');
  const realBookmarks = [{name:'校内入口',url:'https://example.org/',folder:'other/大学'}];
  const university = realBookmarks.filter(item => /大学/.test(item.folder || ''));
  assert.ok(university.length > 0, 'check representative local university bookmarks without printing private URLs');
  assert.ok(university.every(item => core.classifyBookmark(item) === 'learn'));
  console.log(`PASS classification: ${university.length} local university bookmarks classified as learn (private URLs omitted)`);
  assert.equal(core.classifyBookmark({ name: '<script>alert(1)</script>', url: 'example.org' }), 'tools');
  assert.equal(core.classifyBookmark({ name: '未知', url: 'youtube.com.evil.example' }), 'tools');
  assert.deepEqual(core.flattenBookmarks([{ title: '', children: [{ title: '影音', children: [{ title: '视频', url: 'https://example.org/video' }] }] }]), [{ name: '视频', url: 'https://example.org/video', folder: '影音' }]);
  const mixedNodes = [
    { title: '普通网站', url: 'http://example.org/named' },
    { title: '', url: 'https://example.org/blank' },
    { title: '新标签', url: 'chrome://newtab' },
    { title: '', url: 'chrome://bookmarks' },
    { title: '脚本书签', url: 'javascript:alert(1)' },
    { title: '', url: 'javascript:void(0)' }
  ];
  const mixed = core.flattenBookmarks([{ title: '导入来源', children: mixedNodes }]);
  assert.deepEqual(mixed.map(item => item.url), mixedNodes.map(item => item.url));
  assert.deepEqual(mixed.map(item => item.name), ['普通网站', 'example.org', '新标签', '未命名书签', '脚本书签', '未命名书签']);
  assert.ok(mixed.every(item => item.folder === '导入来源' && [...item.name].length <= 120));
  assert.equal(core.previewImport(mixed.filter(item => /^https?:\/\//i.test(item.url)), core.emptyState(), 'merge').total, 2);
  for (const item of mixed.slice(2)) assert.throws(() => core.previewImport([item], core.emptyState(), 'merge'), /HTTP/);
  assert.throws(() => core.previewImport(mixed, core.emptyState(), 'merge'), /HTTP/);
  console.log('PASS bookmark flatten: named/blank HTTP and unsupported sources retained; unsupported imports remain rejected');
  const cycle = { title: '循环', children: [] }; cycle.children.push(cycle);
  assert.throws(() => core.flattenBookmarks([cycle]), /循环/);
  assert.throws(() => core.flattenBookmarks([{ children: '坏节点' }]), /子节点/);

  const unchanged = JSON.stringify(base);
  let state = core.apply(base, { type: 'saveSite', site: { ...base.sites[0], name: '改名', group: 'learn' } }).state;
  assert.equal(state.sites[0].createdAt, base.sites[0].createdAt);
  assert.equal(state.sites[0].name, '改名');
  assert.equal(JSON.stringify(base), unchanged);
  assert.throws(() => add(base), /已存在/);
  state = core.apply(state, { type: 'deleteSite', id: state.sites[0].id }).state;
  assert.equal(state.sites.length, 0); assert.equal(state.trash.length, 1);
  state = core.apply(state, { type: 'restoreSite', id: state.trash[0].site.id }).state;
  assert.equal(state.sites.length, 1); assert.equal(state.trash.length, 0);
  state = core.apply(state, { type: 'draft', draft: { name: '', url: 'https://', group: '' } }).state;
  assert.equal(state.draft.url, 'https://');
  assert.throws(() => core.apply(state, { type: 'draft', draft: { name: '字'.repeat(121), url: '', group: '' } }), /草稿名称/);
  state = core.apply(state, { type: 'settings', settings: { engine: 'bing', artPresence: 55, openingEnabled: false } }).state;
  assert.equal(state.settings.engine, 'bing');
  assert.throws(() => core.apply(state, { type: 'settings', settings: { artPresence: 54 } }), /设置/);
  state = core.apply(state, { type: 'deleteSite', id: state.sites[0].id }).state;
  const exported = backup(copy(state));
  const replaced = core.apply(base, { type: 'import', value: exported, mode: 'replace' }).state;
  assert.deepEqual({ ...replaced, revision: state.revision, recoveryBackup: null }, state);
  assert.deepEqual(replaced.recoveryBackup, { ...base, recoveryBackup: null });
  assert.deepEqual(core.apply(replaced, { type: 'restoreBackup' }).state, { ...base, revision: replaced.revision + 1 });
  assert.throws(() => core.validateState({ ...state, recoveryBackup: replaced }), /嵌套/);
  const clone = core.validateState(replaced);
  clone.recoveryBackup.sites[0].name = '不能影响原数据';
  assert.equal(replaced.recoveryBackup.sites[0].name, base.sites[0].name);

  const rows = [
    { name: '一', url: 'https://EXAMPLE.com/a', folder: '资源' },
    { name: '重复', url: 'https://example.com/a' },
    { name: '不同路径', url: 'https://example.com/b' },
    { name: '不同查询', url: 'https://example.com/a?q=1' }
  ];
  let preview = core.previewImport(rows, base, 'merge');
  assert.equal(preview.total, 4); assert.equal(preview.duplicates, 1); assert.equal(preview.counts.collect, 1);
  assert.equal(JSON.stringify(base), unchanged);
  const first = preview.state;
  preview = core.previewImport(rows, first, 'merge');
  assert.deepEqual(preview.state, first); assert.equal(preview.duplicates, 4);
  const withClicks = core.apply(base, { type: 'click', id: base.sites[0].id }).state;
  const merged = core.previewImport(backup(withClicks), withClicks, 'merge').state;
  assert.equal(merged.stats[0].count, 1);
  assert.deepEqual(core.previewImport(backup(withClicks), merged, 'merge').state, merged);
  for (const bad of [
    [...rows, { name: '坏链接', url: 'javascript:alert(1)' }],
    [...rows, { name: '', url: 'example.org' }],
    [...rows, { name: '坏文件夹', url: 'example.org', folder: {} }],
    { ...exported, schemaVersion: 99 },
    backup({ ...state, stats: [{ day: '2026-02-30', url: 'example.com', name: '坏日期', count: 1, lastAt: stamp }] }),
    backup({ ...state, trash: [...state.trash, ...state.trash] })
  ]) {
    assert.throws(() => core.apply(base, { type: 'import', value: bad, mode: 'replace' }), Error);
    assert.equal(JSON.stringify(base), unchanged);
  }
  assert.throws(() => core.previewImport([{ name: 'a'.repeat(core.MAX_IMPORT_BYTES), url: 'example.org' }], base, 'merge'), /32MiB/);
  const large = { ...core.emptyState(), sites: Array.from({ length: 1400 }, (_, index) => ({ id: String(index), name: '长网址', url: `https://example.org/${index}?q=${'a'.repeat(4000)}`, group: 'tools', createdAt: stamp })) };
  const largeValidated = core.validateState(large);
  const largeBackup = backup(largeValidated);
  assert.ok(Buffer.byteLength(JSON.stringify(largeBackup)) > 5 * 1024 * 1024);
  const largePreview = core.previewImport(largeBackup, core.emptyState(), 'replace');
  assert.equal(largePreview.rollbackAvailable, true);
  assert.deepEqual({ ...largePreview.state, recoveryBackup: null }, largeValidated);
  const largeWithRecovery = core.apply(largeValidated, { type: 'import', value: largeBackup, mode: 'replace' }).state;
  const recoveredLarge = core.previewImport(backup(largeWithRecovery), core.emptyState(), 'replace').state;
  assert.deepEqual(recoveredLarge.sites, largeWithRecovery.sites);
  assert.deepEqual(core.validateState(backup(largeWithRecovery).state), largeWithRecovery);
  const overStateBytes = { ...largeValidated, stats: Array.from({ length: 8000 }, (_, index) => ({ day: '2026-10-15', url: `https://example.org/history/${index}?q=${'a'.repeat(4000)}`, name: '历史', count: 1, lastAt: stamp })) };
  assert.throws(() => core.validateState(overStateBytes), /32MiB/);
  assert.equal(largeValidated.stats.length, 0);
  console.log('PASS import bounds: own >5MiB backup, nested recovery snapshot, full-state byte ceiling without truncation');
  const boundary = core.emptyState();
  boundary.stats = Array.from({ length: 8210 }, (_, index) => ({ day: '2026-10-15', url: `https://example.org/h/${index}?q=${'a'.repeat(3900)}`, name: '历史', count: 1, lastAt: stamp }));
  const remaining = core.MAX_STATE_BYTES - 16 - Buffer.byteLength(JSON.stringify({ ...boundary, revision: Number.MAX_SAFE_INTEGER }));
  assert.ok(remaining > 0);
  boundary.stats.forEach((item, index) => { item.url += 'a'.repeat(Math.floor(remaining / boundary.stats.length) + (index < remaining % boundary.stats.length ? 1 : 0)); });
  const boundaryValid = core.validateState(boundary);
  const boundaryBackup = backup(boundaryValid);
  assert.ok(Buffer.byteLength(JSON.stringify(boundaryBackup)) < core.MAX_IMPORT_BYTES);
  const boundaryPreview = core.previewImport(boundaryBackup, core.emptyState(), 'replace');
  assert.equal(boundaryPreview.rollbackAvailable, false); assert.match(boundaryPreview.warning, /不保留.*一键回退/);
  const boundaryApplied = core.apply(core.emptyState(), { type: 'import', mode: 'replace', value: boundaryBackup });
  assert.equal(boundaryApplied.result.rollbackAvailable, false); assert.equal(boundaryApplied.result.warning, boundaryPreview.warning);
  assert.deepEqual(boundaryApplied.state, { ...boundaryPreview.state, revision: 1 });
  assert.deepEqual(boundaryApplied.state.stats, boundaryValid.stats);
  const noRollbackPreview = core.previewImport(backup(base), state, 'replace', { keepRollback: false });
  const noRollbackApplied = core.apply(state, { type: 'import', mode: 'replace', value: backup(base), keepRollback: false });
  assert.equal(noRollbackPreview.rollbackAvailable, false); assert.match(noRollbackPreview.warning, /先导出/);
  assert.deepEqual(noRollbackApplied.state, { ...noRollbackPreview.state, revision: state.revision + 1 });
  assert.equal(noRollbackApplied.state.recoveryBackup, null);
  assert.throws(() => core.previewImport(backup(base), state, 'replace', { keepRollback: 'false' }), /布尔/);
  console.log('PASS replace boundary: 8210 stats actually applied intact; preview/commit share optional rollback and explicit no-rollback choice');
  const overCapacity = { ...core.emptyState(), sites: Array.from({ length: 5001 }, (_, index) => ({ id: String(index), name: '站点', url: `https://example.org/${index}`, group: 'tools', createdAt: stamp })) };
  assert.throws(() => core.validateState(overCapacity), /5000/);
  assert.throws(() => core.apply(base, { type: 'unknown' }), /不支持/);
  assert.equal(add(base, 'second.example').state.sites.length, 2);
  console.log('PASS core: URL/security, seven groups, CRUD/recovery, drafts, import roundtrip/idempotence/atomic rejection');
}

function fixedCore() {
  let clock = Date.parse('2026-10-15T08:00:00.000Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const context = vm.createContext({ URL, TextEncoder, Date: Clock, crypto: globalThis.crypto });
  vm.runInContext(source('core.js'), context);
  return { core: context.SkyCore, setTime: value => { clock = Date.parse(value); }, context };
}

function checkStats() {
  const fixed = fixedCore(), api = fixed.core;
  let state = api.validateState(base);
  const siteId = state.sites[0].id;
  for (let index = 0; index < 550; index++) state = api.apply(state, { type: 'click', id: siteId }).state;
  assert.equal(state.stats.length, 1); assert.equal(state.stats[0].count, 550);
  const expectedLocalDay = new Date('2026-10-15T08:00:00.000Z');
  assert.equal(state.stats[0].day, `${expectedLocalDay.getFullYear()}-${String(expectedLocalDay.getMonth() + 1).padStart(2, '0')}-${String(expectedLocalDay.getDate()).padStart(2, '0')}`);
  fixed.setTime('2026-10-16T08:00:00.000Z');
  state = api.apply(state, { type: 'click', id: siteId }).state;
  assert.equal(state.stats.length, 2); assert.equal(state.stats[1].count, 1);
  const restored = api.previewImport(backup(copy(state)), api.emptyState(), 'replace').state;
  assert.deepEqual(copy(restored.stats), copy(state.stats));
  assert.equal(api.apply(state, { type: 'resetStats' }).state.stats.length, 0);
  let opening = api.apply(state, { type: 'claimOpening', day: '2026-10-16' });
  assert.equal(opening.result.playOpening, false, 'opening requires a browser startup claim');
  opening = api.apply(opening.state, { type: 'claimOpening', day: '2026-10-16', browserStartup: true });
  assert.equal(opening.result.playOpening, true);
  opening = api.apply(opening.state, { type: 'settings', settings: { openingEnabled: false } });
  opening = api.apply(opening.state, { type: 'claimOpening', day: '2026-10-17', browserStartup: true });
  assert.equal(opening.result.playOpening, false); assert.equal(opening.state.lastVisitDay, '2026-10-17');
  console.log('PASS stats: 550 clicks retained, local-day aggregation, full-history roundtrip, reset and startup-gated opening');
}

async function checkWorker() {
  let stored, rawArchive, listener, startupListener, sessionData = {}, failNext = false, failMain = false, writes = 0;
  const changed = new Set();
  const chrome = {
    runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } }, onStartup: { addListener(fn) { startupListener = fn; } } },
    storage: {
      local: {
        async get(key) { await new Promise(resolve => setImmediate(resolve)); const value = key === RAW_KEY ? rawArchive : stored; return value === undefined ? {} : { [key]: copy(value) }; },
        async set(value) {
          await new Promise(resolve => setImmediate(resolve));
          if (failNext) { failNext = false; throw new Error('模拟磁盘写入失败'); }
          if (Object.hasOwn(value, RAW_KEY)) { rawArchive = copy(value[RAW_KEY]); return; }
          if (failMain) { failMain = false; throw new Error('模拟恢复写入失败'); }
          stored = copy(value[KEY]); writes++;
          for (const fn of changed) fn({ [KEY]: { newValue: copy(stored) } }, 'local');
        }
      },
      session: {
        async get(key) { return sessionData[key] === undefined ? {} : { [key]: sessionData[key] }; },
        async set(value) { Object.assign(sessionData, copy(value)); }
      },
      onChanged: { addListener(fn) { changed.add(fn); } }
    }
  };
  const context = vm.createContext({ chrome, URL, TextEncoder, console, crypto: globalThis.crypto });
  context.importScripts = file => vm.runInContext(source(file), context);
  vm.runInContext(source('worker.js'), context);
  const request = (type, command) => new Promise(resolve => {
    assert.equal(listener({ channel: KEY, type, command }, { id: chrome.runtime.id }, resolve), true);
  });
  assert.equal(listener({ channel: KEY, type: 'get' }, { id: 'other-extension' }, () => assert.fail('不得回复外部扩展')), undefined);
  assert.equal(listener({ channel: 'other', type: 'get' }, { id: chrome.runtime.id }, () => assert.fail('不得处理其他消息')), undefined);
  assert.equal((await request('get')).state.sites.length, 0); assert.equal(writes, 1);
  const created = await request('dispatch', { type: 'saveSite', site: { name: '并发', url: 'example.com', group: 'tools' } });
  const siteId = created.result.site.id;
  const click = { type: 'click', id: siteId };
  const concurrent = await Promise.all([request('dispatch', click), request('dispatch', click)]);
  assert.ok(concurrent.every(item => item.ok)); assert.equal(stored.stats[0].count, 2); assert.equal(stored.revision, 3);
  failNext = true;
  const beforeFailure = JSON.stringify(stored);
  assert.equal((await request('dispatch', click)).ok, false);
  assert.equal(JSON.stringify(stored), beforeFailure);
  assert.equal((await request('dispatch', click)).ok, true); assert.equal(stored.stats[0].count, 3);
  const openingCommand = { type: 'claimOpening', day: '2026-10-15' };
  const beforeRestart = await Promise.all([request('dispatch', openingCommand), request('dispatch', openingCommand)]);
  assert.deepEqual(beforeRestart.map(item => item.result.playOpening), [false, false], 'new tabs do not play until a browser startup');
  startupListener();
  vm.runInContext("startupOpeningReady = Promise.resolve()", context); // Simulate service-worker suspension; session data must survive.
  const afterRestart = await Promise.all([request('dispatch', openingCommand), request('dispatch', openingCommand)]);
  assert.deepEqual(afterRestart.map(item => item.result.playOpening), [true, false], 'only one tab claims opening after restart, even on the same day');
  assert.equal((await request('dispatch', openingCommand)).result.playOpening, false, 'later new tabs skip the opening');
  sessionData = {};
  startupListener();
  assert.equal((await request('dispatch', openingCommand)).result.playOpening, true, 'a later browser restart enables one new playback');
  await request('dispatch', { type: 'settings', settings: { openingEnabled: false } });
  sessionData = {};
  startupListener();
  assert.equal((await request('dispatch', openingCommand)).result.playOpening, false, 'the existing playback setting still applies');
  assert.equal((await request('dispatch', openingCommand)).result.playOpening, false, 'disabled playback is consumed for the whole browser session');
  const good = copy(stored);
  stored.sites[0].url = 'javascript:alert(1)';
  const corrupt = JSON.stringify(stored);
  assert.match((await request('get')).error, /原数据已保留/); assert.equal(JSON.stringify(stored), corrupt);
  assert.equal((await request('getRaw')).raw.value.sites[0].url, 'javascript:alert(1)');
  assert.equal((await request('recover', { value: backup(good), confirmed: false })).ok, false);
  assert.equal((await request('recover', { value: backup({ ...good, sites: [{ ...good.sites[0], url: 'javascript:bad' }] }), confirmed: true })).ok, false);
  assert.equal(rawArchive, undefined); assert.equal(JSON.stringify(stored), corrupt);
  failNext = true;
  assert.match((await request('recover', { value: backup(good), confirmed: true })).error, /保全失败/);
  assert.equal(JSON.stringify(stored), corrupt);
  failMain = true;
  assert.equal((await request('recover', { value: backup(good), confirmed: true })).ok, false);
  assert.equal(JSON.stringify(stored), corrupt); assert.equal(JSON.stringify(rawArchive.value), corrupt);
  const recovered = await request('recover', { value: backup(good), confirmed: true });
  assert.equal(recovered.result.recovered, true); assert.ok(recovered.state.revision > good.revision);
  assert.equal(JSON.stringify((await request('getRecoveryRaw')).raw.value), corrupt);
  assert.equal((await request('dispatch', click)).ok, true);

  chrome.runtime.sendMessage = message => request(message.type, message.command);
  const page = vm.createContext({ chrome, SkyCore: core, console });
  vm.runInContext(source('store.js'), page);
  const states = [], unsubscribe = page.SkyStore.subscribe(state => states.push(state));
  const result = await page.SkyStore.dispatch(click);
  assert.equal(result.state.stats[0].count, stored.stats[0].count);
  assert.equal(states.length, 1, 'storage event and response must not notify twice');
  for (const fn of changed) fn({ [KEY]: { newValue: copy(base) } }, 'local');
  assert.equal(states.length, 1, 'stale storage events must not replace newer state');
  const revisionBeforeRecovery = states[0].revision;
  stored = '{broken object}';
  const rawFromPage = await page.SkyStore.getRaw();
  assert.equal(rawFromPage.value, '{broken object}');
  const pageRecovery = await page.SkyStore.recover(backup(base), true);
  assert.ok(pageRecovery.state.revision > revisionBeforeRecovery);
  assert.equal(states.length, 2, 'older confirmed backup must still notify with a new revision');
  assert.equal((await page.SkyStore.getRecoveryRaw()).value, '{broken object}');
  unsubscribe();
  assert.equal((await page.SkyStore.get()).revision, stored.revision);
  console.log('PASS worker/store: concurrency, failures/retry, confirmed corrupt-state recovery, raw preservation, monotonic notifications');
}

async function checkLocalStore() {
  let stored = null, archived = null, failNext = false, failMain = false, lock = Promise.resolve();
  const storageListeners = [];
  const localStorage = {
    getItem(key) { return key === RAW_KEY ? archived : stored; },
    setItem(key, value) { if (failNext) { failNext = false; throw new Error('quota'); } if (key === RAW_KEY) { archived = value; return; } if (failMain) { failMain = false; throw new Error('quota'); } stored = value; }
  };
  const navigator = { locks: { request(key, run) { const pending = lock.then(run); lock = pending.catch(() => {}); return pending; } } };
  function page(withLocks = true) {
    const context = vm.createContext({ SkyCore: core, localStorage, navigator: withLocks ? navigator : {}, console, addEventListener(type, fn) { storageListeners.push(fn); } });
    vm.runInContext(source('store.js'), context);
    return context.SkyStore;
  }
  const first = page(), second = page();
  assert.equal((await first.get()).revision, 0);
  const created = await first.dispatch({ type: 'saveSite', site: { name: '本机', url: 'example.com', group: 'tools' } });
  const click = { type: 'click', id: created.result.site.id };
  await Promise.all([first.dispatch(click), second.dispatch(click)]);
  assert.equal((await first.get()).stats[0].count, 2);
  failNext = true;
  const before = stored;
  await assert.rejects(first.dispatch(click), /原数据已保留/); assert.equal(stored, before);
  await first.dispatch(click); assert.equal((await first.get()).stats[0].count, 3);
  await assert.rejects(first.dispatch(null), /操作/);
  await assert.rejects(first.dispatch(undefined), /操作/);
  const received = [];
  second.subscribe(state => received.push(state));
  storageListeners.forEach(fn => fn({ key: KEY }));
  assert.equal(received.length, 1);
  stored = '{broken';
  await assert.rejects(first.get(), /原数据已保留/); assert.equal(stored, '{broken');
  assert.equal((await first.getRaw()).value, '{broken');
  await assert.rejects(first.recover(backup(base)), /确认/);
  await assert.rejects(first.recover(backup({ ...base, sites: [] , draft: {} }), true));
  assert.equal(archived, null); assert.equal(stored, '{broken');
  failNext = true;
  await assert.rejects(first.recover(backup(base), true), /保全失败/); assert.equal(stored, '{broken');
  failMain = true;
  await assert.rejects(first.recover(backup(base), true), /原数据已保留/); assert.equal(stored, '{broken');
  const recovered = await first.recover(backup(base), true);
  assert.equal(recovered.result.recovered, true); assert.equal((await first.getRecoveryRaw()).value, '{broken');
  assert.ok(recovered.state.revision > created.state.revision);
  stored = before;
  const fallback = page(false);
  await Promise.all([fallback.dispatch(click), fallback.dispatch(click)]);
  assert.equal((await fallback.get()).stats[0].count, 4);
  console.log('PASS localhost fallback: Web Locks, subscriptions, confirmed recovery/raw preservation, failures/retry, single-tab queue');
}

(async () => {
  checkCore(); checkStats(); await checkWorker(); await checkLocalStore();
  console.log('PASS all release data checks');
})().catch(error => { console.error(error); process.exitCode = 1; });
