'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../extension/action-library.js'), 'utf8');
const binding = 'https://music.example/list';
const fingerprint = crypto.createHash('sha256').update(binding, 'utf8').digest('hex');
const site = { id: 'synthetic', name: '音乐练习', url: binding + '?original=1', group: 'guitar' };
const other = { id: 'other-synthetic', name: '示例', url: 'https://tools.example/', group: 'tools' };
const context = {
  URL, Uint8Array, TextEncoder, crypto: crypto.webcrypto,
  SkyPersonalIcons: {
    synthetic: { image: 'rk-example-v2.png', pose: 'lean', box: [43, 37, 53, 48], fingerprint, logo: 'private.ico', plate: 'dark', skipDirect: true },
    ghost: { image: 'rk-ghost.webp', pose: 'hug', box: [31, 53, 48, 45], fingerprint: 'a'.repeat(64) },
    malformed: { image: '../secret.png', pose: 'lie' }
  },
  SkyCore: { iconActionFor: state => state?.picked || null },
  SkySiteIcons: { siteInfo: value => value ? { pose: 'hug' } : null }
};
vm.runInNewContext(code, context);
const api = context.SkyActions;
(async () => {
  const all = api.catalog([site, other]);
  assert.equal(all.length, 5, 'three builtin actions and two valid personal images');
  assert.equal(new Set(all.map(value => value.id)).size, all.length);
  const personal = api.resolve('rk-example-v2.png', [site]);
  assert.equal(personal.pose, 'lean');
  assert.equal(personal.groups.includes('guitar'), true);
  assert.equal('logo' in personal || 'plate' in personal || 'skipDirect' in personal, false, 'source branding must not be transferred');
  assert.equal('siteId' in personal || 'url' in personal || 'name' in personal, false, 'catalog identifiers do not expose source sites');
  assert.equal(api.resolve('../secret.png', [site]), null);
  assert.equal(api.resolve('rk-ghost.webp', []).id, 'rk-ghost.webp', 'an action survives deletion of its source website');
  assert.equal(api.recommend({ name: '其他页面', url: 'https://music.example/another', group: '' }, [site])[0].id, 'rk-example-v2.png', 'same host gets a local recommendation');
  assert.equal(api.recommend({ name: '吉他工具', url: 'https://new.example/', group: 'guitar' }, [site])[0].id, 'rk-example-v2.png', 'selected category informs recommendation');
  assert.equal(api.recommend({ name: '未知', url: 'https://unknown.example/', group: '' }, [site])[0].id, 'simple-lie.png', 'unknown websites default to a builtin action');
  assert.ok(api.recommend({ name: '未知', url: 'https://unknown.example/' }, [site]).length <= 4);
  assert.equal(await api.current(site, { sites: [site], picked: 'simple-lean.png' }), 'simple-lean.png', 'saved manual choice wins');
  assert.equal(await api.current(site, { sites: [site] }), 'rk-example-v2.png', 'matching original fingerprint uses original art');
  assert.equal(await api.current({ ...site, url: binding + '?changed=2#part' }, { sites: [site] }), 'rk-example-v2.png', 'query changes do not invalidate original art');
  assert.equal(await api.current({ ...site, url: 'https://music.example/other' }, { sites: [site] }), 'simple-hug.png', 'changed path falls back');
  assert.equal(await api.current({ ...site, url: 'https://different.example/list' }, { sites: [site] }), 'simple-hug.png', 'changed host falls back');
  assert.equal(await api.current(site, { sites: [site], picked: 'not-present.png' }), 'rk-example-v2.png', 'unavailable manual choice safely falls back');
  console.log('PASS action library: safe catalog, stable ids, local recommendations, deleted source, saved choice and original fingerprint');
})().catch(error => { console.error(error); process.exitCode = 1; });
