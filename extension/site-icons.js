(function (root) {
  'use strict';

  const ASSETS = 'assets/site-icons/';
  const POSES = ['lie', 'lean', 'hug'];
  const KNOWN = [
    { domains: ['youtube.com', 'youtu.be'], name: 'youtube', pose: 'lie' },
    { domains: ['bilibili.com', 'b23.tv'], name: 'bilibili', pose: 'lean' },
    { domains: ['github.com'], name: 'github', pose: 'hug' }
  ];
  // A self-contained fallback; it never reveals the site's URL to another service.
  const GENERIC = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="#292722" stroke-width="2.5"/><path d="M4 16h24M16 4c-5 5-5 19 0 24M16 4c5 5 5 19 0 24" fill="none" stroke="#292722" stroke-width="2"/></svg>');

  function siteInfo(value) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      const known = KNOWN.find(item => item.domains.some(domain => host === domain || host.endsWith('.' + domain))) || null;
      let hash = 2166136261;
      for (const char of host) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
      return { url: url.href, origin: url.origin, host, name: known?.name || '', pose: known?.pose || POSES[hash % POSES.length] };
    } catch { return null; }
  }
  function sameBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function directIconURL(value) {
    const info = siteInfo(value);
    return info ? new URL('/favicon.ico', info.origin).href : null;
  }
  function extensionURL(path) {
    try {
      const url = root.chrome?.runtime?.getURL?.(path);
      return typeof url === 'string' && url.startsWith('chrome-extension://') ? url : '';
    } catch { return ''; }
  }
  function iconRequest(pageURL) {
    const base = extensionURL('/_favicon/');
    if (!base) return '';
    const url = new URL(base);
    url.searchParams.set('pageUrl', pageURL);
    url.searchParams.set('size', '32');
    return url.href;
  }
  function asset(name) { return extensionURL(ASSETS + name) || ASSETS + name; }
  function personalInfo(id) {
    const table = root.SkyPersonalIcons;
    if (typeof id !== 'string' || !table || !Object.prototype.hasOwnProperty.call(table, id)) return null;
    const entry = table[id];
    if (!entry || typeof entry.image !== 'string' || !/^[a-z0-9_-]{1,100}\.(?:png|webp)$/i.test(entry.image) || typeof entry.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(entry.fingerprint)) return null;
    const pose = POSES.includes(entry.pose) ? entry.pose : '';
    const box = Array.isArray(entry.box) && entry.box.length === 4 && entry.box.every(n => Number.isFinite(n) && n >= 0 && n <= 100) && entry.box[2] > 0 && entry.box[3] > 0 && entry.box[0] + entry.box[2] <= 100 && entry.box[1] + entry.box[3] <= 100 ? entry.box : null;
    const logo = typeof entry.logo === 'string' && /^[a-z0-9_-]{1,100}\.(?:ico|png|webp)$/i.test(entry.logo) ? entry.logo : '';
    const plate = entry.plate === 'dark' ? 'dark' : '';
    return { image: entry.image, pose, box, fingerprint: entry.fingerprint, logo, plate, skipDirect: entry.skipDirect === true };
  }
  function actionInfo(entry) {
    if (!entry || typeof entry.image !== 'string' || !/^[a-z0-9_-]{1,100}\.(?:png|webp)$/i.test(entry.image) || !POSES.includes(entry.pose)) return null;
    const builtin = entry.builtin === true;
    if (builtin && entry.image !== 'simple-' + entry.pose + '.png') return null;
    const box = Array.isArray(entry.box) && entry.box.length === 4 && entry.box.every(n => Number.isFinite(n) && n >= 0 && n <= 100) && entry.box[2] > 0 && entry.box[3] > 0 && entry.box[0] + entry.box[2] <= 100 && entry.box[1] + entry.box[3] <= 100 ? entry.box : null;
    return { image: entry.image, pose: entry.pose, box, builtin };
  }
  async function samePersonalSite(info, expected) {
    try {
      if (!root.crypto?.subtle || typeof root.TextEncoder !== 'function') return false;
      const url = new URL(info.url), input = new root.TextEncoder().encode(url.origin + url.pathname);
      const digest = await root.crypto.subtle.digest('SHA-256', input);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') === expected;
    } catch { return false; }
  }
  async function bytes(url) {
    if (!url || typeof root.fetch !== 'function') return null;
    try {
      const response = await root.fetch(url);
      if (!response.ok) return null;
      const data = new Uint8Array(await response.arrayBuffer());
      return data.length && data.length <= 1024 * 1024 ? data : null;
    } catch { return null; }
  }
  function imageHasVisiblePixels(url) {
    try {
      if (!url || typeof root.Image !== 'function' || !root.document?.createElement) return Promise.resolve(false);
      const canvas = root.document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const context = canvas.getContext?.('2d', { willReadFrequently: true });
      if (!context?.drawImage || !context?.getImageData) return Promise.resolve(false);
      return new Promise(resolve => {
        let image;
        try { image = new root.Image(); } catch { resolve(false); return; }
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          root.clearTimeout(timer);
          image.onload = image.onerror = null;
          if (!value) image.removeAttribute?.('src');
          resolve(value);
        };
        const timer = root.setTimeout(() => finish(false), 5000);
        image.onload = () => {
          try {
            if (!image.naturalWidth || !image.naturalHeight) { finish(false); return; }
            context.drawImage(image, 0, 0, 32, 32);
            const pixels = context.getImageData(0, 0, 32, 32).data;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) { finish(true); return; }
          } catch {}
          finish(false);
        };
        image.onerror = () => finish(false);
        try { image.src = url; } catch { finish(false); }
      });
    } catch { return Promise.resolve(false); }
  }
  let defaultIconPromise;
  let defaultIconRetryAfter = 0;
  function defaultIcon() {
    if (!defaultIconPromise && Date.now() >= defaultIconRetryAfter) {
      // shortcut: comparing a reserved host's default is heuristic; use an official cache-hit API if one appears.
      const random = root.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
      defaultIconPromise = bytes(iconRequest(`https://${random}.invalid/`)).then(result => {
        if (!result) { defaultIconRetryAfter = Date.now() + 30000; defaultIconPromise = null; }
        return result;
      });
    }
    return defaultIconPromise || Promise.resolve(null);
  }
  const directCache = new Map();
  const discoveryCache = new Map();
  const resultCache = new Map();
  const queue = [];
  let active = 0;
  function pump() {
    while (active < 4 && queue.length) {
      active++;
      queue.shift()().finally(() => { active--; pump(); });
    }
  }
  function enqueue(task) {
    return new Promise(resolve => {
      queue.push(async () => { try { resolve(await task()); } catch { resolve(null); } });
      pump();
    });
  }
  async function originAllowed(info) {
    try {
      const url = new URL(info.origin);
      return await root.chrome.permissions.contains({ origins: [`${url.protocol}//${url.hostname}/*`] });
    } catch { return false; }
  }
  async function limitedFetch(url, origin, limit, wantImage) {
    const controller = new root.AbortController();
    const timer = root.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await root.fetch(url, {
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'manual', signal: controller.signal
      });
      if (!response.ok || response.redirected || response.type === 'opaqueredirect') return null;
      if (response.url && new URL(response.url).origin !== origin) return null;
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (wantImage && contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') return null;
      if (!wantImage && contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)) return null;
      const declared = Number(response.headers.get('content-length'));
      if (declared > limit) return null;
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks = [];
      let length = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > limit) { controller.abort(); reader.cancel().catch(() => {}); return null; }
        chunks.push(part.value);
      }
      if (!length) return null;
      return { blob: new root.Blob(chunks, { type: contentType || (wantImage ? 'image/x-icon' : 'text/html') }), contentType };
    } catch { return null; }
    finally { controller.abort(); root.clearTimeout(timer); }
  }
  function declaredIcons(html, origin) {
    // A detached template remains inert; no fetched document nodes enter the live page.
    const template = root.document.createElement('template');
    template.innerHTML = html;
    const result = [];
    for (const link of template.content.querySelectorAll('link[rel][href]')) {
      if (!link.getAttribute('rel').toLowerCase().split(/\s+/).includes('icon')) continue;
      const value = link.getAttribute('href');
      if (!value || value.length > 4096) continue;
      try {
        const url = new URL(value, origin + '/');
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== origin) continue;
        url.hash = '';
        if (!result.includes(url.href)) result.push(url.href);
      } catch {}
      if (result.length === 16) break;
    }
    return result;
  }
  async function imageDataURL(blob) {
    const value = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < value.length; i += 8192) binary += String.fromCharCode(...value.subarray(i, i + 8192));
    return `data:${blob.type};base64,${root.btoa(binary)}`;
  }
  function discoverIcon(info) {
    if (!discoveryCache.has(info.origin)) discoveryCache.set(info.origin, enqueue(async () => {
      const page = await limitedFetch(info.origin + '/', info.origin, 512 * 1024, false);
      const icons = page ? declaredIcons(await page.blob.text(), info.origin) : [];
      const conventional = directIconURL(info.url);
      if (conventional && !icons.includes(conventional)) icons.push(conventional);
      for (const icon of icons) {
        const data = await limitedFetch(icon, info.origin, 256 * 1024, true);
        if (!data) continue;
        // Data lives only in this page's memory and is released naturally after a refresh.
        const imageURL = await imageDataURL(data.blob);
        if (await imageHasVisiblePixels(imageURL)) return imageURL;
      }
      return null;
    }));
    return discoveryCache.get(info.origin);
  }
  function tryDirect(url) {
    if (!directCache.has(url)) {
      directCache.set(url, new Promise(resolve => {
        queue.push(async () => {
          if (typeof root.Image !== 'function') { resolve(false); return; }
          await new Promise(done => {
            let image;
            try { image = new root.Image(); } catch { resolve(false); done(); return; }
            let settled = false;
            const finish = value => {
              if (settled) return;
              settled = true;
              root.clearTimeout(timer);
              image.onload = image.onerror = null;
              if (!value) image.removeAttribute?.('src');
              resolve(value);
              // Give the browser a moment to close canceled network requests before opening a new slot.
              if (value) done(); else root.setTimeout(done, 250);
            };
            const timer = root.setTimeout(() => finish(false), 5000);
            image.referrerPolicy = 'no-referrer';
            image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
            image.onerror = () => finish(false);
            try { image.src = url; } catch { finish(false); }
          });
        });
        pump();
      }));
    }
    return directCache.get(url);
  }
  async function chooseIcon(info, skipDirect = false) {
    const fallback = info.name ? asset(info.name + '.svg') : GENERIC;
    // In previews, tests and other browsers, use only packaged assets; never contact sites.
    if (!extensionURL('/_favicon/')) return { url: fallback, source: info.name ? 'packaged' : 'generic' };
    const faviconURL = iconRequest(info.url);
    const reference = await defaultIcon();
    // When Chrome's reference cannot be read, do not guess a miss and contact every site.
    if (!reference) return { url: fallback, source: info.name ? 'packaged' : 'generic', retryReference: true };
    const candidate = await bytes(faviconURL);
    if (reference && candidate && !sameBytes(reference, candidate) && await imageHasVisiblePixels(faviconURL)) return { url: faviconURL, source: 'chrome' };
    if (await originAllowed(info)) {
      const discovered = await discoverIcon(info);
      if (discovered) return { url: discovered, source: 'website' };
    } else if (!skipDirect) {
      // Without host permission an image probe may follow the target site's redirects.
      const directURL = directIconURL(info.url);
      if (directURL && await tryDirect(directURL)) return { url: directURL, source: 'website' };
    }
    return { url: fallback, source: info.name ? 'packaged' : 'generic' };
  }
  const pending = new Map();
  const watched = new Map();
  const referenceRetry = new Set();
  let referenceRetryTimer;
  let generation = 0;
  let observer;
  let cleanupObserver;
  let fallbackReady = false;
  let fallbackScheduled = false;
  function personalMatches(task) {
    if (!task.personal) return Promise.resolve(false);
    if (!task.personalMatch) task.personalMatch = samePersonalSite(task.info, task.personal.fingerprint);
    return task.personalMatch;
  }
  async function setPersonalFallback(container, task, expectedGeneration) {
    let source = 'generic', url = GENERIC;
    if (!task.info.name && task.personal?.logo && await personalMatches(task)) {
      const local = asset('personal/' + task.personal.logo);
      if (await imageHasVisiblePixels(local)) { source = 'personal'; url = local; }
    }
    if (!container.isConnected || expectedGeneration !== generation) return;
    task.brand.dataset.source = source;
    task.brand.src = url;
  }
  const personalQueue = [];
  let personalBusy = false;
  function searchAnimating() {
    const search = root.document.querySelector?.('.op-search');
    return search?.getAnimations?.().some(animation => animation.playState === 'running') || false;
  }
  function whenPersonalIdle(callback) {
    const deadline = Date.now() + 3500;
    const waitForMotion = () => Date.now() < deadline && searchAnimating();
    const check = () => {
      if (waitForMotion()) { root.setTimeout(check, 120); return; }
      const run = () => { if (waitForMotion()) check(); else callback(); };
      if (root.requestIdleCallback) root.requestIdleCallback(run, { timeout: 1000 });
      else root.setTimeout(run, 0);
    };
    check();
  }
  function personalVisible(container) {
    if (!container.isConnected || (container.getClientRects && !container.getClientRects().length)) return false;
    if (!container.getBoundingClientRect) return true;
    const rect = container.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < root.innerHeight && rect.left < root.innerWidth;
  }
  function deferPersonal(container, task) {
    delete task.person.dataset.personal;
    if (container.isConnected) deferUntilVisible(container, task);
  }
  function pumpPersonal() {
    if (personalBusy) return;
    // A picker redraw removes old previews; skip their queued idle turns.
    while (personalQueue.length && !personalQueue[0].container.isConnected) personalQueue.shift();
    if (!personalQueue.length) return;
    personalBusy = true;
    whenPersonalIdle(async () => {
      const { container, task } = personalQueue.shift();
      const { person, personal, plate, action } = task;
      try {
        if (!personalVisible(container)) { deferPersonal(container, task); return; }
        if (!action && !await personalMatches(task)) { person.dataset.personal = 'unmatched'; return; }
        if (!personalVisible(container)) { deferPersonal(container, task); return; }
        await new Promise(resolve => whenPersonalIdle(resolve));
        if (!personalVisible(container)) { deferPersonal(container, task); return; }
        person.dataset.personal = 'loading';
        const image = new root.Image();
        image.decoding = 'async';
        const chosen = action || personal;
        image.src = asset((chosen.builtin ? '' : 'personal/') + chosen.image);
        if (typeof image.decode === 'function') await image.decode();
        else await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          if (image.complete) image.naturalWidth ? resolve() : reject();
        });
        await new Promise(resolve => whenPersonalIdle(resolve));
        if (!personalVisible(container)) { deferPersonal(container, task); return; }
        person.src = image.src;
        person.dataset.personal = 'loaded';
        if (personal?.plate === 'dark' && await personalMatches(task) && container.isConnected) plate.dataset.tone = 'dark';
        if (chosen.pose) container.className = container.className.replace(/\bpose-(lie|lean|hug)\b/, 'pose-' + chosen.pose);
        if (chosen.box) ['left', 'top', 'width', 'height'].forEach((key, i) => { plate.style[key] = chosen.box[i] + '%'; });
      } catch (_) {
        person.dataset.personal = 'failed';
      } finally {
        personalBusy = false;
        pumpPersonal();
      }
    });
  }
  function loadPersonal(container, task) {
    const { person, personal, action } = task;
    if ((!personal && !action) || person.dataset.personal) return;
    person.dataset.personal = 'queued';
    if (task.priority) personalQueue.unshift({ container, task });
    else personalQueue.push({ container, task });
    pumpPersonal();
  }
  function startIcon(container) {
    const task = pending.get(container);
    if (!task) return;
    pending.delete(container);
    if (task.suppressPersonal) {
      if (task.personal?.plate === 'dark') personalMatches(task).then(matches => {
        if (matches && container.isConnected) task.plate.dataset.tone = 'dark';
      }).catch(() => {});
    } else loadPersonal(container, task);
    if (!extensionURL('/_favicon/')) {
      if (task.personal?.logo && !task.info.name) setPersonalFallback(container, task, generation);
      return;
    }
    const currentGeneration = generation;
    const selected = task.personal?.skipDirect ? personalMatches(task) : Promise.resolve(false);
    selected.then(skipDirect => {
      if (!container.isConnected || currentGeneration !== generation) return null;
      const cacheKey = task.info.url + (skipDirect ? '\nno-direct' : '');
      if (!resultCache.has(cacheKey)) {
        const job = chooseIcon(task.info, skipDirect).then(result => {
          if (result.retryReference && resultCache.get(cacheKey) === job) resultCache.delete(cacheKey);
          return result;
        });
        resultCache.set(cacheKey, job);
      }
      return resultCache.get(cacheKey);
    }).then(async result => {
      if (!result) return;
      if (!container.isConnected || currentGeneration !== generation) return;
      if (result.source === 'generic' && task.personal?.logo) await setPersonalFallback(container, task, currentGeneration);
      else { task.brand.dataset.source = result.source; task.brand.src = result.url; }
      if (!container.isConnected || currentGeneration !== generation) return;
      if (result.retryReference) {
        referenceRetry.add(container);
        if (!referenceRetryTimer) referenceRetryTimer = root.setTimeout(() => {
          referenceRetryTimer = null;
          for (const target of referenceRetry) {
            const next = watched.get(target);
            if (target.isConnected && next) deferUntilVisible(target, next);
          }
          referenceRetry.clear();
        }, Math.max(1, defaultIconRetryAfter - Date.now()));
      }
    }).catch(() => {});
  }
  function scanVisible() {
    fallbackScheduled = false;
    for (const container of pending.keys()) {
      if (!container.isConnected) { pending.delete(container); continue; }
      if (!container.getClientRects?.().length) continue;
      const rect = container.getBoundingClientRect();
      if (rect.bottom > 0 && rect.right > 0 && rect.top < root.innerHeight && rect.left < root.innerWidth) startIcon(container);
    }
  }
  function scheduleScan() {
    if (fallbackScheduled) return;
    fallbackScheduled = true;
    if (root.requestAnimationFrame) root.requestAnimationFrame(scanVisible);
    else root.setTimeout(scanVisible, 0);
  }
  function deferUntilVisible(container, task) {
    pending.set(container, task);
    if (!cleanupObserver && typeof root.MutationObserver === 'function' && root.document.documentElement) {
      cleanupObserver = new root.MutationObserver(() => {
        for (const element of watched.keys()) if (!element.isConnected) { watched.delete(element); referenceRetry.delete(element); }
        for (const element of pending.keys()) if (!element.isConnected) {
          observer?.unobserve(element);
          pending.delete(element);
        }
        if (!observer) scheduleScan();
      });
      cleanupObserver.observe(root.document.documentElement, { childList: true, subtree: true });
    }
    if (typeof root.IntersectionObserver === 'function') {
      if (!observer) observer = new root.IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.target.isConnected) { observer.unobserve(entry.target); pending.delete(entry.target); }
          else if (entry.isIntersecting) { observer.unobserve(entry.target); startIcon(entry.target); }
        }
      });
      observer.observe(container);
    } else {
      // Older engines: inspect only visible boxes on the next frame and after UI movement.
      if (!fallbackReady && root.addEventListener) {
        fallbackReady = true;
        for (const event of ['scroll', 'resize', 'transitionend']) root.addEventListener(event, scheduleScan, true);
      }
      scheduleScan();
    }
  }
  function create(siteUrl, siteId, options = {}) {
    const info = siteInfo(siteUrl);
    const personal = personalInfo(siteId);
    const action = actionInfo(options.action);
    const container = root.document.createElement('span');
    container.className = 'site-icon pose-' + (info?.pose || 'lie') + (info?.name ? ' known-' + info.name : '');
    container.setAttribute('aria-hidden', 'true');
    const plate = root.document.createElement('span');
    plate.className = 'site-icon-brand-plate';
    const brand = root.document.createElement('img');
    brand.className = 'site-icon-brand';
    brand.alt = '';
    brand.referrerPolicy = 'no-referrer';
    brand.src = info?.name ? asset(info.name + '.svg') : GENERIC;
    brand.dataset.source = info?.name ? 'packaged' : 'generic';
    let task;
    brand.onerror = () => {
      if (info?.name && brand.dataset.source !== 'packaged' && brand.dataset.source !== 'generic') {
        brand.dataset.source = 'packaged';
        brand.src = asset(info.name + '.svg');
      } else if (task && !info?.name && ['chrome','website'].includes(brand.dataset.source)) {
        setPersonalFallback(container, task, generation);
      } else {
        brand.onerror = null;
        brand.dataset.source = 'generic';
        brand.src = GENERIC;
      }
    };
    plate.appendChild(brand);
    const person = root.document.createElement('img');
    person.className = 'site-icon-person';
    person.alt = '';
    person.src = asset('simple-' + (info?.pose || 'lie') + '.png');
    container.appendChild(plate);
    container.appendChild(person);
    if (info && (action || personal || extensionURL('/_favicon/'))) {
      task = { info, brand, person, plate, personal, action, priority: options.priority === true, suppressPersonal: options.character === false && !action };
      watched.set(container, task);
      deferUntilVisible(container, task);
    }
    return container;
  }
  function refresh() {
    generation++;
    if (referenceRetryTimer) root.clearTimeout(referenceRetryTimer);
    referenceRetryTimer = null;
    referenceRetry.clear();
    resultCache.clear();
    directCache.clear();
    discoveryCache.clear();
    for (const [container, task] of watched) {
      if (container.isConnected) deferUntilVisible(container, task);
      else watched.delete(container);
    }
  }
  const api = Object.freeze({ create, refresh, siteInfo, sameBytes, directIconURL });
  root.SkySiteIcons = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
