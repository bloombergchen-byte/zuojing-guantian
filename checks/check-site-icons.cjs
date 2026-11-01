const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const code = fs.readFileSync(path.join(__dirname, '../extension/site-icons.js'), 'utf8');

function fixture({ extension = true, directSucceeds = true, supportsObserver = true, permission = false, personal = {}, supportsCrypto = true, supportsCanvas = true, cachedAlpha = 255, cachedDecodes = true, canvasThrows = false, transparentConventional = false, websiteAlpha = null, localLogoSucceeds = true,
  links = [], failWebsite = false, referenceFailure = false, hanging = false, oversized = '', manualPersonalDecode = false } = {}) {
  const requests = [];
  const localRequests = [];
  const decodes = [];
  let animationActive = false;
  const faviconRequests = [];
  const websiteFetches = [];
  let removed = 0;
  let canceled = 0;
  let now = Date.now();
  const retryTimers = [];
  const events = {};
  let intersectionObserver;
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.isConnected = true;
      if (tag === 'template') this.content = { querySelectorAll: () => links.map(item => ({ getAttribute: name => item[name] || '' })) };
      if (tag === 'canvas') this.getContext = () => {
        if (!supportsCanvas) return null;
        let image;
        return { drawImage: value => { image=value; }, getImageData: () => {
          if (canvasThrows) throw new Error('canvas unavailable');
          const source=image?.currentSrc||'';
          const alpha=source.startsWith('data:') ? (websiteAlpha ?? (Buffer.from(source.split(',')[1]||'','base64').toString()==='transparent image'?0:255)) : cachedAlpha;
          return { data: Uint8Array.from([0,0,0,alpha]) };
        } };
      };
    }
    setAttribute(name, value) { this[name] = value; }
    appendChild(element) { this.children.push(element); }
    getClientRects() { return this.visible === false ? [] : [{}]; }
    getBoundingClientRect() { return { top: 10, left: 10, bottom: 50, right: 50 }; }
  }
  class Image {
    set src(value) {
      this.currentSrc=value;
      this._src=value;
      if (/^https?:/.test(value)) requests.push({ url: value, referrerPolicy: this.referrerPolicy });
      if (value.includes('/personal/')) localRequests.push(value);
      const success = value.includes('/personal/') ? localLogoSucceeds && !value.includes('/missing.webp') : value.startsWith('chrome-extension:') ? cachedDecodes : directSucceeds;
      this.naturalWidth = this.naturalHeight = success ? 32 : 0;
      if (!hanging || value.startsWith('data:')) queueMicrotask(() => success ? this.onload?.() : this.onerror?.());
    }
    get src() { return this._src; }
    get decode() {
      if (!manualPersonalDecode || !/\/personal\/.*\.(png|webp)$/.test(this._src || '')) return undefined;
      return () => new Promise((resolve, reject) => decodes.push({ resolve, reject }));
    }
    removeAttribute(name) { if (name === 'src') removed++; }
  }
  function response(url, type, data, ok = true, declared = null) {
    let done = false;
    const value = Buffer.from(data);
    return { ok, url, headers: { get: key => key === 'content-type' ? type : key === 'content-length' ? declared : null },
      body: { getReader: () => ({ read: async () => done ? { done: true } : (done = true, { done: false, value }), cancel: async () => { canceled++; } }) } };
  }
  const root = {
    URL, Uint8Array, Math, Promise, Blob, AbortController, TextEncoder, encodeURIComponent, Date: { now: () => now }, SkyPersonalIcons: personal,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: (fn, ms) => ms >= 29000 ? (retryTimers.push(fn), 42) : setTimeout(fn, hanging && (ms === 5000 || ms === 250) ? 5 : ms),
    clearTimeout: id => { if (id !== 42) clearTimeout(id); }, Image, innerWidth: 800, innerHeight: 600,
    requestAnimationFrame: callback => queueMicrotask(callback),
    addEventListener: (name, callback) => { events[name] = callback; },
    document: { createElement: tag => new Element(tag), querySelector: () => ({ getAnimations: () => animationActive ? [{ playState: 'running' }] : [] }) },
    crypto: { randomUUID: () => 'probe-1', ...(supportsCrypto ? { subtle: crypto.webcrypto.subtle } : {}) },
    fetch: async (url, options) => {
      if (!url.startsWith('chrome-extension:')) {
        websiteFetches.push({ url, options });
        if (failWebsite) return response(url, 'text/html', '', false);
        if (url.endsWith('/') && oversized) return response(url, 'text/html', Buffer.alloc(512 * 1024 + 1), true, oversized === 'declared' ? String(512 * 1024 + 1) : null);
        return url.endsWith('/') ? response(url, 'text/html', '<html>inert</html>') : response(url, 'image/png', url.endsWith('/transparent.png') || (transparentConventional && url.endsWith('/favicon.ico')) ? 'transparent image' : 'valid image');
      }
      const page = new URL(url).searchParams.get('pageUrl');
      faviconRequests.push(page);
      if (referenceFailure && page.includes('.invalid/')) return { ok: false };
      const data = new URL(page).hostname === 'cached.example' ? [3, 4, 5] : [1, 2, 3];
      return { ok: true, arrayBuffer: async () => Uint8Array.from(data).buffer };
    }
  };
  if (supportsObserver) root.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; intersectionObserver = this; }
    observe(target) { queueMicrotask(() => { if (target.visible !== false) this.callback([{ target, isIntersecting: true }]); }); }
    unobserve() {}
    reveal(target) { this.callback([{ target, isIntersecting: true }]); }
  };
  if (extension) root.chrome = { runtime: { getURL: value => 'chrome-extension://abc/' + value.replace(/^\//, '') },
    permissions: { contains: async () => permission } };
  vm.runInNewContext(code, root);
  return { api: root.SkySiteIcons, requests, localRequests, faviconRequests, websiteFetches, removed: () => removed, canceled: () => canceled,
    grant: () => { permission = true; }, recoverReference: () => { referenceFailure = false; now += 30001; retryTimers.splice(0).forEach(fn => fn()); },
    reveal: target => intersectionObserver.reveal(target), trigger: name => events[name]?.(), decodes, animate: value => { animationActive = value; }, advance: ms => { now += ms; } };
}
const wait = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms));
const brandOf = icon => icon.children[0].children[0];

(async () => {
  const { api } = fixture({ extension: false });
  assert.equal(api.siteInfo('https://m.youtube.com/watch?v=x').pose, 'lie');
  assert.equal(api.siteInfo('https://github.com/').pose, 'hug');
  assert.equal(api.siteInfo('https://bilibili.com.evil.test/').name, '');
  assert.equal(api.siteInfo('https://user:pass@example.com/'), null);
  assert.equal(api.siteInfo('javascript:alert(1)'), null);
  assert.equal(api.directIconURL('https://example.com/a?private=secret'), 'https://example.com/favicon.ico');
  assert.equal(api.siteInfo('https://same.example/a').pose, api.siteInfo('https://same.example/b').pose);
  assert.equal(api.sameBytes(Uint8Array.from([1, 2]), Uint8Array.from([1, 2])), true);
  assert.equal(api.sameBytes(Uint8Array.from([1, 2]), Uint8Array.from([1, 3])), false);

  const preview = fixture({ extension: false });
  const localIcon = preview.api.create('https://youtube.com/watch');
  await wait();
  assert.equal(preview.requests.length, 0, 'ordinary preview must not contact any site');
  assert.equal(preview.faviconRequests.length, 0);
  assert.equal(brandOf(localIcon).dataset.source, 'packaged');
  assert.equal(localIcon['aria-hidden'], 'true');
  assert.match(localIcon.className, /pose-lie known-youtube/);

  const fingerprint = crypto.createHash('sha256').update('https://example.test/','utf8').digest('hex');
  const privatePreview = fixture({ extension: false, personal: {
    'synthetic-site': { image: 'opaque-1.png', pose: 'hug', box: [20, 30, 50, 40], fingerprint },
    'broken-site': { image: 'missing.webp', pose: 'lean', plate: 'dark', box: [10, 10, 50, 50], fingerprint },
    'unsafe-site': { image: '../../private.png', pose: 'hug', fingerprint },
    'legacy-site': { image: 'legacy.png', pose: 'hug' }
  } });
  const privateIcon = privatePreview.api.create('https://example.test/', 'synthetic-site');
  const privatePerson = privateIcon.children[1], privatePlate = privateIcon.children[0];
  privateIcon.visible = false;
  await wait();
  assert.doesNotMatch(privatePerson.src, /personal\//, 'a hidden personal image must not load');
  privateIcon.visible = true;
  privatePreview.reveal(privateIcon);
  await wait();
  assert.match(privatePerson.src, /personal\/opaque-1\.png$/);
  assert.match(privateIcon.className, /pose-hug/);
  assert.deepEqual([privatePlate.style.left,privatePlate.style.top,privatePlate.style.width,privatePlate.style.height],['20%','30%','50%','40%']);
  const brokenIcon = privatePreview.api.create('https://example.test/', 'broken-site');
  await wait();
  const brokenPerson = brokenIcon.children[1],originalClass = brokenIcon.className;
  assert.equal(brokenPerson.dataset.personal, 'failed');
  assert.equal(brokenIcon.children[0].dataset.tone, undefined, 'a failed personal image must not leave a dark plate');
  assert.match(brokenPerson.src, /simple-(lie|lean|hug)\.png$/);
  assert.equal(brokenIcon.className, originalClass, 'failed personal image keeps original composition');
  const unsafeIcon = privatePreview.api.create('https://example.test/', 'unsafe-site');
  await wait();
  assert.doesNotMatch(unsafeIcon.children[1].src, /personal\//, 'personal image path traversal is rejected');
  const changedDomain = privatePreview.api.create('https://other.example/', 'synthetic-site');
  const changedPath = privatePreview.api.create('https://example.test/another', 'synthetic-site');
  const changedQuery = privatePreview.api.create('https://example.test/?q=updated#fragment', 'synthetic-site');
  const normalizedURL = privatePreview.api.create('https://EXAMPLE.test:443/a/../?q=updated#fragment', 'synthetic-site');
  const legacyIcon = privatePreview.api.create('https://example.test/', 'legacy-site');
  await wait();
  assert.doesNotMatch(changedDomain.children[1].src, /personal\//, 'same ID with a changed domain must not inherit art');
  assert.doesNotMatch(changedPath.children[1].src, /personal\//, 'same ID with a changed path must not inherit art');
  assert.match(changedQuery.children[1].src, /personal\/opaque-1\.png$/, 'query and fragment changes retain art');
  assert.match(normalizedURL.children[1].src, /personal\/opaque-1\.png$/, 'URL normalization is shared with the mapping fingerprint');
  assert.doesNotMatch(legacyIcon.children[1].src, /personal\//, 'legacy entries without a fingerprint safely fall back');
  const noCrypto = fixture({ extension: false, supportsCrypto: false, personal: { 'synthetic-site': { image: 'opaque-1.png', fingerprint } } });
  const unsupportedIcon = noCrypto.api.create('https://example.test/', 'synthetic-site');
  await wait();
  assert.doesNotMatch(unsupportedIcon.children[1].src, /personal\//, 'no Web Crypto must fall back');
  assert.equal(privatePreview.requests.length, 0, 'local preview must not contact sites when personal icons are used');

  const queued = fixture({ extension: false, manualPersonalDecode: true, personal: {
    one: { image: 'one.png', fingerprint }, two: { image: 'two.png', fingerprint }, three: { image: 'three.png', fingerprint }
  } });
  queued.animate(true);
  const firstQueued = queued.api.create('https://example.test/', 'one');
  const secondQueued = queued.api.create('https://example.test/', 'two');
  await wait();
  assert.equal(queued.localRequests.length, 0, 'search transition must defer starting personal images');
  queued.animate(false);
  await wait(170);
  assert.equal(queued.decodes.length, 1, 'only one personal image may decode at a time');
  assert.match(firstQueued.children[1].src, /simple-/, 'generic character stays visible during decode');
  queued.animate(true);
  queued.decodes[0].resolve();
  await wait();
  assert.match(firstQueued.children[1].src, /simple-/, 'search transition must defer replacement too');
  assert.equal(queued.decodes.length, 1, 'search transition must not start the next decode');
  queued.animate(false);
  await wait(170);
  assert.match(firstQueued.children[1].src, /personal\/one.png$/);
  assert.equal(queued.decodes.length, 2, 'next image starts after previous decode and replacement');
  secondQueued.visible = false;
  queued.decodes[1].resolve();
  await wait();
  assert.match(secondQueued.children[1].src, /simple-/, 'offscreen image must not replace the generic character');
  secondQueued.visible = true;
  queued.reveal(secondQueued);
  await wait();
  assert.equal(queued.decodes.length, 3, 'returning onscreen reschedules its image');
  queued.decodes[2].reject(new Error('bad image'));
  await wait();
  assert.equal(secondQueued.children[1].dataset.personal, 'failed');
  assert.match(secondQueued.children[1].src, /simple-/, 'decode failure keeps the generic character');
  const thirdQueued = queued.api.create('https://example.test/', 'three');
  await wait();
  assert.equal(queued.decodes.length, 4, 'decode failure cannot stall the queue');
  thirdQueued.isConnected = false;
  queued.decodes[3].resolve();
  await wait();
  assert.match(thirdQueued.children[1].src, /simple-/, 'detached row must not be replaced');

  const stuck = fixture({ extension: false, personal: { stuck: { image: 'one.png', fingerprint } } });
  stuck.animate(true);
  const stuckIcon = stuck.api.create('https://example.test/', 'stuck');
  for (let i = 0; i < 4; i++) { await wait(140); stuck.advance(4000); }
  await wait(150);
  assert.equal(stuckIcon.children[1].dataset.personal, 'loaded', 'a permanently running animation must not block icons indefinitely');

  const localEntry = { image: 'opaque-1.png', fingerprint, logo: 'fallback.ico', plate: 'dark' };
  const localOnly = fixture({ extension: false, personal: { 'local-site': localEntry } });
  const localFallback = localOnly.api.create('https://example.test/', 'local-site');
  await wait();
  assert.equal(brandOf(localFallback).dataset.source, 'personal');
  assert.match(brandOf(localFallback).src, /personal\/fallback\.ico$/);
  assert.equal(localFallback.children[0].dataset.tone, 'dark');
  const previousLocalRequests=localOnly.localRequests.length;
  const changedLocal = localOnly.api.create('https://other.example/', 'local-site');
  await wait();
  assert.equal(brandOf(changedLocal).dataset.source, 'generic', 'a changed URL must not use the previous local logo');
  assert.equal(changedLocal.children[0].dataset.tone, undefined, 'a changed URL must not apply the previous dark plate');
  assert.equal(localOnly.localRequests.length,previousLocalRequests,'a mismatched URL must not even load the previous local logo');
  const changedLocalPath = localOnly.api.create('https://example.test/another', 'local-site');
  const changedLocalQuery = localOnly.api.create('https://example.test/?query=changed#hash', 'local-site');
  await wait();
  assert.equal(brandOf(changedLocalPath).dataset.source, 'generic', 'a changed path must not reuse a local logo');
  assert.equal(changedLocalPath.children[0].dataset.tone, undefined);
  assert.equal(brandOf(changedLocalQuery).dataset.source, 'personal', 'query and fragment changes preserve a verified local logo');
  assert.equal(changedLocalQuery.children[0].dataset.tone, 'dark');
  const unsafeLocal = fixture({ extension: false, personal: { 'unsafe-local': { ...localEntry, logo: '../fallback.ico', plate: 'dark;background:red' } } });
  const rejectedLocal = unsafeLocal.api.create('https://example.test/', 'unsafe-local');
  await wait();
  assert.equal(brandOf(rejectedLocal).dataset.source, 'generic');
  assert.equal(rejectedLocal.children[0].dataset.tone, undefined, 'only the exact fixed dark value is accepted');
  assert.equal(unsafeLocal.localRequests.some(url => url.endsWith('.ico')),false,'unsafe logo filenames must not be requested');
  const noLocalCrypto = fixture({ extension: false, supportsCrypto: false, personal: { 'local-site': localEntry } });
  const uncheckedLocal = noLocalCrypto.api.create('https://example.test/', 'local-site');
  await wait();
  assert.equal(brandOf(uncheckedLocal).dataset.source, 'generic');
  assert.equal(uncheckedLocal.children[0].dataset.tone, undefined);
  assert.equal(noLocalCrypto.localRequests.length,0,'unverifiable mappings must not load a local logo');
  const corruptLocal = fixture({ extension: false, localLogoSucceeds: false, personal: { 'local-site': localEntry } });
  const brokenLogo = corruptLocal.api.create('https://example.test/', 'local-site');
  await wait();
  assert.equal(brandOf(brokenLogo).dataset.source, 'generic', 'undecodable local fallback must not replace the generic logo');
  const transparentLocal = fixture({ extension: false, cachedAlpha: 0, personal: { 'local-site': localEntry } });
  const blankLogo = transparentLocal.api.create('https://example.test/', 'local-site');
  await wait();
  assert.equal(brandOf(blankLogo).dataset.source, 'generic', 'fully transparent local fallback must not replace the generic logo');
  brandOf(localFallback).onerror();
  assert.equal(brandOf(localFallback).dataset.source, 'generic', 'a local logo that fails after verification must revert to generic');

  const knownURL='https://github.com/';
  const knownFingerprint=crypto.createHash('sha256').update(knownURL,'utf8').digest('hex');
  const knownPreview=fixture({ extension: false, personal: { 'known-site': { ...localEntry, fingerprint: knownFingerprint } } });
  const knownFallback=knownPreview.api.create(knownURL,'known-site');
  await wait();
  assert.equal(brandOf(knownFallback).dataset.source,'packaged','a personal logo must not override the existing three packaged logos');
  assert.equal(knownPreview.localRequests.some(url => url.endsWith('.ico')),false);
  const cachedURL='https://cached.example/';
  const cachedFingerprint=crypto.createHash('sha256').update(cachedURL,'utf8').digest('hex');
  const preferredCache=fixture({ personal: { 'cached-site': { ...localEntry, fingerprint: cachedFingerprint } } });
  const cachedWithFallback=preferredCache.api.create(cachedURL,'cached-site');
  await wait();
  assert.equal(brandOf(cachedWithFallback).dataset.source,'chrome','a valid Chrome cache icon must win over a personal fallback');
  assert.equal(preferredCache.localRequests.some(url => url.endsWith('.ico')),false);
  const preferredURL='https://uncached.example/';
  const preferredFingerprint=crypto.createHash('sha256').update(preferredURL,'utf8').digest('hex');
  const preferredWebsite=fixture({ personal: { 'website-site': { ...localEntry, fingerprint: preferredFingerprint } } });
  const websiteWithFallback=preferredWebsite.api.create(preferredURL,'website-site');
  await wait();
  assert.equal(brandOf(websiteWithFallback).dataset.source,'website','a valid website icon must win over a personal fallback');
  assert.equal(preferredWebsite.localRequests.some(url => url.endsWith('.ico')),false);
  brandOf(websiteWithFallback).onerror();
  await wait();
  assert.equal(brandOf(websiteWithFallback).dataset.source,'personal','a website icon that fails at display time should try the personal fallback');
  const missingWebsite=fixture({ directSucceeds: false, personal: { 'website-site': { ...localEntry, fingerprint: preferredFingerprint } } });
  const missingWithFallback=missingWebsite.api.create(preferredURL,'website-site');
  await wait();
  assert.equal(brandOf(missingWithFallback).dataset.source,'personal','the local logo follows unavailable Chrome and website icons');

  const skipped = fixture({ personal: { selected: { ...localEntry, fingerprint: preferredFingerprint, skipDirect: true } } });
  const skipIcon = skipped.api.create(preferredURL, 'selected');
  await wait();
  assert.equal(brandOf(skipIcon).dataset.source, 'personal', 'verified skipDirect uses the local fallback');
  assert.equal(skipped.requests.length, 0, 'verified skipDirect must not probe the known transparent direct icon');
  const normalIcon = skipped.api.create(preferredURL, 'different-id');
  const changedIcon = skipped.api.create('https://uncached.example/changed', 'selected');
  await wait();
  assert.equal(brandOf(normalIcon).dataset.source, 'website', 'a different ID with the same URL retains ordinary direct lookup');
  assert.equal(brandOf(changedIcon).dataset.source, 'website', 'a modified URL does not inherit skipDirect');
  assert.equal(skipped.requests.length, 1, 'ordinary direct lookups remain deduplicated');
  const skipCached = fixture({ personal: { selected: { ...localEntry, fingerprint: cachedFingerprint, skipDirect: true } } });
  const skipCachedIcon = skipCached.api.create(cachedURL, 'selected');
  await wait();
  assert.equal(brandOf(skipCachedIcon).dataset.source, 'chrome', 'a visible Chrome cache stays preferred even with skipDirect');
  const skipAuthorized = fixture({ permission: true, personal: { selected: { ...localEntry, fingerprint: preferredFingerprint, skipDirect: true } } });
  const skipAuthorizedIcon = skipAuthorized.api.create(preferredURL, 'selected');
  await wait();
  assert.equal(brandOf(skipAuthorizedIcon).dataset.source, 'website', 'authorized site metadata still takes priority');
  assert.ok(skipAuthorized.websiteFetches.some(item => item.url === preferredURL), 'authorized origin metadata is still fetched');
  const skipUnverified = fixture({ supportsCrypto: false, personal: { selected: { ...localEntry, fingerprint: preferredFingerprint, skipDirect: true } } });
  const skipUnverifiedIcon = skipUnverified.api.create(preferredURL, 'selected');
  await wait();
  assert.equal(brandOf(skipUnverifiedIcon).dataset.source, 'website', 'without fingerprint verification the normal behavior remains');
  assert.equal(skipUnverified.requests.length, 1);
  const skipNonBoolean = fixture({ personal: { selected: { ...localEntry, fingerprint: preferredFingerprint, skipDirect: 'true' } } });
  const skipNonBooleanIcon = skipNonBoolean.api.create(preferredURL, 'selected');
  await wait();
  assert.equal(brandOf(skipNonBooleanIcon).dataset.source, 'website', 'only boolean true activates the exception');
  assert.equal(skipNonBoolean.requests.length, 1);

  const browser = fixture();
  const cached = browser.api.create('https://cached.example/private?token=secret');
  const missing = browser.api.create('https://uncached.example/private?token=secret');
  const duplicate = browser.api.create('https://uncached.example/private?token=secret');
  await wait();
  assert.equal(brandOf(cached).dataset.source, 'chrome');
  assert.equal(brandOf(missing).dataset.source, 'website');
  assert.equal(brandOf(duplicate).dataset.source, 'website');
  assert.equal(browser.requests.length, 1, 'shared website requests should be deduplicated');
  assert.deepEqual(browser.requests[0], { url: 'https://uncached.example/favicon.ico', referrerPolicy: 'no-referrer' });
  assert.equal(browser.faviconRequests.filter(value => value.includes('.invalid/')).length, 1);

  for (const options of [{ cachedAlpha: 0 }, { cachedDecodes: false }, { supportsCanvas: false }, { canvasThrows: true }]) {
    const degraded = fixture(options);
    const icon = degraded.api.create('https://cached.example/private?token=secret');
    await wait();
    assert.equal(brandOf(icon).dataset.source, 'website', 'invisible or unreadable cached images must use the original fallback chain');
    assert.deepEqual(degraded.requests.map(item => item.url), ['https://cached.example/favicon.ico']);
  }
  const failedCacheAndSite = fixture({ cachedAlpha: 0, directSucceeds: false });
  const unavailable = failedCacheAndSite.api.create('https://cached.example/private');
  await wait();
  assert.equal(brandOf(unavailable).dataset.source, 'generic', 'unusable cache and website should use the generic fallback');

  const lazy = fixture();
  const hidden = lazy.api.create('https://hidden.example/private');
  hidden.visible = false;
  await wait();
  assert.equal(lazy.faviconRequests.length, 0, 'hidden rows must not trigger Chrome favicon lookups');
  assert.equal(lazy.requests.length, 0, 'hidden rows must not contact sites');
  lazy.reveal(hidden);
  await wait();
  assert.equal(lazy.requests[0].url, 'https://hidden.example/favicon.ico');

  const oldBrowser = fixture({ supportsObserver: false });
  const previouslyHidden = oldBrowser.api.create('https://old-browser.example/path');
  previouslyHidden.visible = false;
  await wait();
  assert.equal(oldBrowser.requests.length, 0);
  previouslyHidden.visible = true;
  oldBrowser.trigger('transitionend');
  await wait();
  assert.equal(oldBrowser.requests[0].url, 'https://old-browser.example/favicon.ico');

  const failed = fixture({ directSucceeds: false });
  const known = failed.api.create('https://github.com/user');
  const unknown = failed.api.create('https://unknown.example/page');
  await wait();
  assert.equal(brandOf(known).dataset.source, 'packaged');
  assert.match(brandOf(known).src, /github\.svg$/);
  assert.equal(brandOf(unknown).dataset.source, 'generic');
  assert.match(brandOf(unknown).src, /^data:image\/svg\+xml,/);

  const custom = fixture({ permission: true, links: [
    { rel: 'icon', href: 'javascript:alert(1)' },
    { rel: 'icon', href: 'https://tracker.example/icon.png' },
    { rel: 'icon', href: 'https://user:secret@icons.example/evil.png' },
    { rel: 'shortcut icon', href: '/assets/custom.png' }
  ] });
  const customIcon = custom.api.create('https://icons.example/private?token=secret');
  await wait();
  assert.equal(brandOf(customIcon).dataset.source, 'website');
  assert.match(brandOf(customIcon).src, /^data:image\/png;base64,/);
  assert.deepEqual(custom.websiteFetches.map(entry => entry.url), ['https://icons.example/', 'https://icons.example/assets/custom.png']);
  for (const entry of custom.websiteFetches) {
    assert.equal(entry.options.credentials, 'omit');
    assert.equal(entry.options.redirect, 'manual');
    assert.equal(entry.options.referrerPolicy, 'no-referrer');
  }

  const transparentFirst = fixture({ permission: true, links: [
    { rel: 'icon', href: '/transparent.png' }, { rel: 'icon', href: '/opaque.png' }
  ] });
  const nextIcon = transparentFirst.api.create('https://transparent.example/page');
  await wait();
  assert.equal(brandOf(nextIcon).dataset.source, 'website');
  assert.deepEqual(transparentFirst.websiteFetches.map(entry => entry.url), ['https://transparent.example/', 'https://transparent.example/transparent.png', 'https://transparent.example/opaque.png'], 'transparent site icon must fall through to the next candidate');
  assert.match(brandOf(nextIcon).src, /dmFsaWQgaW1hZ2U=$/, 'the visible candidate should be displayed');

  const transparentOnly = fixture({ permission: true, links: [{ rel: 'icon', href: '/transparent.png' }], transparentConventional: true });
  const emptyIcon = transparentOnly.api.create('https://empty-icon.example/page');
  await wait();
  assert.equal(brandOf(emptyIcon).dataset.source, 'generic', 'all-transparent authorized candidates must fall back to the generic icon');
  assert.deepEqual(transparentOnly.websiteFetches.map(entry => entry.url), ['https://empty-icon.example/', 'https://empty-icon.example/transparent.png', 'https://empty-icon.example/favicon.ico']);

  for (const options of [{ supportsCanvas: false }, { canvasThrows: true }, { directSucceeds: false }]) {
    const unreadable = fixture({ permission: true, links: [{ rel: 'icon', href: '/opaque.png' }], ...options });
    const icon = unreadable.api.create('https://unreadable-icon.example/page');
    await wait();
    assert.equal(brandOf(icon).dataset.source, 'generic', 'unreadable authorized site icons must safely fall back');
    assert.equal(unreadable.requests.length, 0, 'authorized mode must not fall through to cross-origin image probes');
  }
  const partiallyVisible = fixture({ permission: true, links: [{ rel: 'icon', href: '/opaque.png' }], websiteAlpha: 1 });
  const partialIcon = partiallyVisible.api.create('https://partial-alpha.example/page');
  await wait();
  assert.equal(brandOf(partialIcon).dataset.source, 'website', 'a nonzero visible pixel is sufficient');

  const redirect = fixture({ permission: true, failWebsite: true });
  const redirected = redirect.api.create('https://redirect.example/private');
  await wait();
  assert.equal(brandOf(redirected).dataset.source, 'generic');
  assert.deepEqual(redirect.websiteFetches.map(entry => entry.url), ['https://redirect.example/', 'https://redirect.example/favicon.ico']);
  assert.equal(redirect.requests.length, 0, 'authorized fetch must not fall back to redirect-following img');

  const upgrade = fixture({ links: [{ rel: 'icon', href: '/custom.png' }] });
  const upgraded = upgrade.api.create('https://upgrade.example/page');
  await wait();
  assert.equal(brandOf(upgraded).src, 'https://upgrade.example/favicon.ico');
  upgrade.grant();
  upgrade.api.refresh();
  await wait();
  assert.match(brandOf(upgraded).src, /^data:image\/png;base64,/);

  const refFailure = fixture({ referenceFailure: true });
  refFailure.api.create('https://one.example/a');
  refFailure.api.create('https://two.example/a');
  await wait();
  assert.equal(refFailure.requests.length, 0, 'a broken default reference must not trigger website requests');
  assert.equal(refFailure.faviconRequests.filter(value => value.includes('.invalid/')).length, 1);
  refFailure.recoverReference();
  await wait();
  assert.equal(refFailure.requests.length, 2, 'visible rows should retry after reference backoff');
  assert.equal(refFailure.faviconRequests.filter(value => value.includes('.invalid/')).length, 2);

  for (const mode of ['declared', 'stream']) {
    const tooLarge = fixture({ permission: true, oversized: mode });
    const largeIcon = tooLarge.api.create(`https://${mode}.example/page`);
    await wait();
    assert.equal(brandOf(largeIcon).dataset.source, 'website');
    assert.equal(tooLarge.websiteFetches[0].options.signal.aborted, true, `${mode} oversized body must be aborted`);
    assert.equal(tooLarge.canceled(), mode === 'stream' ? 1 : 0);
    assert.deepEqual(tooLarge.websiteFetches.map(entry => entry.url), [`https://${mode}.example/`, `https://${mode}.example/favicon.ico`]);
  }

  const hang = fixture({ hanging: true });
  for (let n = 0; n < 6; n++) hang.api.create(`https://hang${n}.example/page`);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(hang.requests.length, 6);
  assert.equal(hang.removed(), 6, 'all timed-out image requests should have their src removed');
  console.log('site-icons checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
