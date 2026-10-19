(function (root) {
  'use strict';
  const KEY = 'sky-home-v1', core = root.SkyCore;
  const RAW_KEY = `${KEY}-recovery-raw`;
  const extension = Boolean(root.chrome?.runtime?.id && root.chrome.runtime.sendMessage);
  const listeners = new Set();
  let queue = Promise.resolve(), lastNotification, lastRevision = -1;
  function notify(state) {
    if (state.revision < lastRevision) return;
    const signature = JSON.stringify(state);
    if (signature === lastNotification) return;
    lastRevision = state.revision;
    lastNotification = signature;
    for (const listener of listeners) {
      try { listener(core.validateState(state)); } catch (error) { console.error(error); }
    }
  }
  async function send(type, command) {
    const response = await root.chrome.runtime.sendMessage({ channel: KEY, type, command });
    if (!response?.ok) throw new Error(response?.error || '扩展存储没有响应，请重试');
    if (response.state) response.state = core.validateState(response.state);
    return response;
  }
  function readLocal() {
    let raw;
    try { raw = root.localStorage.getItem(KEY); }
    catch { throw new Error('无法读取本机存储，请检查浏览器存储权限'); }
    if (raw === null) return null;
    try { return core.validateState(JSON.parse(raw)); }
    catch (error) { throw new Error(`已存数据损坏，原数据已保留，请恢复备份：${error.message}`); }
  }
  function writeLocal(state) {
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { throw new Error('本机存储写入失败，原数据已保留，请检查空间或权限后重试'); }
  }
  function localTask(command, dispatch = false, operation = '') {
    const run = () => {
      if (operation === 'getRecoveryRaw') {
        try { return JSON.parse(root.localStorage.getItem(RAW_KEY)); }
        catch { throw new Error('无法读取恢复前原始存储'); }
      }
      if (operation === 'getRaw' || operation === 'recover') {
        let value;
        try { value = root.localStorage.getItem(KEY); }
        catch { throw new Error('无法读取本机原始存储'); }
        const raw = { app: '坐井观天原始存储', exportedAt: new Date().toISOString(), storage: 'localStorage', missing: value === null, value };
        if (operation === 'getRaw') return raw;
        if (command?.confirmed !== true) throw new Error('请先确认使用备份恢复数据');
        if (!command.value || Array.isArray(command.value)) throw new Error('恢复需要完整的坐井观天备份');
        const state = core.previewImport(command.value, core.emptyState(), 'replace').state;
        state.recoveryBackup = null;
        let previousRevision;
        try { previousRevision = JSON.parse(value)?.revision; } catch { /* Preserve invalid JSON as raw text. */ }
        state.revision = Math.max(Date.now(), lastRevision, Number.isSafeInteger(previousRevision) && previousRevision >= 0 ? previousRevision : 0, command.value.state.revision) + 1;
        const validated = core.validateState(state);
        try { root.localStorage.setItem(RAW_KEY, JSON.stringify(raw)); }
        catch { throw new Error('原始数据保全失败，未替换数据，请检查空间或权限'); }
        writeLocal(validated);
        return { state: validated, result: { recovered: true } };
      }
      let state = readLocal();
      if (state === null) { state = core.emptyState(); writeLocal(state); }
      if (!dispatch) return { state };
      const next = core.apply(state, command);
      writeLocal(next.state);
      return next;
    };
    if (root.navigator?.locks?.request) return root.navigator.locks.request(KEY, run);
    // ponytail: without Web Locks this queue protects only this tab; use an extension or a Web Locks browser for concurrent tabs.
    const pending = queue.then(run);
    queue = pending.catch(() => {});
    return pending;
  }
  if (extension) {
    root.chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY]?.newValue) return;
      try { notify(core.validateState(changes[KEY].newValue)); } catch (error) { console.error(error); }
    });
  } else {
    root.addEventListener('storage', event => {
      if (event.key !== KEY) return;
      try { const state = readLocal(); if (state) notify(state); } catch (error) { console.error(error); }
    });
  }
  root.SkyStore = {
    async cloud(type,command={}){if(!extension)throw new Error('云端功能只在已加载的 Chrome 扩展中可用');return send('cloud'+type,command);},
    async get() {
      return extension ? (await send('get')).state : (await localTask()).state;
    },
    async dispatch(command) {
      const response = extension ? await send('dispatch', command) : await localTask(command, true);
      notify(response.state);
      return { state: response.state, result: response.result };
    },
    async getRaw() {
      return extension ? (await send('getRaw')).raw : await localTask(null, false, 'getRaw');
    },
    async getRecoveryRaw() {
      return extension ? (await send('getRecoveryRaw')).raw : await localTask(null, false, 'getRecoveryRaw');
    },
    async recover(value, confirmed = false) {
      const command = { value, confirmed, minRevision: lastRevision };
      const response = extension ? await send('recover', command) : await localTask(command, false, 'recover');
      notify(response.state);
      return { state: response.state, result: response.result };
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('订阅者必须是函数');
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
})(globalThis);
