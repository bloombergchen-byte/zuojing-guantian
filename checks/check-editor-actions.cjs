'use strict';
// Uses synthetic sites and an isolated browser profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),core=require('../extension/core.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/icon-interview-2026-11-01/qa');fs.mkdirSync(out,{recursive:true});
let initial=core.apply(core.emptyState(),{type:'saveSite',site:{name:'合成网站',url:'https://example.test/',group:'tools'}}).state;
const id=initial.sites[0].id,d=new Date();initial.lastVisitDay=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname.endsWith('/site-personal.js'))return res.writeHead(200,{'Content-Type':'text/javascript'}).end('globalThis.SkyPersonalIcons={};');const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data));});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await context.addInitScript(value=>localStorage.setItem('sky-home-v1',JSON.stringify(value)),initial);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/extension/index.html`);
 await page.locator('#organize').click();const row=page.locator('.site-edit').first();assert.equal(await row.locator('.site-icon').evaluate(n=>n.getBoundingClientRect().width),40);await page.screenshot({path:path.join(out,'organize.png')});
 await row.click();await page.waitForFunction(()=>document.querySelector('#editor-action-picker [aria-pressed=true]'));await page.screenshot({path:path.join(out,'editor.png')});
 const original=await page.locator('#editor-action-picker [aria-pressed=true]').first().getAttribute('data-action');
 await page.locator('#editor-form [name=name]').fill('未保存名称');const target=page.locator(`#editor-action-picker .sky-action-choice:not([data-action="${original}"])`).first();const action=await target.getAttribute('data-action');await target.click();
 await page.waitForFunction(({id,action})=>JSON.parse(localStorage.getItem('sky-home-v1')).localIconChoices[id]?.action===action,{id,action});assert.equal(await page.locator('#editor-form [name=name]').inputValue(),'未保存名称');
 await page.locator('#editor-close').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);let saved=await page.evaluate(()=>SkyStore.get());assert.equal(saved.sites[0].name,'合成网站');assert.equal(saved.draft,null);assert.equal(saved.localIconChoices[id].action,action);
 await row.click();await page.waitForFunction(()=>document.querySelector('#editor-action-picker [aria-pressed=true]'));assert.equal(await page.locator('#editor-form [name=name]').inputValue(),'合成网站');await page.locator('#editor-form [name=name]').fill('保留的草稿');await page.locator('#editor-close').click();await page.waitForFunction(()=>!document.querySelector('#editor').open);saved=await page.evaluate(()=>SkyStore.get());assert.equal(saved.draft.name,'保留的草稿');
 // A second tab's edit must not be overwritten by an already-open editor.
 await row.click();await page.evaluate(async id=>{const s=await SkyStore.get(),site=s.sites.find(x=>x.id===id);await SkyStore.dispatch({type:'saveSite',site:{...site,name:'另一窗口的修改'}});},id);await page.locator('#editor-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#editor-error').textContent.length>0);saved=await page.evaluate(()=>SkyStore.get());assert.equal(saved.sites[0].name,'另一窗口的修改');assert.equal(saved.draft.name,'保留的草稿');assert.equal(await page.locator('#editor').evaluate(n=>n.open),true);
 assert.deepEqual(errors,[]);console.log('PASS editor: organize icons, immediate action, draft semantics, concurrent edit protection');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
