'use strict';
// Native action popup via CDP, disposable Edge profile, synthetic content only.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{chromium}=require('playwright');
const ext=path.resolve(__dirname,'../extension'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'sky-native-popup-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));let browser;
(async()=>{
 browser=await chromium.launchPersistentContext(profile,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run','--no-default-browser-check','--disable-background-networking']});
 const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker'),tab=await browser.newPage();await worker.evaluate(()=>chrome.action.openPopup());
 const cdp=await browser.newCDPSession(tab);let target;
 for(let i=0;i<50;i++){target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/popup.html'));if(target)break;await pause(50);}
 assert.ok(target,'native action popup target must open');const attached=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});let id=0;
 function evaluate(expression){return new Promise(async(resolve,reject)=>{const request=++id;function receive(event){if(event.sessionId!==attached.sessionId)return;const result=JSON.parse(event.message);if(result.id!==request)return;cdp.off('Target.receivedMessageFromTarget',receive);if(result.error||result.result?.exceptionDetails)reject(Error(JSON.stringify(result.error||result.result.exceptionDetails)));else resolve(result.result.result.value);}cdp.on('Target.receivedMessageFromTarget',receive);try{await cdp.send('Target.sendMessageToTarget',{sessionId:attached.sessionId,message:JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,returnByValue:true}})});}catch(error){cdp.off('Target.receivedMessageFromTarget',receive);reject(error);}});}
 await pause(300);
 // Programmatic openPopup does not grant activeTab; populate the real layout with harmless content.
 await evaluate(`(()=>{document.querySelector('#site-form').hidden=false;const groups=document.querySelector('#groups');for(const group of SkyCore.GROUPS){const b=document.createElement('button');b.className='op-paper-choice';b.type='button';b.textContent=group.name;groups.append(b)}SkyActions.mount(document.querySelector('#action-picker'),{site:{name:'示例',url:'https://example.test/',group:'tools'},sites:[],selected:'simple-lie.png',onSelect(){}});})()`);
 await pause(300);
 const result=await evaluate(`JSON.stringify((()=>{const body=document.body.getBoundingClientRect(),input=document.querySelector('#site-name').getBoundingClientRect(),groups=[...document.querySelectorAll('.op-paper-choice')].map(n=>n.getBoundingClientRect()),cols=getComputedStyle(document.querySelector('#groups')).gridTemplateColumns.split(' ').length;return {viewport:innerWidth,body:body.width,scroll:document.documentElement.scrollWidth,input:input.width,cols,groups:groups.length}})())`),size=JSON.parse(result);
 assert.ok(size.viewport>=440&&size.viewport<=500,JSON.stringify(size));assert.equal(size.body,440);assert.equal(size.scroll,size.viewport);assert.ok(size.input>300);assert.equal(size.cols,4);assert.equal(size.groups,7);
 console.log('PASS real native action popup: 440px content, no horizontal clipping, input and seven categories fit');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();fs.rmSync(profile,{recursive:true,force:true});});
