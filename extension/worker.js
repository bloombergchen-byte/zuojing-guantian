'use strict';
importScripts('core.js');

const STORAGE_KEY = 'sky-home-v1';
const RAW_KEY = `${STORAGE_KEY}-recovery-raw`;
let queue = Promise.resolve();

async function write(state) {
  try { await chrome.storage.local.set({ [STORAGE_KEY]: state }); }
  catch (error) { throw new Error(`本机存储写入失败，原数据已保留，请重试：${error.message || '存储空间或权限错误'}`); }
}

async function handle(message) {
  if (message.type === 'getRecoveryRaw') {
    const stored = await chrome.storage.local.get(RAW_KEY);
    return { ok: true, raw: stored[RAW_KEY] ?? null };
  }
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const raw = { app: '坐井观天原始存储', exportedAt: new Date().toISOString(), storage: 'chrome', missing: stored[STORAGE_KEY] === undefined, value: stored[STORAGE_KEY] ?? null };
  if (message.type === 'getRaw') return { ok: true, raw };
  if (message.type === 'recover') {
    if (message.command?.confirmed !== true) throw new Error('请先确认使用备份恢复数据');
    const value = message.command.value;
    if (!value || Array.isArray(value)) throw new Error('恢复需要完整的坐井观天备份');
    const state = SkyCore.previewImport(value, SkyCore.emptyState(), 'replace').state;
    state.recoveryBackup = null;
    const previousRevision = stored[STORAGE_KEY]?.revision;
    const floor = message.command.minRevision;
    state.revision = Math.max(Date.now(), Number.isSafeInteger(previousRevision) && previousRevision >= 0 ? previousRevision : 0, Number.isSafeInteger(floor) && floor >= 0 ? floor : 0, value.state.revision) + 1;
    const validated = SkyCore.validateState(state);
    try { await chrome.storage.local.set({ [RAW_KEY]: raw }); }
    catch (error) { throw new Error(`原始数据保全失败，未替换数据：${error.message || '存储空间或权限错误'}`); }
    await write(validated);
    return { ok: true, state: validated, result: { recovered: true } };
  }
  let state;
  if (stored[STORAGE_KEY] === undefined) {
    state = SkyCore.emptyState();
    await write(state);
  } else {
    try { state = SkyCore.validateState(stored[STORAGE_KEY]); }
    catch (error) { throw new Error(`已存数据损坏，原数据已保留，请恢复备份：${error.message}`); }
  }
  if (message.type === 'get') return { ok: true, state };
  if (message.type !== 'dispatch') throw new Error('不支持的存储请求');
  const next = SkyCore.apply(state, message.command);
  await write(next.state);
  return { ok: true, ...next };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || message.channel !== STORAGE_KEY) return;
  const pending = queue.then(() => handle(message));
  queue = pending.catch(() => {});
  pending.then(respond, error => respond({ ok: false, error: error.message || '本机存储失败，请重试' }));
  return true;
});
