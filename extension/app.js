/* Local-only UI for SkyCore / SkyStore. User strings use textContent or value. */
(() => {
 'use strict';
 const $=selector=>document.querySelector(selector),core=globalThis.SkyCore,store=globalThis.SkyStore;
 let state=null,motion=null,organizing=false,loading=true,editingId=null,editorBusy=false,draftQueue=Promise.resolve(),filePurpose='import',importJob=null,initialPreview=false,openingStarted=false;
 let noticeTimer,confirmAction=null,unsubscribe=null,draftVersion=0,persistedDraftVersion=0;
 const forms={editor:$('#editor-form'),settings:$('#settings-form')};
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 const day=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function notice(message,error=false){clearTimeout(noticeTimer);$('#notice').textContent=message;$('#notice').setAttribute('role',error?'alert':'status');if(!error)noticeTimer=setTimeout(()=>$('#notice').textContent='',5500);}
 const fail=error=>notice(error?.message||String(error),true);
 function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
 async function exportState(){try{const current=await store.get();download({app:'坐井观天',schemaVersion:1,exportedAt:new Date().toISOString(),state:current},`坐井观天-${day()}.json`);}catch(error){fail(error);}}
 async function exportRaw(previous=false){try{const raw=await (previous?store.getRecoveryRaw():store.getRaw());if(!raw){notice('没有上次恢复前的原始记录');return;}download(raw,`坐井观天-原始保全${previous?'-上次恢复前':''}-${day()}.json`);}catch(error){fail(error);}}
 function paperFeedback(node){if(!reduced()&&globalThis.anime)anime.animate(node,{opacity:[.7,1],y:[6,0],duration:220,ease:'out(3)',composition:'none'});}
 function show(dialog){motion?.finishOpening();if(!dialog.open){dialog._return=document.activeElement;dialog.showModal();paperFeedback(dialog);}}
 function close(dialog){dialog.close();dialog._return?.isConnected&&dialog._return.focus({preventScroll:true});}
 if(!core||!store||!globalThis.SkyMotion||!globalThis.anime){$('#load-error').hidden=false;$('#load-message').textContent='页面文件或动画库未完整加载，请重新构建并加载扩展。';$('#notice').textContent='扩展文件加载不完整';return;}
 const papers=core.GROUPS.map(group=>{
  const section=el('section',undefined,'op-paper');section.setAttribute('aria-label',group.name);section.dataset.group=group.id;
  const content=el('div',undefined,'op-paper-content'),header=el('header'),head=button('',()=>{}),glyph=el('h2',group.glyph),caption=el('span',group.name),list=el('ul'),empty=el('p','此分类还没有网站','op-empty'),more=button('展开全部',()=>{}),add=button('＋ 添加网站',()=>openEditor({group:group.id}));
  head.className='op-paper-head';head.setAttribute('aria-label','展开'+group.name);head.setAttribute('aria-expanded','false');head.append(glyph,caption);header.append(head);more.className='op-more';add.className='op-add';add.hidden=true;content.append(header,list,empty,more,add);section.append(content);$('main').append(section);return section;
 });
 for(const group of core.GROUPS){const option=el('option',group.glyph+' · '+group.name);option.value=group.id;forms.editor.elements.group.append(option);}
 function renderPapers(){
  if(!state)return;
  papers.forEach((paper,index)=>{
   const group=core.GROUPS[index],list=paper.querySelector('ul');list.replaceChildren();
   for(const site of state.sites.filter(site=>site.group===group.id)){
    const row=el('li');row.dataset.site=site.id;row.dataset.search=[site.name,site.url,group.glyph,group.name].join(' ').toLocaleLowerCase();
    let item;
    if(organizing){item=button(site.name,()=>openEditor(site));item.className='site-edit';item.setAttribute('aria-label','编辑 '+site.name);}
    else{
     item=el('a',site.name);item.href=site.url;item.target='_blank';item.rel='noopener noreferrer';
     // Native anchors retain Ctrl/Cmd and middle-button behavior. Each gesture has one event.
     item.addEventListener('click',event=>{if(event.button===0)recordClick(site.id);});
     item.addEventListener('auxclick',event=>{if(event.button===1)recordClick(site.id);});
    }
    item.title=site.name+'\n'+site.url;row.append(item);list.append(row);
   }
   paper.querySelector('.op-add').hidden=!organizing;
  });
  $('#continue-draft').hidden=!state.draft;
  $('#organize').textContent=organizing?'完成整理':'整理';$('#organize').setAttribute('aria-pressed',String(organizing));
 }
 function receive(next){
  if(state&&next.revision<state.revision)return;
  const prior=state;state=next;
  // Statistics/draft notifications do not replace anchor nodes or steal keyboard focus.
  if(!prior||JSON.stringify(prior.sites)!==JSON.stringify(next.sites)){renderPapers();motion?.refresh();}
  $('#continue-draft').hidden=!next.draft;
  $('#rollback').disabled=!next.recoveryBackup;
  motion?.settings(next.settings);
  if(!$('#settings').open)fillSettings();
  if($('#trash').open)renderTrash();if($('#statistics').open)renderStats();
 }
 async function command(value){const response=await store.dispatch(value);receive(response.state);return response;}
 function recordClick(id){command({type:'click',id}).catch(error=>notice('网站仍可打开，但此次统计未保存：'+error.message,true));}
 function currentDraft(){const f=forms.editor.elements;return {...(editingId?{id:editingId}:{}),name:f.name.value,url:f.url.value,group:f.group.value};}
 function queueDraft(){
  if(editorBusy)return draftQueue;const draft=currentDraft(),version=++draftVersion;$('#draft-status').textContent='正在保存草稿…';
  // Keep input snapshots in event order; save/delete consume only their matching draft atomically.
  draftQueue=draftQueue.catch(()=>{}).then(()=>command({type:'draft',draft}));
  draftQueue.then(()=>{persistedDraftVersion=version;if(version===draftVersion)$('#draft-status').textContent='草稿已保存到本机';},error=>{$('#draft-status').textContent='草稿未保存：'+error.message;});return draftQueue;
 }
 function fillEditor(site){editingId=site.id||null;const f=forms.editor.elements;f.name.value=site.name||'';f.url.value=site.url||'';f.group.value=site.group||'tools';$('#editor-error').textContent='';$('#draft-status').textContent='';$('#delete-site').hidden=!editingId;$('#editor-title').textContent=editingId?'编辑网站':'添加网站';show($('#editor'));f.name.focus({preventScroll:true});}
 function openEditor(site=null,force=false){
  if(!state)return;
  const value=state.draft&&(!site||site.id&&state.draft.id===site.id)?state.draft:site||{group:'tools'};
  if(!force&&state.draft&&site&&(!site.id||state.draft.id!==site.id)){
   confirm('当前有未完成草稿。用这次编辑替换草稿？原网站不会因此删除。',async()=>{fillEditor(value);await queueDraft();});return;
  }
  fillEditor(value);queueDraft().catch(()=>{});
 }
 function editorLock(busy){editorBusy=busy;[...forms.editor.elements].forEach(item=>item.disabled=busy);}
 async function closeEditor(){
  if(editorBusy)return;editorLock(true);
  try{await draftQueue.catch(()=>{});await command({type:'draft',draft:currentDraft()});close($('#editor'));paperFeedback($('main'));}
  catch(error){$('#editor-error').textContent=error.message;}
  finally{editorLock(false);}
 }
 forms.editor.addEventListener('input',()=>queueDraft().catch(()=>{}));forms.editor.addEventListener('change',()=>queueDraft().catch(()=>{}));
 forms.editor.addEventListener('submit',async event=>{
  event.preventDefault();if(editorBusy)return;const site=currentDraft();editorLock(true);$('#editor-error').textContent='';
  try{await draftQueue.catch(()=>{});const result=await command({type:'saveSite',site,expectedDraft:site});editingId=result.result.site.id;close($('#editor'));paperFeedback($('main'));notice('网站已保存');}
  catch(error){$('#editor-error').textContent='未完成保存：'+error.message+'。输入仍在此处。';}
  finally{editorLock(false);}
 });
 $('#editor-close').addEventListener('click',()=>closeEditor());
 $('#editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
 $('#delete-site').addEventListener('click',()=>confirm('将这个网站移入收纳？之后可以恢复。',async()=>{
  if(editorBusy)return;const expectedDraft=currentDraft();editorLock(true);try{await draftQueue.catch(()=>{});await command({type:'deleteSite',id:editingId,expectedDraft});close($('#editor'));notice('已移入收纳，可从设置恢复');}finally{editorLock(false);}
 }));
 function confirm(message,action){confirmAction=action;$('#confirm-message').textContent=message;$('#confirm-error').textContent='';show($('#confirmation'));}
 $('#confirm-yes').addEventListener('click',async()=>{
  const b=$('#confirm-yes');b.disabled=true;try{await confirmAction?.();close($('#confirmation'));}catch(error){$('#confirm-error').textContent=error.message;}finally{b.disabled=false;}
 });
 function fillSettings(){if(!state)return;const f=forms.settings.elements;for(const key of ['engine','artPresence'])f[key].value=state.settings[key];f.openingEnabled.checked=state.settings.openingEnabled;$('#presence-output').textContent=state.settings.artPresence+'%';$('#rollback').disabled=!state.recoveryBackup;}
 forms.settings.elements.artPresence.addEventListener('input',()=>$('#presence-output').textContent=forms.settings.elements.artPresence.value+'%');
 forms.settings.addEventListener('submit',async event=>{event.preventDefault();const f=forms.settings.elements;try{await command({type:'settings',settings:{engine:f.engine.value,artPresence:Number(f.artPresence.value),openingEnabled:f.openingEnabled.checked}});notice('设置已保存');close($('#settings'));}catch(error){fail(error);}});
 function renderTrash(){
  const box=$('#trash-list');box.replaceChildren();if(!state.trash.length){box.append(el('p','收纳区为空'));return;}
  for(const item of state.trash){const row=el('div',undefined,'trash-row');row.append(el('span',item.site.name+' · '+core.GROUPS.find(g=>g.id===item.site.group).name),button('恢复',async event=>{const b=event.currentTarget;b.disabled=true;try{await command({type:'restoreSite',id:item.site.id});paperFeedback($('main'));notice('网站已恢复');}catch(error){b.disabled=false;fail(error);}}));box.append(row);}
 }
 function renderStats(){
  const box=$('#stats-content');box.replaceChildren();const today=new Date(),dates=Array.from({length:30},(_,i)=>{const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-(29-i));return day(d);}),days7=new Set(dates.slice(-7)),days30=new Set(dates);
  const sum=rows=>rows.reduce((n,r)=>n+r.count,0),metrics=el('div',undefined,'metrics');
  for(const [label,number]of [['总次数',sum(state.stats)],['近7天',sum(state.stats.filter(r=>days7.has(r.day)))],['近30天',sum(state.stats.filter(r=>days30.has(r.day)))]]){const p=el('p',label);p.append(el('strong',String(number)));metrics.append(p);}box.append(metrics);
  const byURL=new Map();for(const row of state.stats){let item=byURL.get(row.url);if(!item){item={...row,count:0};byURL.set(row.url,item);}item.count+=row.count;if(row.lastAt>item.lastAt){item.lastAt=row.lastAt;item.name=row.name;}}
  function ranking(title,items,recent){box.append(el('h3',title));if(!items.length){box.append(el('p','尚无打开记录'));return;}const list=el('ol');for(const item of items.slice(0,10)){const row=el('li',item.name+' — '+(recent?new Date(item.lastAt).toLocaleString():item.count+' 次'));row.title=item.url;list.append(row);}box.append(list);}
  ranking('常用排名',[...byURL.values()].sort((a,b)=>b.count-a.count),false);ranking('最近打开',[...byURL.values()].sort((a,b)=>b.lastAt.localeCompare(a.lastAt)),true);
  box.append(el('h3','30天时间趋势（本地日期）'));const table=el('table'),caption=el('caption','每天从主页发起的打开次数'),thead=el('thead'),tr=el('tr');for(const name of ['日期','次数','趋势'])tr.append(el('th',name));thead.append(tr);table.append(caption,thead);const tbody=el('tbody'),totals=dates.map(d=>sum(state.stats.filter(r=>r.day===d))),max=Math.max(1,...totals);
  dates.forEach((d,i)=>{const row=el('tr'),bar=el('span',undefined,'trend-bar');bar.style.width=(totals[i]/max*100)+'%';bar.setAttribute('aria-hidden','true');const td=el('td');td.append(bar);row.append(el('td',d),el('td',String(totals[i])),td);tbody.append(row);});table.append(tbody);box.append(table);
 }
 function splitBookmarkSource(rows){
  const valid=[],skipped=[];
  for(const row of rows){try{if(!row||typeof row.url!=='string'||!/^https?:\/\//i.test(row.url))throw Error('不是可导入的 HTTP/HTTPS 网站地址');core.normalizeURL(row.url);valid.push(row);}catch(error){skipped.push({name:String(row?.name||'未命名'),url:String(row?.url||''),reason:error.message});}}
  return {valid,skipped};
 }
 function startImport(value,label,sourceRows=null,recovery=false){
  let skipped=[],totalSource=null;
  if(sourceRows){const result=splitBookmarkSource(sourceRows);value=result.valid;skipped=result.skipped;totalSource=sourceRows.length;}
  importJob={value,label,skipped,totalSource,recovery};$('#import-mode').value=recovery?'replace':'merge';$('#import-mode').disabled=recovery;$('#keep-rollback').checked=true;
  $('#import-source').textContent=label;$('#confirm-import').textContent=recovery?'确认从完整备份恢复':'确认导入';$('#import-export').hidden=recovery;
  show($('#importer'));renderImport();
 }
 function renderImport(){
  if(!importJob)return;const job=importJob,mode=$('#import-mode').value,keepRollback=$('#keep-rollback').checked;
  $('#import-error').textContent='';$('#import-warning').textContent='';$('#import-groups').replaceChildren();$('#confirm-import').disabled=true;
  $('#rollback-choice').hidden=mode!=='replace'||job.recovery;
  try{
   if(job.recovery&&(!job.value||job.value.app!=='坐井观天'||!job.value.state))throw Error('损坏数据恢复只接受本应用导出的完整备份');
   const preview=core.previewImport(job.value,job.recovery?core.emptyState():state,mode,{keepRollback:job.recovery?false:keepRollback});job.preview=preview;
   const incoming=Array.isArray(job.value)?job.value.length:job.value.state.sites.length;
   const effective=job.recovery||mode==='replace'?preview.total:preview.total-state.sites.length;
   $('#import-summary').textContent=(job.totalSource!==null?'来源 '+job.totalSource+' 条，跳过 '+job.skipped.length+' 条，':'待导入 '+incoming+' 条，')+'重复 '+preview.duplicates+' 条；有效'+(mode==='merge'?'新增':'恢复')+' '+effective+' 个网站，导入后共 '+preview.total+' 个活动网站。'+(!Array.isArray(job.value)?'完整备份包括设置、统计、草稿和收纳。':'');
   $('#import-warning').textContent=job.recovery?'恢复会替换当前损坏记录；先保全原始值到本机恢复区，保全失败则不覆盖。':preview.warning||(mode==='replace'?'将替换网站、设置、统计、草稿与收纳；此次保留一次本机回退。':'合并保留当前设置和草稿，同网址去重。');
   $('#import-skipped').hidden=!job.skipped.length;const skipped=$('#import-skipped ul');skipped.replaceChildren();for(const row of job.skipped)skipped.append(el('li',row.name+' — '+row.url+'：'+row.reason));
   for(const group of core.GROUPS){const section=el('section',undefined,'import-group'),list=el('ul');section.append(el('h3',group.glyph+' · '+group.name+'（'+preview.counts[group.id]+'）'));for(const site of preview.state.sites.filter(s=>s.group===group.id)){const li=el('li',site.name);li.title=site.url;list.append(li);}section.append(list);$('#import-groups').append(section);}
   $('#confirm-import').disabled=false;
  }catch(error){job.preview=null;$('#import-summary').textContent='尚未导入，当前记录保持原样。';$('#import-error').textContent=error.message;}
 }
 async function acceptImport(){
  if(!importJob?.preview)return;const job=importJob,b=$('#confirm-import');b.disabled=true;
  try{
   if(job.recovery){const response=await store.recover(job.value,true);receive(response.state);$('#load-error').hidden=true;loading=false;ensureMotion();if(!unsubscribe)unsubscribe=store.subscribe(receive);}
   else await command({type:'import',value:job.value,mode:$('#import-mode').value,keepRollback:$('#keep-rollback').checked});
   notice('数据已保存到本机');close($('#importer'));
  }catch(error){$('#import-error').textContent=error.message+'。原有记录未被此次失败覆盖；可先导出，再取消回退重试。';b.disabled=false;}
 }
 function chooseFile(purpose){filePurpose=purpose;$('#json-file').value='';$('#json-file').click();}
 $('#json-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>core.MAX_IMPORT_BYTES)throw Error('文件超过 '+Math.floor(core.MAX_IMPORT_BYTES/1024/1024)+' MiB 导入上限');const value=JSON.parse(await file.text());startImport(value,file.name,null,filePurpose==='recovery');}catch(error){fail(error);}
 });
 $('#import-mode').addEventListener('change',renderImport);$('#keep-rollback').addEventListener('change',renderImport);$('#confirm-import').addEventListener('click',acceptImport);
 $('#cancel-import').addEventListener('click',()=>close($('#importer')));$('#import-export').addEventListener('click',exportState);
 $('#importer').addEventListener('close',()=>{importJob=null;if(initialPreview){initialPreview=false;startDailyOpening();}else if(!openingStarted&&!loading)startDailyOpening();});
 function seedPreview(){const rows=[...SkySeed.bookmarks,...SkySeed.shortcuts];startImport(null,SkySeed.bookmarks.length+' 条已保存书签 ＋ '+SkySeed.shortcuts.length+' 个吉他入口',rows);}
 $('#chrome-import').addEventListener('click',async()=>{
  if(!globalThis.chrome?.runtime?.id||!chrome.permissions?.request){notice('读取当前 Chrome 书签需要先安装此扩展；也可从 JSON 导入。');return;}
  try{
   // Request is made directly during this button gesture, before any awaited work.
   const granted=await chrome.permissions.request({permissions:['bookmarks']});if(!granted){notice('未获得书签读取权限；可使用已保存书签或 JSON 导入。');return;}
   const tree=await chrome.bookmarks.getTree();const rows=core.flattenBookmarks(tree);startImport(null,'当前 Chrome 书签（只读）',rows);
  }catch(error){fail(error);}
 });
 $('#seed-import').addEventListener('click',seedPreview);$('#file-import').addEventListener('click',()=>chooseFile('import'));$('#recovery-select').addEventListener('click',()=>chooseFile('recovery'));
 $('#backup-export').addEventListener('click',exportState);$('#stats-export').addEventListener('click',exportState);$('#raw-export').addEventListener('click',()=>exportRaw());$('#settings-raw').addEventListener('click',()=>exportRaw());$('#previous-raw').addEventListener('click',()=>exportRaw(true));
 $('#rollback').addEventListener('click',()=>confirm('恢复上次替换前的完整数据？当前网站、设置和统计会被替换。请先导出当前数据。',async()=>{await command({type:'restoreBackup'});notice('已恢复上次替换前数据');}));
 $('#stats-reset').addEventListener('click',()=>confirm('确认清除全部访问统计？网站、设置、草稿和收纳保持原样；此操作无法撤销，请先导出。',async()=>{await command({type:'resetStats'});notice('访问统计已重置');}));
 $('#organize').addEventListener('click',()=>{if(!state)return;organizing=!organizing;motion?.setSearch(false);renderPapers();motion?.refresh();});
 $('#continue-draft').addEventListener('click',()=>openEditor());$('#settings-open').addEventListener('click',()=>{if(state){fillSettings();show($('#settings'));}});$('#stats-open').addEventListener('click',()=>{if(state){renderStats();show($('#statistics'));}});$('#trash-open').addEventListener('click',()=>{renderTrash();show($('#trash'));});
 $('#opening-replay').addEventListener('click',()=>{close($('#settings'));motion?.playOpening(true,true);});$('#folio-open').addEventListener('click',()=>{close($('#settings'));motion?.openFolio();});
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>close(b.closest('dialog'))));
 document.querySelectorAll('dialog:not(#editor)').forEach(dialog=>dialog.addEventListener('close',()=>{if(dialog._return?.isConnected)dialog._return.focus({preventScroll:true});}));
 function ensureMotion(){if(motion)return;renderPapers();motion=SkyMotion.init(papers,{engine:value=>command({type:'settings',settings:{engine:value}}).catch(fail),error:fail});motion.settings(state.settings);}
 async function startDailyOpening(){
  if(openingStarted||loading)return;openingStarted=true;motion?.prepareOpening();
  try{const response=await command({type:'claimOpening',day:day()});motion.playOpening(response.result.playOpening);}catch(error){fail(error);motion?.playOpening(false);}
 }
 async function load(){
  try{
   const next=await store.get();receive(next);loading=false;$('#load-error').hidden=true;ensureMotion();
   if(!unsubscribe)unsubscribe=store.subscribe(receive);
   notice('');
   if(!state.sites.length&&!state.trash.length&&!state.lastVisitDay){
    // Default visual setting for a new install; no website is imported before confirmation.
    if(state.revision===0)await command({type:'settings',settings:{artPresence:88}});
    initialPreview=true;seedPreview();
   }else startDailyOpening();
  }catch(error){loading=true;$('#load-error').hidden=false;$('#load-message').textContent=error.message;notice('数据读取失败，请保全原始记录后重试或恢复。',true);}
 }
 $('#retry-load').addEventListener('click',load);
 window.addEventListener('pageshow',event=>{if(event.persisted)motion?.home();});
 window.addEventListener('focus',()=>{if(!document.querySelector('dialog[open]'))motion?.home();});
 window.addEventListener('beforeunload',event=>{if($('#editor').open&&(draftVersion>persistedDraftVersion||editorBusy)){event.preventDefault();event.returnValue='';}});
 // A missing script/library has a visible recovery message instead of leaving a blank homepage.
 if(!core||!store||!globalThis.SkyMotion||!globalThis.anime){$('#load-error').hidden=false;$('#load-message').textContent='页面文件或动画库未完整加载，请重新构建并加载扩展。';return;}
 load();
})();
