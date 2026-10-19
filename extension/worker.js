'use strict';
importScripts('core.js');
importScripts('cloud.js');

const STORAGE_KEY = 'sky-home-v1';
const RAW_KEY = `${STORAGE_KEY}-recovery-raw`;
let queue = Promise.resolve();
const transact=fn=>{const pending=queue.then(fn);queue=pending.catch(()=>{});return pending;};
const cloud=SkyCloud.create({chrome,transaction:transact,readState:async()=>SkyCore.validateState((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]??SkyCore.emptyState())});
async function autoSync(){if((await cloud.status()).enabled)await cloud.sync().catch(()=>{});}
async function cloudMessage(message){
 const c=message.command||{};
 if(message.type==='cloudStatus')return {ok:true,cloud:await cloud.status()};
 if(message.type==='cloudConfigure'){const status=await cloud.configure(c);if(status.enabled)await chrome.alarms.create('sky-cloud-poll',{periodInMinutes:5});else await chrome.alarms.clear('sky-cloud-poll');return {ok:true,cloud:status};}
 if(message.type==='cloudSync')return {ok:true,cloud:await cloud.sync(c)};
 if(message.type==='cloudBackup')return {ok:true,cloud:await cloud.backup()};
 if(message.type==='cloudDownload')return {ok:true,value:await cloud.download()};
 if(message.type==='cloudBeforePull')return {ok:true,value:await cloud.getBeforePull()};
 throw Error('不支持的云端操作');
}
chrome.alarms?.onAlarm.addListener(alarm=>{if(alarm.name==='sky-cloud-poll'||alarm.name==='sky-cloud-change')autoSync().catch(()=>{});});
chrome.runtime.onStartup?.addListener(()=>{cloud.status().then(s=>{if(s.enabled)chrome.alarms.create('sky-cloud-poll',{periodInMinutes:5});});autoSync().catch(()=>{});});
chrome.runtime.onInstalled?.addListener(()=>{chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'});cloud.status().then(s=>{if(s.enabled)chrome.alarms.create('sky-cloud-poll',{periodInMinutes:5});});});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==='sync'&&changes[SkyCloud.KEY])autoSync().catch(()=>{});
 if(area==='local'&&changes[STORAGE_KEY]){const c=changes[STORAGE_KEY];try{if(JSON.stringify(SkyCloud.daily(c.oldValue??SkyCore.emptyState()))!==JSON.stringify(SkyCloud.daily(c.newValue)))cloud.status().then(s=>{if(s.enabled)chrome.alarms.create('sky-cloud-change',{delayInMinutes:1});});}catch{/* Invalid local data is handled by the recovery screen. */}}
});

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
  const pending = typeof message.type==='string'&&message.type.startsWith('cloud')?cloudMessage(message):transact(() => handle(message));
  pending.then(respond, error => respond({ ok: false, error: error.message || '本机存储失败，请重试' }));
  return true;
});
