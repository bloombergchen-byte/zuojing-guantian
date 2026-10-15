'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension'),read=name=>fs.readFileSync(path.join(extension,name),'utf8');
const manifest=JSON.parse(read('manifest.json')),html=read('index.html'),app=read('app.js'),motion=read('motion.js');
assert.equal(manifest.manifest_version,3);assert.equal(manifest.name,'坐井观天');assert.equal(manifest.version,'1.0.0');
assert.equal(manifest.chrome_url_overrides.newtab,'index.html');assert.equal(manifest.background.service_worker,'worker.js');
assert.deepEqual(manifest.permissions,['storage']);assert.deepEqual(manifest.optional_permissions,['bookmarks']);
assert.ok(!manifest.host_permissions);assert.match(manifest.content_security_policy.extension_pages,/script-src 'self'/);assert.match(manifest.content_security_policy.extension_pages,/object-src 'none'/);assert.match(manifest.content_security_policy.extension_pages,/connect-src 'none'/);
assert.ok(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html));assert.ok(!/\son[a-z]+\s*=/i.test(html));assert.ok(!/javascript:|data:image|https?:\/\//i.test(html.replace(/placeholder="https:\/\/"/g,'')));
const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(scripts,['vendor/anime-4.5.0.umd.min.js','core.js','store.js','seed.js','motion.js','app.js']);
for(const resource of [...scripts,'style.css',manifest.background.service_worker,...Object.values(manifest.icons)])assert.ok(fs.existsSync(path.join(extension,resource)),resource);
for(const name of [...scripts,'worker.js']){const result=cp.spawnSync(process.execPath,['--check',path.join(extension,name)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
for(const script of [app,motion])assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|\beval\s*\(|new Function\s*\(|window\.openai|\bTweak\b/.test(script));
const records=JSON.parse(read('assets/sources.json'));assert.equal(records.length,21);
for(const r of records){const file=path.join(extension,'assets',r.id+'.webp');assert.ok(fs.existsSync(file));assert.equal(fs.readFileSync(file).toString('ascii',0,4),'RIFF');}
assert.ok(read('vendor/anime-LICENSE.md').includes('MIT'));
const sandbox={};vm.runInNewContext(read('seed.js'),sandbox);const bookmarks=sandbox.SkySeed.bookmarks;
assert.equal(JSON.stringify(sandbox.SkySeed.bookmarks),JSON.stringify(bookmarks));assert.equal(sandbox.SkySeed.shortcuts.length,4);
const core=require(path.join(extension,'core.js')),context=vm.createContext({core,SkyCore:core,URL,innerHeight:900,Number,Math,Set,Date});
function extract(source,name){const start=source.indexOf(' function '+name+'(');assert.ok(start>=0,name);const remainder=source.slice(start+5),next=remainder.search(/\n ?function /);return source.slice(start,next<0?undefined:start+5+next);}
vm.runInContext(extract(app,'splitBookmarkSource'),context);vm.runInContext(extract(motion,'destination'),context);
const split=context.splitBookmarkSource([...sandbox.SkySeed.bookmarks,...sandbox.SkySeed.shortcuts]);
assert.equal(split.valid.length+split.skipped.length,bookmarks.length+4);assert.equal(split.skipped.length,0);const preview=core.previewImport(split.valid,core.emptyState(),'merge');
assert.equal(preview.total+preview.duplicates+split.skipped.length,bookmarks.length+4);assert.ok(preview.state.sites.some(s=>s.group==='guitar'));
assert.equal(context.destination('example.com','google'),'https://example.com/');assert.throws(()=>context.destination('javascript:alert(1)','google'));assert.equal(new URL(context.destination('纸页 搜索','bing')).searchParams.get('q'),'纸页 搜索');
// Geometry runs with content heights including a 1700px expanded category. No fixed paper clipping.
context.papers=Array.from({length:7},(_,i)=>({style:{},querySelector:()=>({scrollHeight:i===2?1700:250+i*5})}));
vm.runInContext(extract(motion,'centerFrames'),context);
vm.runInContext(motion.slice(motion.indexOf('function openingFrames('),motion.indexOf('function layoutEdges(')),context);
vm.runInContext(extract(motion,'searchFrames'),context);
for(const width of [300,320,619,620,919,920,1440,1920]){
 const f=context.openingFrames(width),edges=context.edgeFrames(width,f.height,f.margin);assert.equal(edges.length,21);assert.equal(new Set(edges.map(r=>r.id)).size,21);
 for(const b of f.end){assert.ok([b.x,b.y,b.w,b.h,b.r].every(Number.isFinite));assert.ok(b.x>=0&&b.x+b.w<=width+.1&&b.h>=250&&b.y+b.h<f.height);}
 assert.ok(f.end[2].h>=1700);
 if(width>=920){for(const [a,b]of [[0,3],[1,2],[4,6]])assert.ok(Math.abs(f.end[a].x+f.end[b].x+f.end[a].w-width)<.01);}
 for(const matches of [[],[2],[0,1,2,3,4,5,6]]){const s=context.searchFrames(width,f.end,matches);for(const i of matches){const b=s.centers[i];assert.ok(b.x>=0&&b.x+b.w<=width+.1&&b.y>s.top+140&&b.y+b.h<s.height);}}
 const album=context.albumFrames(f.start);assert.equal(new Set(album.map(r=>r.id)).size,21);
}
assert.match(app,/file\.size>core\.MAX_IMPORT_BYTES/);assert.match(app,/store\.recover\(job\.value,true\)/);assert.match(app,/core\.previewImport\(job\.value,job\.recovery\?core\.emptyState\(\):state/);
assert.match(motion,/onRender:syncSearch,onComplete:syncSearch/);assert.match(motion,/scaleX:\[1,frames.titleScale\],scaleY:\[1,frames.titleScale\]/);assert.ok(!/op-controls|op-composition|op-play|开场进度/.test(html));
for(const size of [16,32,48,128]){const png=fs.readFileSync(path.join(extension,'icons',size+'.png'));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
async function checkDraftUI(){
 const nodes=new Map(),writes=[],listeners={},data={name:'first',url:'https://example.test/',group:'tools'};
 let first=true,release,closed=false,failDraft=false;
 const draftContext=vm.createContext({Promise,editorBusy:false,draftVersion:0,persistedDraftVersion:0,draftQueue:Promise.resolve(),editingId:null,
  $:selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);},
  currentDraft:()=>({...data}),editorLock:busy=>draftContext.editorBusy=busy,
  forms:{editor:{addEventListener:(name,fn)=>listeners[name]=fn}},close:()=>{closed=true;},paperFeedback:()=>{},notice:()=>{},
  command:async value=>{
   if(first){first=false;await new Promise(resolve=>release=resolve);}
   writes.push(JSON.parse(JSON.stringify(value)));
   if(failDraft&&value.type==='draft'&&value.draft){failDraft=false;throw Error('mock storage failure');}
   return {result:{site:{id:'saved-id'}}};
  }
 });
 vm.runInContext(extract(app,'queueDraft'),draftContext);
 const submitStart=app.indexOf(" forms.editor.addEventListener('submit'"),submitEnd=app.indexOf("\n $('#editor-close')",submitStart);
 vm.runInContext(app.slice(submitStart,submitEnd),draftContext);
 const a=draftContext.queueDraft();data.name='latest';const b=draftContext.queueDraft();const saving=listeners.submit({preventDefault(){}});
 await Promise.resolve();await Promise.resolve();assert.equal(typeof release,'function');release();await Promise.all([a,b,saving]);
 assert.deepEqual(writes.map(w=>[w.type,(w.draft||w.site).name]),[['draft','first'],['draft','latest'],['saveSite','latest']]);
 assert.deepEqual(writes.at(-1).expectedDraft,{...data});
 assert.equal(closed,true);assert.equal(draftContext.editorBusy,false);
 // A transient failed autosave must not make the Save button permanently unusable.
 writes.length=0;closed=false;failDraft=true;await draftContext.queueDraft().catch(()=>{});await listeners.submit({preventDefault(){}});
 assert.equal(writes.at(-1).type,'saveSite');assert.deepEqual(writes.at(-1).expectedDraft,{...data});assert.ok(!writes.some(w=>w.type==='draft'&&w.draft===null));assert.equal(closed,true);
}
async function checkEditorReentry(){
 const saved={id:'same-site',name:'saved original',url:'https://original.test/',group:'tools'},draft={...saved,name:'unfinished changed name',url:'https://changed.test/path',group:'learn'},shown=[],queued=[];
 let confirmPending=null;
 const c=vm.createContext({state:{draft},fillEditor:value=>shown.push({...value}),queueDraft:()=>{queued.push({...shown.at(-1)});return Promise.resolve();},confirm:(_,action)=>confirmPending=action,command:async()=>assert.fail('replacement must not pre-clear the shared draft')});
 vm.runInContext(extract(app,'openEditor'),c);c.openEditor(saved);await Promise.resolve();
 assert.deepEqual(shown.at(-1),draft);assert.deepEqual(queued.at(-1),draft);assert.equal(confirmPending,null,'same site resumes without destructive confirmation');
 c.openEditor();assert.deepEqual(shown.at(-1),draft,'continue entry keeps the same draft');
 const other={...saved,id:'other-site',name:'other'};const prior=shown.length;c.openEditor(other);assert.equal(shown.length,prior);assert.equal(typeof confirmPending,'function');await confirmPending();assert.deepEqual(shown.at(-1),other);
 c.state.draft=draft;confirmPending=null;c.openEditor({group:'watch'});assert.equal(typeof confirmPending,'function','new-site edit still confirms replacing a draft');
}
function checkSearchReturn(){
 const counts=[4,5,20,15,10,9,3],nodes={select:{},submit:{},result:{}},input={value:'https',focus(){}},stage={clientWidth:1920,style:{}},drivers=[];
 const papers=counts.map(n=>{
  const rows=Array.from({length:n},()=>({hidden:false,dataset:{search:'site https://example.test/'}})),more={},empty={},head={setAttribute(){}};
  const content={get scrollHeight(){return 100+rows.filter(r=>!r.hidden).length*32+(more.hidden?0:30);}};
  return {rows,style:{},dataset:{},querySelectorAll:()=>rows,querySelector:s=>({'.op-more':more,'.op-empty':empty,'.op-paper-head':head,'.op-paper-content':content})[s]};
 });
 const search={hidden:true,querySelectorAll:()=>[],querySelector:s=>s==='select'?nodes.select:s==='[type="submit"]'?nodes.submit:nodes.result};
 const c=vm.createContext({Math,innerHeight:1080,total:6000,papers,input,stage,search,state:{active:-1,mode:'local',query:'',searchOpen:false},main:{},searchPhase:{p:0},searchTimeline:null,searchDriver:null,searchToggle:{setAttribute(){},focus(){}},finishOpening(){},reduce:()=>false,
  motion:{animate(clock,options){const start=clock.t,driver={paused:false,pause(){this.paused=true;},step(p){if(this.paused)return;clock.t=start+(options.t-start)*p;options.onRender();if(p===1)options.onComplete();}};drivers.push(driver);return driver;}},layoutEdges(){}});
 for(const name of ['centerFrames','updateRows','cancelSearchDriver','revertSearch','syncSearch','driveSearch','setSearch','closeSearchImmediately'])vm.runInContext(extract(motion,name),c);
 // Mock only DOM geometry writes / Anime seeking. The row filtering, scalar driver,
 // close endpoint and home coordinate functions under test are the actual page source.
 c.build=()=>{c.frames=c.centerFrames(stage.clientWidth);stage.style.height=c.frames.height+'px';papers.forEach((p,i)=>p.style.height=c.frames.end[i].h+'px');};
 c.buildSearch=(progress=0)=>{c.cancelSearchDriver();c.updateRows();c.build();c.searchTimeline={currentTime:0,seek(t){this.currentTime=t;c.searchPhase.p=t/1500;c.syncSearch();return this;},revert(){c.searchPhase.p=0;c.syncSearch();}};c.searchTimeline.seek(progress*1500);};
 const heights=()=>papers.map(p=>p.style.height);
 c.updateRows();c.build();const normal=heights(),normalStage=stage.style.height;
 c.setSearch(true);drivers.at(-1).step(1);assert.equal(papers.reduce((sum,p)=>sum+p.rows.filter(r=>!r.hidden).length,0),66);assert.notDeepEqual(heights(),normal);
 c.setSearch(false);const firstClose=drivers.at(-1);firstClose.step(.5);assert.equal(search.hidden,false,'closing remains reversible before its endpoint');
 c.setSearch(true);firstClose.step(1);drivers.at(-1).step(1);assert.equal(c.state.searchOpen,true);assert.equal(input.value,'https');
 c.setSearch(false);drivers.at(-1).step(1);assert.equal(search.hidden,true);assert.deepEqual(heights(),normal);assert.equal(stage.style.height,normalStage);assert.equal(input.value,'https');assert.equal(c.searchTimeline,null);assert.equal(c.main.inert,false);
 c.setSearch(false);assert.equal(c.searchTimeline,null,'already closed does not construct a stale reverse timeline');
 // A resize reconstruction during reverse keeps progress and still settles at newly measured home frames.
 c.setSearch(true);drivers.at(-1).step(1);c.setSearch(false);drivers.at(-1).step(.4);const progress=c.searchPhase.p;c.cancelSearchDriver();stage.clientWidth=1440;c.buildSearch(progress);c.driveSearch(false);drivers.at(-1).step(1);const resized=c.centerFrames(1440);assert.deepEqual(heights(),[...resized.end].map(p=>p.h+'px'));assert.equal(stage.style.height,resized.height+'px');assert.equal(input.value,'https');
 c.reduce=()=>true;c.setSearch(true);c.setSearch(false);assert.equal(search.hidden,true);assert.equal(c.searchTimeline,null);assert.equal(stage.style.height,resized.height+'px');
}
module.exports=checkDraftUI().then(checkEditorReentry).then(checkSearchReturn).then(()=>require('./check-release-draft.cjs')).then(()=>{
 console.log('PASS package: MV3/CSP/local resources, script syntax, safe DOM, 21 local WebP artworks, pinned Anime MIT, PNG icons');
 console.log('PASS seed/import: '+bookmarks.length+' source records preserved + 4 shortcuts; '+split.skipped.length+' explicitly skipped; '+preview.duplicates+' duplicates; '+preview.total+' resulting sites (private URLs omitted)');
 console.log('PASS UI logic: HTTP-only search, source filtering, core preview, 300–1920px geometry, 1700px expanded paper, 4+3 symmetry, local-match bounds');
 console.log('PASS draft UI: delayed rapid inputs precede atomic save with expected snapshot; transient autosave failure can retry Save without editing');
 console.log('PASS review regressions: same-site editor reentry resumes full draft; other/new-site confirmation retained; 66-match local close remeasures home, rapid reversal/resize/reduced motion retain input');
});
if(require.main===module)module.exports.catch(error=>{console.error(error);process.exitCode=1;});
