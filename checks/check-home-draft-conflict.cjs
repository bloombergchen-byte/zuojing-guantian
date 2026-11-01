'use strict';
// Two isolated browser tabs, with synthetic data only.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),core=require('../extension/core.js');
const root=path.resolve(__dirname,'..');let initial=core.apply(core.emptyState(),{type:'saveSite',site:{name:'合成网站',url:'https://example.test/',group:'tools'}}).state;
const d=new Date();initial.lastVisitDay=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname.endsWith('/site-personal.js'))return res.writeHead(200,{'Content-Type':'text/javascript'}).end('globalThis.SkyPersonalIcons={};');const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data));});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await context.addInitScript(value=>{if(!localStorage.getItem('sky-home-v1'))localStorage.setItem('sky-home-v1',JSON.stringify(value));},initial);
 const a=await context.newPage(),b=await context.newPage(),errors=[];for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}/extension/index.html`;await a.goto(url);await a.locator('#organize').click();await a.locator('.site-edit').first().click();await a.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('已保存'));
 await b.goto(url);await b.locator('#organize').click();await b.locator('.site-edit').first().click();await b.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('已保存'));
 await a.locator('#editor-form [name=name]').fill('窗口甲的草稿');await a.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('已保存'));
 await b.locator('#editor-form [name=name]').fill('窗口乙的草稿');await b.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('其他窗口'));
 assert.equal((await b.evaluate(()=>SkyStore.get())).draft.name,'窗口甲的草稿');await b.locator('#editor-close').click();await b.waitForFunction(()=>document.querySelector('#editor-error').textContent.includes('其他窗口'));assert.equal(await b.locator('#editor').evaluate(n=>n.open),true);assert.equal(await b.locator('#editor-form [name=name]').inputValue(),'窗口乙的草稿');
 assert.equal((await a.evaluate(()=>SkyStore.get())).draft.name,'窗口甲的草稿');
 // Confirmation authorizes replacing only the draft visible when the dialog opened.
 await a.locator('#editor-close').click();await a.waitForFunction(()=>!document.querySelector('#editor').open);await a.locator('.op-add').first().click();await a.waitForFunction(()=>document.querySelector('#confirmation').open);
 await b.evaluate(async()=>{const current=await SkyStore.get();await SkyStore.dispatch({type:'draft',expectedDraft:current.draft,draft:{...current.draft,name:'确认期间的新草稿'}});});
 await a.locator('#confirm-yes').click();await a.waitForFunction(()=>document.querySelector('#confirm-error').textContent.includes('其他窗口'));assert.equal((await a.evaluate(()=>SkyStore.get())).draft.name,'确认期间的新草稿');
 assert.deepEqual(errors,[]);console.log('PASS home draft conflict: both forms retain input; later writes, close and stale confirmation cannot overwrite newer drafts');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
