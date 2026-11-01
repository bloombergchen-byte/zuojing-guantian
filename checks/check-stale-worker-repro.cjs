'use strict';
// Reproduces a new page talking to an already-running old worker in a disposable profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{chromium}=require('playwright');
const source=path.resolve(__dirname,'../extension'),root=fs.mkdtempSync(path.join(os.tmpdir(),'sky-stale-worker-'));
const ext=path.join(root,'extension'),profile=path.join(root,'profile');fs.mkdirSync(ext);
for(const file of ['cloud.js'])fs.copyFileSync(path.join(source,file),path.join(ext,file));
fs.writeFileSync(path.join(ext,'worker.js'),fs.readFileSync(path.join(source,'worker.js'),'utf8').replace("  if (message.type === 'handshake') return { ok: true, protocol: 1 };\n",''));
const current=fs.readFileSync(path.join(source,'core.js'),'utf8'),old=current.replace("case 'setIconChoice':", "case 'previousSetIconChoice':");assert.notEqual(old,current);
fs.writeFileSync(path.join(ext,'core.js'),old);
fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify({manifest_version:3,name:'Synthetic worker test',version:'1.0',permissions:['storage','alarms'],background:{service_worker:'worker.js'}}));
fs.writeFileSync(path.join(ext,'test.html'),'<script src="core.js"></script>');let context;
(async()=>{
 context=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run','--disable-background-networking']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const initial=await worker.evaluate(()=>SkyCore.apply(SkyCore.emptyState(),{type:'saveSite',site:{name:'synthetic',url:'https://example.test/',group:'tools'}}).state);
 await worker.evaluate(value=>chrome.storage.local.set({'sky-home-v1':value}),initial);
 fs.writeFileSync(path.join(ext,'core.js'),current);
 const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/test.html`);
 const result=await page.evaluate(async state=>{
  const site=state.sites[0],command={type:'setIconChoice',id:site.id,action:'simple-hug.png',expectedUrl:site.url};
  const pageSupportsAction=!!SkyCore.apply(state,command).state.localIconChoices[site.id];
  return {pageSupportsAction,response:await chrome.runtime.sendMessage({channel:'sky-home-v1',type:'dispatch',command})};
 },initial);
 assert.equal(result.pageSupportsAction,true);assert.equal(result.response.ok,false);assert.equal(result.response.error,'不支持的操作');
 console.log('PASS stale worker reproduction: newer page supports action while running old worker returns exact unsupported-operation error');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await context?.close();fs.rmSync(root,{recursive:true,force:true});});
