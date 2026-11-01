'use strict';
// Real extension in a disposable Edge profile; synthetic local sites only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {chromium}=require('playwright');
const core=require('../extension/core.js');

const root=path.resolve(__dirname,'..');
const extension=path.join(root,'extension');
const edge=process.env.SKY_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const png=fs.readFileSync(path.join(extension,'icons','16.png'));
const transparent=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=','base64');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sky-icons-edge-'));
const report={method:'real Edge extension, fresh disposable profile, loopback sites',checks:[],requests:[],errors:[]};
let browser,declaredIcons='<link rel="icon" href="/custom.png">',transparentConventional=false;
const server=http.createServer((req,res)=>{
 report.requests.push({path:req.url,referer:req.headers.referer||'',cookie:req.headers.cookie||''});
 if(req.url==='/favicon.ico')return res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'}).end(transparentConventional?transparent:png);
 if(req.url==='/custom.png')return res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'}).end(png);
 if(req.url==='/transparent.png')return res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'}).end(transparent);
 if(req.url==='/warm-transparent')return res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end('<!doctype html><title>transparent icon test</title><link rel="icon" href="/transparent.png">');
 res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end('<!doctype html><title>local test</title>'+declaredIcons);
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 assert.ok(fs.existsSync(edge),'Edge executable not found; set SKY_EDGE_PATH');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launchPersistentContext(profile,{executablePath:edge,headless:true,args:[
  `--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-first-run','--no-default-browser-check','--disable-background-networking'
 ]});
 let worker=browser.serviceWorkers()[0];
 if(!worker)worker=await browser.waitForEvent('serviceworker',{timeout:20000});
 const extensionId=new URL(worker.url()).host;
 assert.match(extensionId,/^[a-p]{32}$/);
 report.checks.push('完整 manifest 已加载，扩展 worker 已启动');
 let state=core.emptyState();
 for(const [name,url] of [['直接图标',origin+'/first?private=not-sent'],['缓存未知',origin+'/second']])
  state=core.apply(state,{type:'saveSite',site:{name,url,group:'watch'}}).state;
 state.settings.openingEnabled=false;
 await worker.evaluate(async value=>chrome.storage.local.set({'sky-home-v1':value}),state);
 const page=await browser.newPage();
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(`chrome-extension://${extensionId}/index.html`);
 await page.waitForSelector('.op-paper a.site-link');
 await page.waitForFunction(()=>document.querySelectorAll('.site-icon').length===2);
 const boxes=await page.locator('.site-icon').evaluateAll(nodes=>nodes.map(node=>({w:node.offsetWidth,h:node.offsetHeight})));
 assert.deepEqual(boxes,[{w:40,h:40},{w:40,h:40}]);
 await page.waitForFunction(()=>[...document.querySelectorAll('.site-icon-brand')].some(node=>node.dataset.source==='website'),{timeout:15000});
 const before=await page.locator('.site-icon-brand').evaluateAll(nodes=>nodes.map(node=>({source:node.dataset.source,loaded:node.complete&&node.naturalWidth>0})));
 assert.ok(before.some(icon=>icon.source==='website'&&icon.loaded));
 assert.ok(report.requests.some(item=>item.path==='/favicon.ico'));
 assert.ok(report.requests.every(item=>!item.path.includes('private=not-sent')),'private path/query must not be requested');
 assert.ok(report.requests.every(item=>!item.referer),'site image requests should not carry a referrer');
 report.checks.push('真实首页使用 40px 角色图标；缓存未命中后请求目标站 favicon.ico，未发送原路径或 Referer');

 // Visit a synthetic page once in the isolated profile so Chromium stores its favicon.
 const warmPage=await browser.newPage();
 await warmPage.goto(origin+'/warm');
 await warmPage.waitForTimeout(1200);
 await warmPage.close();
 await page.evaluate(url=>SkyStore.dispatch({type:'saveSite',site:{name:'缓存命中',url,group:'watch'}}),origin+'/warm');
 const cached=page.locator('.op-paper li').filter({hasText:'缓存命中'}).locator('.site-icon-brand');
 await cached.waitFor();
 await page.waitForFunction(()=>{const row=[...document.querySelectorAll('.op-paper li')].find(n=>n.textContent.includes('缓存命中'));return row?.querySelector('.site-icon-brand')?.dataset.source==='chrome';},{timeout:15000});
 assert.equal(await cached.getAttribute('data-source'),'chrome');
 report.checks.push('隔离浏览器先访问合成网站后，扩展命中并使用 Chromium 本地图标缓存');

 const transparentPage=await browser.newPage();
 await transparentPage.goto(origin+'/warm-transparent');await transparentPage.waitForTimeout(1200);await transparentPage.close();
 const cachePixels=await page.evaluate(async url=>{
  const favicon=new URL(chrome.runtime.getURL('/_favicon/'));favicon.searchParams.set('pageUrl',url);favicon.searchParams.set('size','32');
  const bitmap=await createImageBitmap(await (await fetch(favicon)).blob()),canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,32,32);return [...ctx.getImageData(0,0,32,32).data].filter((_,i)=>i%4===3).some(alpha=>alpha>0);
 },origin+'/warm-transparent');
 assert.equal(cachePixels,false,'the synthetic site must really have an all-transparent cached favicon');
 await page.evaluate(url=>SkyStore.dispatch({type:'saveSite',site:{name:'透明缓存',url,group:'watch'}}),origin+'/warm-transparent');
 const transparentRow=page.locator('.op-paper li').filter({hasText:'透明缓存'}).locator('.site-icon-brand');
 await transparentRow.waitFor();
 await page.waitForFunction(()=>{const row=[...document.querySelectorAll('.op-paper li')].find(n=>n.textContent.includes('透明缓存'));return row?.querySelector('.site-icon-brand')?.dataset.source==='website';},{timeout:15000});
 report.checks.push('完全透明的真实缓存图标进入网站图标回退');
 await page.locator('#settings-open').click();
 assert.equal(await page.locator('#site-icons-access').isVisible(),true);
 // Observe the native permission request without approving it by replacing only the request function.
 const event=await page.evaluate(async()=>{
  const actual=chrome.permissions.request;let captured;
  chrome.permissions.request=async value=>{captured=value;return false;};
  document.querySelector('#site-icons-access').click();
  await new Promise(resolve=>setTimeout(resolve,100));
  chrome.permissions.request=actual;
  return {captured,status:document.querySelector('#site-icons-status').textContent};
 });
 assert.deepEqual(event.captured.origins,['http://*/*','https://*/*']);
 assert.match(event.status,/未授权/);
 report.checks.push('设置入口触发预期的可选全站权限请求；本测试不批准权限');
 if(process.env.SKY_ICON_OUT){fs.mkdirSync(process.env.SKY_ICON_OUT,{recursive:true});await page.screenshot({path:path.join(process.env.SKY_ICON_OUT,'edge-settings.png')});}
 assert.deepEqual(report.errors,[]);
 await browser.close();browser=null;

 // A disposable sanitized clone forces loopback HTTP host permission, to test
 // real Chrome host-permission semantics without interacting with a native prompt.
 const clone=path.join(profile,'granted-extension');
 const personalAssets=path.resolve(extension,'assets','site-icons','personal');
 fs.cpSync(extension,clone,{recursive:true,filter:source=>!['seed.js','site-personal.js'].includes(path.basename(source))&&path.resolve(source)!==personalAssets});
 fs.writeFileSync(path.join(clone,'seed.js'),"'use strict';globalThis.SkySeed={bookmarks:[],shortcuts:[]};\n");
 fs.writeFileSync(path.join(clone,'site-personal.js'),"'use strict';globalThis.SkyPersonalIcons={};\n");
 const manifestFile=path.join(clone,'manifest.json');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 manifest.optional_host_permissions=manifest.optional_host_permissions.filter(pattern=>pattern!=='http://*/*');
 manifest.host_permissions=['http://*/*'];
 fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 report.requests.length=0;
 browser=await chromium.launchPersistentContext(path.join(profile,'granted-profile'),{executablePath:edge,headless:true,args:[
  `--disable-extensions-except=${clone}`,`--load-extension=${clone}`,'--no-first-run','--no-default-browser-check','--disable-background-networking'
 ]});
 let grantedWorker=browser.serviceWorkers()[0];
 if(!grantedWorker)grantedWorker=await browser.waitForEvent('serviceworker',{timeout:20000});
 const grantedId=new URL(grantedWorker.url()).host;
 await browser.addCookies([{name:'sky_test_cookie',value:'dummy',url:origin}]);
 let grantedState=core.emptyState();
 grantedState=core.apply(grantedState,{type:'saveSite',site:{name:'自定义图标',url:origin+'/secret?token=not-sent',group:'watch'}}).state;
 grantedState.settings.openingEnabled=false;
 await grantedWorker.evaluate(async value=>chrome.storage.local.set({'sky-home-v1':value}),grantedState);
 const grantedPage=await browser.newPage();
 grantedPage.on('pageerror',error=>report.errors.push(error.message));
 await grantedPage.goto(`chrome-extension://${grantedId}/index.html`);
 await grantedPage.waitForSelector('.site-icon');
 assert.equal(await grantedPage.evaluate(async()=>chrome.permissions.contains({origins:['http://127.0.0.1/*']})),true);
 await grantedPage.waitForFunction(()=>{const image=document.querySelector('.site-icon-brand');return image?.dataset.source==='website'&&image.complete&&image.naturalWidth>0;},{timeout:15000});
 assert.ok(report.requests.some(item=>item.path==='/'),'homepage was fetched');
 assert.ok(report.requests.some(item=>item.path==='/custom.png'),'declared link icon was fetched');
 assert.ok(report.requests.every(item=>!item.path.includes('token=not-sent')));
 assert.ok(report.requests.every(item=>!item.referer&&!item.cookie));
 report.checks.push('临时副本将 HTTP 权限设为必需以模拟已授权；真实浏览器读取首页并获取 link 声明的自定义图标，且不发送原路径、Referer 或 Cookie');

 // Authorized same-origin candidates: skip transparent and try the next visible icon.
 declaredIcons='<link rel="icon" href="/transparent.png"><link rel="icon" href="/custom.png">';
 report.requests.length=0;
 await grantedPage.evaluate(()=>SkySiteIcons.refresh());
 for(let i=0;i<100&&!report.requests.some(item=>item.path==='/custom.png');i++)await sleep(50);
 assert.deepEqual(report.requests.map(item=>item.path),['/','/transparent.png','/custom.png']);
 assert.equal(await grantedPage.locator('.site-icon-brand').getAttribute('data-source'),'website');
 report.checks.push('已授权网站的透明自定义图标被跳过，继续使用下一个可见图标');

 // If both the declared and conventional icons are transparent, use the generic icon.
 declaredIcons='<link rel="icon" href="/transparent.png">';transparentConventional=true;
 report.requests.length=0;
 await grantedPage.evaluate(()=>SkySiteIcons.refresh());
 await grantedPage.waitForFunction(()=>document.querySelector('.site-icon-brand')?.dataset.source==='generic',{timeout:15000});
 assert.deepEqual(report.requests.map(item=>item.path),['/','/transparent.png','/favicon.ico']);
 report.checks.push('已授权网站的所有候选均透明时使用通用图标');
 assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);console.error(JSON.stringify(report,null,2));process.exitCode=1;}).finally(async()=>{
 await browser?.close();server.close();await sleep(100);
 const resolved=path.resolve(profile),temp=path.resolve(os.tmpdir());
 if(path.dirname(resolved)===temp&&path.basename(resolved).startsWith('sky-icons-edge-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
});
