'use strict';
// Synthetic sites only; no real Chrome profile or personal data.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),core=require('../extension/core.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/site-icons-qa');fs.mkdirSync(out,{recursive:true});
let initial=core.emptyState();
for(const [groupIndex,group] of core.GROUPS.entries())for(let i=0;i<6;i++){
 const names=['YouTube','哔哩哔哩','GitHub','示例工具','测试网站','较长的网站名称用于验证两行截断'];
 const hosts=['www.youtube.com','www.bilibili.com','github.com','tool.example','example.test','long.example'];
 initial=core.apply(initial,{type:'saveSite',site:{name:names[i],url:`https://${hosts[i]}/${groupIndex}`,group:group.id}}).state;
}
const d=new Date();initial.lastVisitDay=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);});});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await context.addInitScript(value=>localStorage.setItem('sky-home-v1',JSON.stringify(value)),initial);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/extension/index.html`);
 await page.waitForSelector('.site-link .site-icon');
 await page.waitForFunction(()=>[...document.querySelectorAll('.site-icon-person')].every(img=>img.complete&&img.naturalWidth>0));
 for(const width of [1440,320]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(250);
  const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,icons:[...document.querySelectorAll('.site-link .site-icon')].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return [r.width,r.height,n.getAttribute('aria-hidden')];}),images:[...document.querySelectorAll('.site-icon img')].every(n=>n.complete&&n.naturalWidth>0)}));
  assert.equal(result.overflow,false,JSON.stringify(result));assert.ok(result.icons.length>0);assert.ok(result.icons.every(([w,h,hidden])=>w===40&&h===40&&hidden==='true'));assert.equal(result.images,true);
  await page.screenshot({path:path.join(out,`home-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(200);
 await page.locator('.op-search-toggle').click();await page.locator('[data-mode=local]').click();await page.locator('#search-input').fill('哔哩哔哩');
 await page.waitForFunction(()=>document.querySelector('.op-search-result').textContent.includes('匹配网站'));
 assert.ok(await page.locator('.site-link .site-icon').count()>0,'search retains icons');
 await page.screenshot({path:path.join(out,'search.png'),fullPage:true});
 await page.locator('.op-search-close').click();await page.waitForFunction(()=>document.querySelector('.op-search').hidden);
 await page.locator('#organize').click();assert.ok(await page.locator('.site-edit .site-icon').count()>0,'organize displays site icons');assert.ok(await page.locator('.site-edit').count()>0);
 await page.screenshot({path:path.join(out,'organize.png'),fullPage:true});
 await page.locator('#organize').click();await page.locator('#settings-open').click();
 await page.evaluate(()=>{window.__permissionResult=false;window.__permissionArgs=null;window.chrome.permissions={request:async args=>{window.__permissionArgs=args;return window.__permissionResult;}};});
 await page.locator('#site-icons-access').click();assert.match(await page.locator('#site-icons-status').innerText(),/未授权/);
 assert.deepEqual(await page.evaluate(()=>window.__permissionArgs.origins),['http://*/*','https://*/*']);
 await page.evaluate(()=>window.__permissionResult=true);await page.locator('#site-icons-access').click();assert.match(await page.locator('#site-icons-status').innerText(),/已授权/);
 assert.deepEqual(errors,[]);console.log('PASS icons UI: 40px, visible images, 320/1440 layout, local search, organize icons, no page errors');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
