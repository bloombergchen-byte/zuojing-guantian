'use strict';
// Full homepage -> actual extension worker, in a disposable Edge profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{chromium}=require('playwright'),core=require('../extension/core.js');
const ext=path.resolve(__dirname,'../extension'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'sky-action-worker-'));let context;
(async()=>{
 context=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run','--disable-background-networking']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');let initial=core.apply(core.emptyState(),{type:'saveSite',site:{name:'合成网站',url:'https://example.test/',group:'tools'}}).state;
 const site=initial.sites[0],d=new Date();initial.lastVisitDay=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');initial.settings.openingEnabled=false;
 await worker.evaluate(value=>chrome.storage.local.set({'sky-home-v1':value}),initial);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
 await page.locator('#organize').click();await page.locator('.site-edit').first().click();await page.waitForFunction(()=>document.querySelector('#editor-action-picker [aria-pressed=true]'));
 const action=await page.locator('#editor-action-picker [aria-pressed=false]').first().getAttribute('data-action');await page.locator('#editor-action-picker [aria-pressed=false]').first().click();
 await page.waitForFunction(a=>document.querySelector(`#editor-action-picker [data-action="${a}"]`)?.getAttribute('aria-pressed')==='true',action);
 const saved=(await worker.evaluate(()=>chrome.storage.local.get('sky-home-v1')))['sky-home-v1'];assert.equal(saved.localIconChoices[site.id].action,action);assert.equal(await page.locator('#editor-error').textContent(),'');assert.deepEqual(errors,[]);
 console.log('PASS current extension: homepage action change reaches real worker and persists');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await context?.close();fs.rmSync(profile,{recursive:true,force:true});});
