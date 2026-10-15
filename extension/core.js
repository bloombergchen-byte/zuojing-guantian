(function (root) {
  'use strict';
  const GROUPS = Object.freeze([
    { id: 'watch', glyph: '看', name: '影音' },
    { id: 'guitar', glyph: '弹', name: '吉他与声音' },
    { id: 'create', glyph: '造', name: 'AI与创作' },
    { id: 'tools', glyph: '用', name: '日常工具' },
    { id: 'learn', glyph: '学', name: '学习' },
    { id: 'collect', glyph: '藏', name: '资源' },
    { id: 'social', glyph: '聊', name: '社区' }
  ].map(Object.freeze));
  const groupIds = new Set(GROUPS.map(group => group.id));
  const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
  // Reserve room for the exported backup envelope, so every accepted state can roundtrip.
  const MAX_STATE_BYTES = MAX_IMPORT_BYTES - 1024;
  // Budget the largest revision too, so a later import cannot fail merely when its revision gains digits.
  const stateBytes = value => new TextEncoder().encode(JSON.stringify({ ...value, revision: Number.MAX_SAFE_INTEGER })).length;
  const fail = message => { throw new Error(message); };
  const object = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}格式不正确`);
    return value;
  };
  function text(value, label, max, blank = false) {
    if (typeof value !== 'string' || [...value].length > max || /[\u0000-\u001f\u007f]/.test(value) || (!blank && !value.trim())) fail(`${label}为空、过长或含有控制字符`);
    return value;
  }
  function normalizeURL(value) {
    let input = text(value, '网址', 4096).trim();
    if (!/^https?:\/\//i.test(input)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(input)) fail('网址只允许 HTTP 或 HTTPS');
      input = input.startsWith('//') ? `https:${input}` : `https://${input}`;
    }
    let url;
    try { url = new URL(input); } catch { fail('网址格式不正确'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) fail('网址只允许无用户名密码的 HTTP 或 HTTPS');
    if (url.href.length > 4096) fail('网址不能超过4096字');
    return url.href;
  }
  function day(value, label = '日期', blank = false) {
    if (blank && value === '') return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${label}格式不正确`);
    return value;
  }
  function time(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label}格式不正确`);
    return value;
  }
  function group(value, blank = false) {
    if (!(blank && value === '') && !groupIds.has(value)) fail('分类不正确');
    return value;
  }
  const id = () => root.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  function emptyState() {
    return { schemaVersion: 1, revision: 0, sites: [], trash: [], draft: null,
      settings: { engine: 'google', artPresence: 82, openingEnabled: true },
      stats: [], lastVisitDay: '', recoveryBackup: null };
  }
  function site(value) {
    object(value, '网站');
    return { id: text(value.id, '网站ID', 120), name: text(value.name, '网站名称', 120).trim(), url: normalizeURL(value.url), group: group(value.group), createdAt: time(value.createdAt, '创建时间') };
  }
  function draft(value) {
    if (value === null) return null;
    object(value, '草稿');
    const result = { name: text(value.name, '草稿名称', 120, true), url: text(value.url, '草稿网址', 4096, true), group: group(value.group, true) };
    if (value.id !== undefined) result.id = text(value.id, '草稿ID', 120);
    return result;
  }
  function settings(value) {
    object(value, '设置');
    if (!['google', 'bing', 'baidu'].includes(value.engine) || !Number.isFinite(value.artPresence) || value.artPresence < 55 || value.artPresence > 100 || typeof value.openingEnabled !== 'boolean') fail('搜索引擎、原画存在感或开场设置不正确');
    return { engine: value.engine, artPresence: value.artPresence, openingEnabled: value.openingEnabled };
  }
  function validateState(value, nested = false) {
    object(value, '数据');
    if (value.schemaVersion !== 1) fail('数据版本不支持，请保留原文件');
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) fail('数据修订号不正确');
    if (!Array.isArray(value.sites) || !Array.isArray(value.trash) || !Array.isArray(value.stats)) fail('网站、收纳或统计格式不正确');
    if (value.sites.length + value.trash.length > 5000) fail('网站与收纳合计不能超过5000项');
    const ids = new Set(), urls = new Set();
    function unique(value) {
      const item = site(value);
      if (ids.has(item.id) || urls.has(item.url)) fail('网站ID或网址重复');
      ids.add(item.id); urls.add(item.url);
      return item;
    }
    const sites = value.sites.map(unique);
    const trash = value.trash.map(value => {
      object(value, '收纳记录');
      return { site: unique(value.site), deletedAt: time(value.deletedAt, '收纳时间') };
    });
    const statKeys = new Set();
    const stats = value.stats.map(value => {
      object(value, '统计记录');
      const item = { day: day(value.day), url: normalizeURL(value.url), name: text(value.name, '统计名称', 120).trim(), count: value.count, lastAt: time(value.lastAt, '访问时间') };
      if (!Number.isSafeInteger(item.count) || item.count < 1) fail('访问次数必须是正整数');
      const key = `${item.day}\n${item.url}`;
      if (statKeys.has(key)) fail('同一天同一网址的统计重复');
      statKeys.add(key);
      return item;
    });
    if (nested && value.recoveryBackup != null) fail('回退备份不能嵌套');
    const result = { schemaVersion: 1, revision: value.revision, sites, trash, draft: draft(value.draft), settings: settings(value.settings), stats, lastVisitDay: day(value.lastVisitDay, '上次访问日期', true), recoveryBackup: null };
    if (value.recoveryBackup != null) result.recoveryBackup = validateState(value.recoveryBackup, true);
    if (!nested && stateBytes(result) > MAX_STATE_BYTES) fail('完整数据超过32MiB安全边界，原数据不变；请先导出保全后再整理');
    return result;
  }
  function classifyBookmark(value) {
    object(value, '书签');
    const url = new URL(normalizeURL(value.url));
    const name = text(value.name, '书签名称', 120, true);
    const folder = value.folder === undefined ? '' : text(value.folder, '书签文件夹', 4096, true);
    if (/大学|高校|校园|教务|图书馆|课堂|论文/.test(folder)) return 'learn';
    const host = url.hostname.toLowerCase();
    const matches = domains => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
    if (matches(['youtube.com', 'youtu.be', 'bilibili.com', 'netflix.com', 'iqiyi.com', 'youku.com', 'douyin.com', 'v.qq.com', 'vimeo.com', 'twitch.tv'])) return 'watch';
    if (matches(['ultimate-guitar.com', 'songsterr.com', 'guitarworld.com', 'music.163.com', 'spotify.com', 'bandcamp.com', 'soundcloud.com', 'y.qq.com'])) return 'guitar';
    if (matches(['chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'gemini.google.com', 'midjourney.com', 'civitai.com', 'huggingface.co', 'figma.com', 'canva.com', 'runwayml.com', 'suno.com'])) return 'create';
    if (matches(['coursera.org', 'edx.org', 'udemy.com', 'khanacademy.org', 'wikipedia.org', 'developer.mozilla.org', 'arxiv.org', 'scholar.google.com'])) return 'learn';
    if (matches(['github.com', 'archive.org', 'pan.baidu.com', 'drive.google.com', 'mega.nz', 'unsplash.com', 'pexels.com'])) return 'collect';
    if (matches(['reddit.com', 'discord.com', 'discord.gg', 'x.com', 'twitter.com', 'weibo.com', 'zhihu.com', 'douban.com', 'v2ex.com', 'linux.do'])) return 'social';
    if (matches(['google.com', 'bing.com', 'baidu.com', 'deepl.com', 'translate.google.com', 'notion.so', 'notion.site', 'outlook.com', 'gmail.com'])) return 'tools';
    const label = `${folder} ${name}`.toLowerCase();
    for (const [key, rule] of [
      ['guitar', /吉他|音乐|音频|乐谱|guitar|music|audio/],
      ['create', /创作|绘画|设计|生成|人工智能|\bai\b|creative|design/],
      ['watch', /影音|电影|视频|动漫|追剧|video|movie|anime/],
      ['learn', /学习|教程|课程|文档|知识|文献|大学|高校|课堂|校园|教务|图书馆|论文|learn|course|tutorial|docs/],
      ['collect', /资源|素材|收藏|网盘|下载|resource|asset|download/],
      ['social', /社区|论坛|聊天|社交|social|forum|community/],
      ['tools', /工具|搜索|翻译|邮箱|办公|tool|search|mail/]
    ]) if (rule.test(label)) return key;
    return 'tools';
  }
  function flattenBookmarks(tree) {
    if (!Array.isArray(tree)) fail('书签树格式不正确');
    const result = [], seen = new WeakSet();
    const stack = tree.map(node => ({ node, folder: '' })).reverse();
    while (stack.length) {
      const { node, folder } = stack.pop();
      object(node, '书签节点');
      if (seen.has(node)) fail('书签树含有循环或重复节点');
      seen.add(node);
      const title = node.title === undefined ? '' : text(node.title, '书签标题', 120, true);
      if (node.url !== undefined) {
        text(node.url, '书签网址', 4096);
        let name = title.trim() || '未命名书签';
        if (!title.trim() && /^https?:\/\//i.test(node.url)) {
          try { name = [...new URL(node.url).hostname].slice(0, 120).join('') || name; }
          catch { /* Keep invalid source URLs for the import preview to reject explicitly. */ }
        }
        result.push({ name, url: node.url, folder });
      } else {
        if (node.children !== undefined && !Array.isArray(node.children)) fail('书签子节点格式不正确');
        const nextFolder = [folder, title].filter(Boolean).join(' / ');
        text(nextFolder, '书签文件夹', 4096, true);
        for (let index = (node.children || []).length - 1; index >= 0; index--) stack.push({ node: node.children[index], folder: nextFolder });
      }
    }
    return result;
  }
  function importSize(value) {
    let json;
    try { json = JSON.stringify(value); } catch { fail('导入文件不能含有循环引用'); }
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) fail('导入文件不能超过32MiB');
  }
  function withoutRecovery(value) {
    return { ...value, recoveryBackup: null };
  }
  function previewImport(value, current, mode, options = {}) {
    if (!['merge', 'replace'].includes(mode)) fail('导入模式不正确');
    object(options, '导入选项');
    if (options.keepRollback !== undefined && typeof options.keepRollback !== 'boolean') fail('保留回退选项必须是布尔值');
    importSize(value);
    const old = validateState(current);
    let incoming, duplicates = 0;
    if (Array.isArray(value)) {
      incoming = emptyState();
      const urls = new Set();
      for (const item of value) {
        object(item, '书签');
        const name = text(item.name, '书签名称', 120).trim();
        const url = normalizeURL(item.url);
        const category = classifyBookmark({ name, url, folder: item.folder });
        if (urls.has(url)) { duplicates++; continue; }
        urls.add(url);
        incoming.sites.push({ id: id(), name, url, group: category, createdAt: new Date().toISOString() });
      }
      incoming = validateState(incoming);
    } else {
      object(value, '备份');
      if (value.app !== '坐井观天' || value.schemaVersion !== 1) fail('不是受支持的坐井观天备份');
      time(value.exportedAt, '导出时间');
      incoming = validateState(value.state);
    }
    let state, rollbackAvailable = null, warning = '';
    if (mode === 'replace') state = withoutRecovery(incoming);
    else {
      state = old;
      const urls = new Set([...state.sites, ...state.trash.map(item => item.site)].map(item => item.url));
      const ids = new Set([...state.sites, ...state.trash.map(item => item.site)].map(item => item.id));
      function add(item, deletedAt) {
        if (urls.has(item.url)) { duplicates++; return; }
        if (ids.has(item.id)) item.id = id();
        ids.add(item.id); urls.add(item.url);
        if (deletedAt) state.trash.push({ site: item, deletedAt });
        else state.sites.push(item);
      }
      incoming.sites.forEach(item => add(item));
      incoming.trash.forEach(item => add(item.site, item.deletedAt));
      const stats = new Map(state.stats.map(item => [`${item.day}\n${item.url}`, item]));
      for (const item of incoming.stats) {
        const key = `${item.day}\n${item.url}`, existing = stats.get(key);
        if (!existing) { stats.set(key, item); continue; }
        existing.count = Math.max(existing.count, item.count);
        if (item.lastAt > existing.lastAt) { existing.lastAt = item.lastAt; existing.name = item.name; }
      }
      state.stats = [...stats.values()];
    }
    state.revision = old.revision;
    if (mode === 'replace') {
      const withRecovery = { ...state, recoveryBackup: withoutRecovery(old) };
      rollbackAvailable = options.keepRollback !== false && stateBytes(withRecovery) <= MAX_STATE_BYTES;
      if (rollbackAvailable) state = withRecovery;
      else warning = '此次替换不保留本机一键回退；请先导出当前数据，再确认替换。';
    }
    state = validateState(state);
    const counts = Object.fromEntries(GROUPS.map(item => [item.id, state.sites.filter(site => site.group === item.id).length]));
    return { state, counts, total: state.sites.length, duplicates, rollbackAvailable, warning };
  }
  function apply(value, command) {
    let state = validateState(value);
    object(command, '操作');
    const result = {}, now = new Date();
    switch (command.type) {
      case 'saveSite': {
        object(command.site, '网站');
        const input = command.site;
        const existing = input.id === undefined ? null : state.sites.find(item => item.id === input.id);
        if (input.id !== undefined && !existing) fail('要编辑的网站不存在');
        const item = site({ ...input, id: existing?.id || id(), createdAt: existing?.createdAt || now.toISOString() });
        if ([...state.sites, ...state.trash.map(item => item.site)].some(other => other.url === item.url && other.id !== item.id)) fail('这个网址已存在，请先检查网站或收纳');
        if (existing) state.sites[state.sites.indexOf(existing)] = item;
        else state.sites.push(item);
        result.site = { ...item };
        break;
      }
      case 'deleteSite': {
        const index = state.sites.findIndex(item => item.id === command.id);
        if (index < 0) fail('要收纳的网站不存在');
        state.trash.push({ site: state.sites.splice(index, 1)[0], deletedAt: now.toISOString() });
        break;
      }
      case 'restoreSite': {
        const index = state.trash.findIndex(item => item.site.id === command.id);
        if (index < 0) fail('要恢复的网站不存在');
        state.sites.push(state.trash.splice(index, 1)[0].site);
        break;
      }
      case 'draft': state.draft = draft(command.draft); break;
      case 'settings': state.settings = settings({ ...state.settings, ...object(command.settings, '设置') }); break;
      case 'click': {
        const item = state.sites.find(item => item.id === command.id);
        if (!item) fail('要打开的网站不存在');
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const stat = state.stats.find(stat => stat.day === date && stat.url === item.url);
        if (stat) { stat.count++; stat.name = item.name; stat.lastAt = now.toISOString(); }
        else state.stats.push({ day: date, url: item.url, name: item.name, count: 1, lastAt: now.toISOString() });
        break;
      }
      case 'resetStats': state.stats = []; break;
      case 'claimOpening': {
        day(command.day);
        result.playOpening = state.lastVisitDay !== command.day && state.settings.openingEnabled;
        state.lastVisitDay = command.day;
        break;
      }
      case 'import': {
        const preview = previewImport(command.value, state, command.mode, { keepRollback: command.keepRollback });
        state = preview.state;
        result.counts = preview.counts; result.total = preview.total; result.duplicates = preview.duplicates;
        result.rollbackAvailable = preview.rollbackAvailable; result.warning = preview.warning;
        break;
      }
      case 'restoreBackup': {
        if (!state.recoveryBackup) fail('没有可回退的替换备份');
        state = withoutRecovery(state.recoveryBackup);
        break;
      }
      default: fail('不支持的操作');
    }
    if (['saveSite', 'deleteSite'].includes(command.type) && command.expectedDraft !== undefined) {
      const expected = draft(command.expectedDraft);
      if (JSON.stringify(state.draft) === JSON.stringify(expected)) state.draft = null;
    }
    state.revision = value.revision + 1;
    // ponytail: full-state validation and linear click lookup; index stats only if real history makes this slow.
    return { state: validateState(state), result };
  }
  const api = { GROUPS, MAX_IMPORT_BYTES, MAX_STATE_BYTES, emptyState, validateState, normalizeURL, classifyBookmark, flattenBookmarks, previewImport, apply };
  root.SkyCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
