(function (root) {
  'use strict';

  const POSES = ['lie', 'lean', 'hug'];
  const DEFAULT_BOX = { lie: [12, 41, 76, 45], lean: [43, 37, 53, 48], hug: [31, 53, 48, 45] };
  const RULES = [
    ['watch', /视频|影音|电影|动漫|直播|video|movie|anime|youtube|bilibili|vimeo|twitch/i],
    ['guitar', /吉他|音乐|音频|乐谱|guitar|music|audio|songsterr|spotify/i],
    ['create', /创作|绘画|设计|生成|人工智能|\bai\b|chatgpt|claude|gemini|deepseek|creative|design/i],
    ['learn', /学习|教程|课程|大学|课堂|图书馆|论文|learn|course|tutorial|docs|wiki/i],
    ['collect', /资源|素材|收藏|网盘|下载|resource|asset|download|github|drive/i],
    ['social', /社区|论坛|聊天|社交|social|forum|community|reddit/i],
    ['tools', /工具|搜索|翻译|邮箱|办公|tool|search|mail|translate|maps/i]
  ];
  const BUILTIN = [
    { id: 'simple-lie.png', image: 'simple-lie.png', pose: 'lie', box: DEFAULT_BOX.lie, builtin: true },
    { id: 'simple-lean.png', image: 'simple-lean.png', pose: 'lean', box: DEFAULT_BOX.lean, builtin: true },
    { id: 'simple-hug.png', image: 'simple-hug.png', pose: 'hug', box: DEFAULT_BOX.hug, builtin: true }
  ];
  function safeBox(value, pose) {
    if (Array.isArray(value) && value.length === 4 && value.every(n => Number.isFinite(n) && n >= 0 && n <= 100) && value[2] > 0 && value[3] > 0 && value[0] + value[2] <= 100 && value[1] + value[3] <= 100) return [...value];
    return [...DEFAULT_BOX[pose]];
  }
  function safeName(value) { return typeof value === 'string' && /^[a-z0-9_-]{1,100}\.(?:png|webp)$/i.test(value); }
  function hostOf(value) {
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.hostname.toLowerCase().replace(/\.$/, '') : ''; }
    catch { return ''; }
  }
  function category(value) {
    const text = [value?.name || '', value?.url || ''].join(' ');
    return RULES.find(([, rule]) => rule.test(text))?.[0] || '';
  }
  function catalog(sites = []) {
    const output = BUILTIN.map(action => ({ ...action, box: [...action.box], groups: [] }));
    const byImage = new Map(output.map(action => [action.id, action]));
    const source = new Map((Array.isArray(sites) ? sites : []).filter(site => site && typeof site.id === 'string').map(site => [site.id, site]));
    const table = root.SkyPersonalIcons;
    if (!table || typeof table !== 'object' || Array.isArray(table)) return output;
    for (const [siteId, entry] of Object.entries(table)) {
      if (!entry || !safeName(entry.image) || BUILTIN.some(item => item.image === entry.image)) continue;
      const pose = POSES.includes(entry.pose) ? entry.pose : 'lie';
      let item = byImage.get(entry.image);
      if (!item) {
        item = { id: entry.image, image: entry.image, pose, box: safeBox(entry.box, pose), builtin: false, groups: [] };
        byImage.set(item.id, item); output.push(item);
      }
      const src = source.get(siteId), tags = [src?.group, category(src)].filter(Boolean);
      for (const tag of tags) if (!item.groups.includes(tag)) item.groups.push(tag);
    }
    return output;
  }
  function resolve(actionId, sites = []) { return catalog(sites).find(item => item.id === actionId) || null; }
  async function current(site, state) {
    const sites = Array.isArray(state?.sites) ? state.sites : [];
    let saved;
    try { saved = root.SkyCore?.iconActionFor?.(state, site); } catch { saved = null; }
    if (saved && resolve(saved, sites)) return saved;
    const entry = site?.id && root.SkyPersonalIcons?.[site.id];
    if (entry && safeName(entry.image) && typeof entry.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(entry.fingerprint)) {
      try {
        const url = new URL(site.url);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && root.crypto?.subtle && root.TextEncoder) {
          const bytes = new root.TextEncoder().encode(url.origin + url.pathname);
          const digest = await root.crypto.subtle.digest('SHA-256', bytes);
          const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          if (fingerprint === entry.fingerprint && resolve(entry.image, sites)) return entry.image;
        }
      } catch { /* An unavailable digest or invalid URL keeps the default action. */ }
    }
    const pose = root.SkySiteIcons?.siteInfo?.(site?.url)?.pose;
    return POSES.includes(pose) ? 'simple-' + pose + '.png' : 'simple-lie.png';
  }
  function recommend(site, sites = []) {
    const items = catalog(sites), host = hostOf(site?.url), group = site?.group || category(site), table = root.SkyPersonalIcons || {};
    const owners = new Map((Array.isArray(sites) ? sites : []).filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
    const matching = new Set();
    if (host) for (const [ownerId, entry] of Object.entries(table)) {
      const owner = owners.get(ownerId);
      if (owner && hostOf(owner.url) === host && safeName(entry?.image)) matching.add(entry.image);
    }
    const builtinForGroup = { watch: 'simple-lie.png', guitar: 'simple-lean.png', create: 'simple-hug.png', tools: 'simple-lean.png', learn: 'simple-lean.png', collect: 'simple-hug.png', social: 'simple-lie.png' };
    const preferred = builtinForGroup[group] || 'simple-lie.png';
    return items.map((item, index) => ({ item, index, score: (matching.has(item.id) ? 100 : 0) + (group && item.groups.includes(group) ? 20 : 0) + (item.id === preferred ? 5 : 0) + (item.builtin ? 2 : 0) }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4).map(value => value.item);
  }
  function renderIcon(url, action, siteId) {
    const valid = action && safeName(action.image) && POSES.includes(action.pose);
    const icon = root.SkySiteIcons?.create?.(url || '', siteId, valid ? { action } : { character: false }) || root.document.createElement('span');
    icon.classList.add('sky-action-icon');
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  function mount(container, options = {}) {
    let site = options.site || {}, sites = options.sites || [], selected = options.selected || '', expanded = false, buttons = [];
    const select = id => {
      selected = id;
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.action === selected));
      options.onSelect?.(id);
    };
    function makeGrid(actions, label) {
      const group = root.document.createElement('div'); group.className = 'sky-actions-grid'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
      actions.forEach((action, index) => {
        const button = root.document.createElement('button'); button.type = 'button'; button.className = 'sky-action-choice'; button.dataset.action = action.id;
        button.setAttribute('aria-label', `选择动作 ${index + 1}`); button.setAttribute('aria-pressed', String(action.id === selected));
        button.append(renderIcon(site.url, action, site.id));
        button.addEventListener('click', () => select(action.id)); buttons.push(button); group.append(button);
      });
      return group;
    }
    function draw() {
      const focused = container.contains(root.document.activeElement) ? root.document.activeElement : null;
      const focusedAction = focused?.dataset?.action || '';
      const focusedAll = !!focused?.closest?.('.sky-actions-all');
      const focusedToggle = !!focused?.classList?.contains('sky-actions-toggle');
      const scrollTop = container.querySelector('.sky-actions-all')?.scrollTop || 0;
      buttons = []; container.replaceChildren(); container.classList.add('sky-action-picker');
      const heading = root.document.createElement('p'); heading.className = 'sky-actions-heading'; heading.textContent = '推荐动作';
      const suggestions = recommend(site, sites), chosen = resolve(selected, sites);
      if (chosen && !suggestions.some(action => action.id === chosen.id)) {
        if (suggestions.length >= 4) suggestions[suggestions.length - 1] = chosen;
        else suggestions.push(chosen);
      }
      container.append(heading, makeGrid(suggestions, '推荐动作'));
      const toggle = root.document.createElement('button'); toggle.type = 'button'; toggle.className = 'sky-actions-toggle'; toggle.textContent = expanded ? '收起全部动作' : '查看全部动作'; toggle.setAttribute('aria-expanded', String(expanded));
      toggle.addEventListener('click', () => { expanded = !expanded; draw(); container.querySelector('.sky-actions-toggle')?.focus(); });
      container.append(toggle);
      if (expanded) {
        const all = root.document.createElement('div'); all.className = 'sky-actions-all'; all.append(makeGrid(catalog(sites), '全部动作')); container.append(all);
        all.scrollTop = scrollTop;
      }
      if (focusedToggle) container.querySelector('.sky-actions-toggle')?.focus({ preventScroll: true });
      else if (focusedAction) {
        const target = buttons.find(button => button.dataset.action === focusedAction && !!button.closest('.sky-actions-all') === focusedAll);
        target?.focus({ preventScroll: true });
      }
    }
    draw();
    return {
      update(next = {}) { if ('site' in next) site = next.site || {}; if ('sites' in next) sites = next.sites || []; if ('selected' in next) selected = next.selected || ''; draw(); },
      destroy() { buttons = []; container.replaceChildren(); container.classList.remove('sky-action-picker'); }
    };
  }
  const api = Object.freeze({ catalog, resolve, current, recommend, renderIcon, mount });
  root.SkyActions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
