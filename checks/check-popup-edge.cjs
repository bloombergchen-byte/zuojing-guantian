'use strict';
// Exercises the real extension document and worker in a disposable Edge profile, using synthetic local data.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),path=require('path'),fs=require('fs'),os=require('os'),http=require('http'),core=require('../extension/core.js');
const root=path.resolve(__dirname,'..'),ext=path.join(root,'extension'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'sky-popup-real-'));
const server=http.createServer((q,s)=>s.end('<title>合成测试网站</title>'));let browser;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run','--no-default-browser-check','--disable-background-networking']});
 let worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker');const page=await browser.newPage();await page.goto(origin+'/current');
 let state=core.apply(core.emptyState(),{type:'saveSite',site:{name:'原名称',url:origin+'/saved',group:'tools'}}).state;const site=state.sites[0];await worker.evaluate(value=>chrome.storage.local.set({'sky-home-v1':value}),state);
 await browser.addInitScript(url=>{if(location.pathname.endsWith('/popup.html'))chrome.tabs.query=async()=>[{url,title:'合成测试网站'}];},origin+'/current');
 async function openPopupDocument(){const popup=await browser.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);await popup.waitForFunction(()=>!document.querySelector('#site-form').hidden&&!document.querySelector('#site-form').inert);return popup;}
 let popup=await openPopupDocument();await popup.evaluate(()=>{const input=document.querySelector('#site-name');input.value='第一笔';input.dispatchEvent(new Event('input',{bubbles:true}));input.value='最后一笔';input.dispatchEvent(new Event('input',{bubbles:true}));});await popup.close();await pause(1000);
 state=(await worker.evaluate(()=>chrome.storage.local.get('sky-home-v1')))['sky-home-v1'];assert.equal(state.popupDrafts[site.id]?.name,'最后一笔','last input survives closing the extension document');
 popup=await openPopupDocument();await popup.evaluate(()=>{const input=document.querySelector('#site-name');input.value='动作后放弃';input.dispatchEvent(new Event('input',{bubbles:true}));const button=document.querySelector('.sky-action-choice[aria-pressed="false"]');if(!button)throw Error('no alternate action');button.click();});await popup.close();await pause(1000);
 state=(await worker.evaluate(()=>chrome.storage.local.get('sky-home-v1')))['sky-home-v1'];assert.equal(state.popupDrafts[site.id],undefined,'changing action clears own draft even when the document immediately closes');assert.ok(state.localIconChoices[site.id]?.action,'chosen action persists after popup closes');assert.equal(state.sites[0].name,'原名称');
 console.log('PASS extension document + real worker: last draft and immediately selected action persist after document closes');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();fs.rmSync(profile,{recursive:true,force:true});});
