'use strict';
// A new page, old running worker, isolated browser profile, synthetic data.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{chromium}=require('playwright'),core=require('../extension/core.js');
const source=path.resolve(__dirname,'../extension'),root=fs.mkdtempSync(path.join(os.tmpdir(),'sky-version-guard-')),ext=path.join(root,'extension'),profile=path.join(root,'profile');fs.mkdirSync(ext);
for(const file of ['cloud.js','store.js','site-icons.js','action-library.js','action-picker.css','style.css','popup.js','popup.html','popup.css','index.html','app.js','motion.js','stats.js'])fs.copyFileSync(path.join(source,file),path.join(ext,file));
fs.mkdirSync(path.join(ext,'vendor'));fs.copyFileSync(path.join(source,'vendor/anime-4.5.0.umd.min.js'),path.join(ext,'vendor/anime-4.5.0.umd.min.js'));fs.writeFileSync(path.join(ext,'seed.js'),'globalThis.SkySeed={bookmarks:[],shortcuts:[]};');
fs.writeFileSync(path.join(ext,'site-personal.js'),'globalThis.SkyPersonalIcons={};');
const currentWorker=fs.readFileSync(path.join(source,'worker.js'),'utf8'),oldWorker=currentWorker.replace(/\s*if \(message\.type === 'handshake'\) return \{ ok: true, protocol: 1 \};/,'');assert.notEqual(oldWorker,currentWorker);fs.writeFileSync(path.join(ext,'worker.js'),oldWorker);
const currentCore=fs.readFileSync(path.join(source,'core.js'),'utf8'),oldCore=currentCore.replace("case 'setIconChoice':", "case 'previousSetIconChoice':");assert.notEqual(oldCore,currentCore);fs.writeFileSync(path.join(ext,'core.js'),oldCore);
fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify({manifest_version:3,name:'Synthetic version guard test',version:'1.0',permissions:['storage','alarms','activeTab','favicon'],background:{service_worker:'worker.js'}}));
fs.writeFileSync(path.join(ext,'test.html'),'<meta charset="utf-8"><script src="core.js"></script><script src="store.js"></script>');let context;
(async()=>{
 context=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run','--disable-background-networking']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');let initial=core.apply(core.emptyState(),{type:'saveSite',site:{name:'synthetic',url:'https://example.test/',group:'tools'}}).state;const site=initial.sites[0];initial=core.apply(initial,{type:'setIconChoice',id:site.id,action:'simple-hug.png',expectedUrl:site.url}).state;
 await worker.evaluate(value=>chrome.storage.local.set({'sky-home-v1':value}),initial);fs.writeFileSync(path.join(ext,'core.js'),currentCore);
 const id=new URL(worker.url()).host,page=await context.newPage();await page.goto(`chrome-extension://${id}/test.html`);
 const results=await page.evaluate(async site=>{
  const operations=[()=>SkyStore.get(),()=>SkyStore.dispatch({type:'click',id:site.id}),()=>SkyStore.recover({},true),()=>SkyStore.cloud('Sync')];
  return Promise.all(operations.map(async run=>{try{await run();return 'unexpected success';}catch(error){return error.code+':'+error.message;}}));
 },site);
 for(const value of results)assert.match(value,/^STALE_WORKER:.*重新加载/);
 const home=await context.newPage();await home.goto(`chrome-extension://${id}/index.html`);await home.waitForFunction(()=>!document.querySelector('#load-error').hidden);assert.equal(await home.locator('#load-title').textContent(),'请重新加载扩展');assert.match(await home.locator('#load-message').textContent(),/重新加载/);assert.equal(await home.locator('#recovery-select').isVisible(),false,'version mismatch must not suggest data recovery');
 const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('重新加载'));assert.equal(await popup.locator('#site-form').isVisible(),false);
 const saved=(await worker.evaluate(()=>chrome.storage.local.get('sky-home-v1')))['sky-home-v1'];assert.deepEqual(saved,initial,'old worker must not overwrite new local-only fields');
 console.log('PASS version guard: old worker cannot read, write, recover, sync or open quick add; raw data retained');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await context?.close();fs.rmSync(root,{recursive:true,force:true});});
