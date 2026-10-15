'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),before=process.argv.includes('--before-fix');
const source=path.join(root,before?'work/first-release/final-before-fix':'extension');
const app=fs.readFileSync(path.join(source,'app.js'),'utf8'),core=require(path.join(source,'core.js'));
const copy=value=>JSON.parse(JSON.stringify(value));
const stamp='2026-10-15T08:00:00.000Z';
const a={id:'site-a',name:'A original',url:'https://a.example/',group:'tools',createdAt:stamp};
const b={id:'site-b',name:'B original',url:'https://b.example/',group:'learn',createdAt:stamp};
const own={id:a.id,name:' A editing ',url:'A.example/edited',group:'watch'};
const base=()=>({...core.emptyState(),sites:[copy(a),copy(b)]});
const submit=app.slice(app.indexOf(" forms.editor.addEventListener('submit'"),app.indexOf("\n $('#editor-close')"));
const remove=app.slice(app.indexOf(" $('#delete-site').addEventListener('click'"),app.indexOf('\n function confirm('));
const queue=app.slice(app.indexOf(' function queueDraft('),app.indexOf('\n function fillEditor('));

async function interleave(type,other,{form=own,failure=false}={}){
 let stored=base(),closed=false,action,release,arrive;
 const nodes=new Map(),writes=[],listeners={};
 const arrived=new Promise(resolve=>arrive=resolve),gate=new Promise(resolve=>release=resolve);
 const c=vm.createContext({Promise,editorBusy:false,draftVersion:0,persistedDraftVersion:0,draftQueue:Promise.resolve(),editingId:form.id||null,
  $:selector=>{if(!nodes.has(selector))nodes.set(selector,{addEventListener:(name,fn)=>listeners[selector+':'+name]=fn});return nodes.get(selector);},
  currentDraft:()=>copy(form),editorLock:busy=>c.editorBusy=busy,
  forms:{editor:{addEventListener:(name,fn)=>listeners[name]=fn}},close:()=>closed=true,paperFeedback(){},notice(){},confirm:(_,fn)=>action=fn,
  command:async command=>{
   const next=core.apply(stored,command);
   if(failure&&command.type===type)throw Error('mock storage failure before commit');
   stored=copy(next.state);writes.push(copy(command));
   if(command.type==='draft'){arrive();await gate;}
   return next;
  }
 });
 vm.runInContext(queue+submit+remove,c);
 // A's real autosave has committed, but its response is delayed. The UI must
 // await that response, not re-enqueue its form over B's newer persisted input.
 const autosave=c.queueDraft();await arrived;
 let operation,error;
 if(type==='saveSite')operation=listeners.submit({preventDefault(){}});
 else{listeners['#delete-site:click']();operation=action().catch(value=>{error=value;});}
 if(other!==undefined)stored=copy(core.apply(stored,{type:'draft',draft:other}).state);
 const prior=copy(stored),expected=other===undefined?null:other;
 release();await Promise.all([autosave,operation]);
 if(failure){
  assert.deepEqual(stored,prior,'failed storage commit must retain site and full draft');assert.equal(closed,false);
  if(type==='saveSite')assert.match(nodes.get('#editor-error').textContent,/mock storage failure/);else assert.match(error.message,/mock storage failure/);
 }else{
  assert.deepEqual(stored.draft,expected,`${type}: preserve another tab's persisted full draft, or consume the matching draft`);
  assert.equal(closed,true);assert.equal(stored.revision,prior.revision+1,'one atomic write for save/delete and conditional cleanup');
  if(type==='saveSite')assert.ok(stored.sites.some(site=>site.name===form.name.trim()&&site.url===core.normalizeURL(form.url)));
  else{assert.ok(!stored.sites.some(site=>site.id===form.id));assert.equal(stored.trash[0].site.id,form.id);}
  assert.deepEqual(stored.sites.find(site=>site.id===b.id),b,'B saved site stays unchanged');
 }
 assert.equal(c.editorBusy,false);assert.deepEqual(writes.map(w=>w.type),failure?['draft']:['draft',type],'no extra draft write around save/delete');
 if(!failure)assert.deepEqual(writes.at(-1).expectedDraft,form,'UI captures its form, not the shared current draft');
 assert.deepEqual(prior.draft,other===undefined?form:other,'B draft was actually persisted before A finished');
 const backup=copy({app:'坐井观天',schemaVersion:1,exportedAt:stamp,state:stored});
 assert.deepEqual(core.previewImport(backup,core.emptyState(),'replace').state.draft,stored.draft,'full backup roundtrip retains the surviving draft');
}

async function check(){
 for(const type of ['saveSite','deleteSite']){
  for(const other of [
   {id:b.id,name:'B unsaved',url:'https://b.example/new',group:'create'},
   {...own,name:'A newer name'}, {...own,url:'https://a.example/newer'}, {...own,group:'social'},
   {name:'New unsaved',url:'https://new.example/',group:'collect'}
  ])await interleave(type,other);
  await interleave(type,undefined); // Unnormalized form matches the raw draft, even though saved site is normalized.
  await interleave(type,undefined,{failure:true});
  await interleave(type,{...own,name:'newer retained after failed write'},{failure:true});
  const input=core.apply(base(),{type:'draft',draft:own}).state,unchanged=copy(input);
  const legacy=core.apply(input,type==='saveSite'?{type,site:own}:{type,id:a.id});
  assert.deepEqual(legacy.state.draft,own,'omitted expectedDraft keeps legacy behavior');
  for(const invalid of [{...own,name:'x'.repeat(121)},{...own,url:7},{...own,group:'bad'},{...own,id:''}]){
   assert.throws(()=>core.apply(input,{type,site:own,id:a.id,expectedDraft:invalid}),/草稿|分类/);
   assert.deepEqual(input,unchanged,'invalid expected snapshot rejects without mutating input');
  }
  assert.throws(()=>core.apply(input,{type,site:{...own,url:'javascript:bad'},id:'missing',expectedDraft:own}));
  assert.deepEqual(input,unchanged,'failed operation cannot clear a matching draft');
 }
 const fresh={name:' New draft ',url:'fresh.example/',group:'tools'};
 await interleave('saveSite',undefined,{form:fresh});
 await interleave('saveSite',{...fresh,name:'newer new-site draft'},{form:fresh});
 console.log('PASS cross-tab draft: actual submit/delete + autosave handlers with real core; other ID, same ID name/URL/group updates and new drafts preserved; matching drafts consumed atomically');
 console.log('PASS draft safety: failed commits/invalid operations retain state; optional snapshot validated; legacy calls unchanged; no extra cleanup write; full backup roundtrip retains drafts');
}
module.exports=check();
if(require.main===module)module.exports.catch(error=>{console.error(error);process.exitCode=1;});
