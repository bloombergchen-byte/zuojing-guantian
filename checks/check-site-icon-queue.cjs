'use strict';
// Synthetic sites in an isolated page; no personal data or Chrome profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const extension=path.resolve(__dirname,'../extension');
const server=http.createServer((request,response)=>{
 const pathname=new URL(request.url,'http://localhost').pathname;
 if(pathname==='/')return response.writeHead(200,{'Content-Type':'text/html'}).end('<style>.site-icon{display:inline-block;width:40px;height:40px}</style><div id="icons"></div><script>window.idles=[];window.requestIdleCallback=cb=>window.idles.push(cb);</script><script src="/site-icons.js"></script>');
 const file=path.resolve(extension,'.'+pathname);if(!file.startsWith(extension+path.sep))return response.writeHead(403).end();
 fs.readFile(file,(error,data)=>error?response.writeHead(404).end():response.writeHead(200,{'Content-Type':path.extname(file)==='.js'?'text/javascript':'image/png'}).end(data));
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:900,height:500}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.evaluate(()=>{const root=document.querySelector('#icons');for(let i=0;i<12;i++)root.append(SkySiteIcons.create('https://example.test/',undefined,{action:{image:'simple-hug.png',pose:'hug',builtin:true}}));});
 await page.waitForFunction(()=>document.querySelectorAll('.site-icon-person[data-personal="queued"]').length===12&&window.idles.length===1);
 await page.evaluate(()=>{document.querySelector('#icons').replaceChildren();const next=SkySiteIcons.create('https://example.test/',undefined,{action:{image:'simple-hug.png',pose:'hug',builtin:true}});next.id='new-icon';document.querySelector('#icons').append(next);});
 await page.waitForFunction(()=>document.querySelector('#new-icon .site-icon-person')?.dataset.personal==='queued');
 let steps=0;while(steps<6){
  await page.waitForFunction(()=>window.idles.length>0);await page.evaluate(()=>window.idles.shift()({didTimeout:false,timeRemaining:()=>50}));steps++;
  await page.waitForTimeout(40);if(await page.locator('#new-icon .site-icon-person').getAttribute('data-personal')==='loaded')break;
 }
 assert.equal(await page.locator('#new-icon .site-icon-person').getAttribute('data-personal'),'loaded','removed image tasks must not delay the replacement icon');
 assert.ok(steps<=4,`replacement should take at most four idle turns, got ${steps}`);assert.deepEqual(errors,[]);
 console.log('PASS icon queue: detached previews do not delay the newly visible action');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
