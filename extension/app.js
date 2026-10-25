/* Local-only UI for SkyCore / SkyStore. User strings use textContent or value. */
(() => {
 'use strict';
 const $=selector=>document.querySelector(selector),core=globalThis.SkyCore,store=globalThis.SkyStore;
 let state=null,motion=null,organizing=false,loading=true,editingId=null,editorBusy=false,draftQueue=Promise.resolve(),filePurpose='import',importJob=null,initialPreview=false,openingStarted=false;
 let noticeTimer,confirmAction=null,unsubscribe=null,draftVersion=0,persistedDraftVersion=0,importBusy=false,editorOrigin=null,editorAnimations=[],statsRange='30',cloudBusy=false;
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
 function paperFeedback(node){if(!reduced()&&globalThis.anime)anime.animate(node,{opacity:[.7,1],y:[6,0],duration:220,ease:'out(3)',composition:'none',onComplete:()=>node.style.removeProperty('transform')});}
 function show(dialog){motion?.finishOpening();if(!dialog.open){dialog._return=document.activeElement;dialog.showModal();if(dialog.id==='editor')animateEditor(true);else paperFeedback(dialog);}}
 function close(dialog){if(dialog.id==='editor')return animateEditor(false);dialog.close();dialog._return?.isConnected&&dialog._return.focus({preventScroll:true});}
 function animateEditor(open){
  const dialog=$('#editor'),sheet=dialog.querySelector('.editor-sheet'),aside=dialog.querySelector('.editor-context'),current=sheet.getBoundingClientRect();editorAnimations.forEach(a=>a.cancel());editorAnimations=[];
  const final=sheet.getBoundingClientRect(),source=editorOrigin?.getBoundingClientRect(),valid=source&&source.width&&source.bottom>0&&source.top<innerHeight;
  const pose=r=>'translate('+(r.left-final.left)+'px,'+(r.top-final.top)+'px) scale('+(r.width/final.width)+','+(r.height/final.height)+')';
  const finish=()=>{editorAnimations.forEach(a=>a.cancel());editorAnimations=[];dialog.style.removeProperty('overflow');if(!open){dialog.close();const target=dialog._return?.isConnected?dialog._return:editorOrigin?.querySelector('.op-paper-head');target?.focus({preventScroll:true});}};
  if(reduced()){finish();return Promise.resolve();}
  // Let the moving paper cross the dialog bounds; restore native scrolling at rest.
  dialog.style.overflow='visible';
  const duration=open?360:280,a=sheet.animate([{transform:open?(valid?pose(source):'translateY(12px)'):pose(current),opacity:1},{transform:open?'none':valid?pose(source):'translateY(12px)',opacity:open?1:.25}],{duration,easing:'cubic-bezier(.22,.75,.22,1)',fill:'both'});editorAnimations.push(a);
  for(const node of sheet.querySelectorAll('h2,form'))editorAnimations.push(node.animate([{opacity:open?0:1},{opacity:open?1:0}],{duration:open?180:100,delay:open?100:0,fill:'both'}));
  editorAnimations.push(aside.animate([{opacity:open?0:1,transform:open?'translateX(12px)':'none'},{opacity:open?1:0,transform:open?'none':'translateX(12px)'}],{duration:180,fill:'both'}));
  return a.finished.then(finish).catch(()=>{});
 }
 function editorContext(){const group=core.GROUPS.find(g=>g.id===forms.editor.elements.group.value);$('#editor-glyph').textContent=group.glyph;$('#editor-category').textContent=group.name;}
 if(!core||!store||!globalThis.SkyMotion||!globalThis.SkyStats||!globalThis.anime){$('#load-error').hidden=false;$('#load-message').textContent='页面文件或动画库未完整加载，请重新构建并加载扩展。';$('#notice').textContent='扩展文件加载不完整';return;}
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
    if(organizing){item=button('',()=>openEditor(site));item.append(el('span',site.name),el('span','编辑','site-edit-cue'));item.className='site-edit';item.setAttribute('aria-label','编辑 '+site.name);}
    else{
     item=el('a',site.name);item.href=site.url;item.target='_self';
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
 const legacySiteNames=new Map(); // Personal title migrations stay on the local device.
 async function cleanLegacySiteNames(){
  for(const site of state.sites.slice()){
   const name=legacySiteNames.get(site.name);
   if(!name||state.draft?.id===site.id)continue;
   try{await command({type:'saveSite',site:{...site,name}});}catch(error){return error.message||'请稍后重试';}
  }
  return '';
 }
 function recordClick(id){command({type:'click',id}).catch(error=>notice('网站仍可打开，但此次统计未保存：'+error.message,true));}
 function currentDraft(){const f=forms.editor.elements;return {...(editingId?{id:editingId}:{}),name:f.name.value,url:f.url.value,group:f.group.value};}
 function queueDraft(){
  if(editorBusy)return draftQueue;const draft=currentDraft(),version=++draftVersion;$('#draft-status').textContent='正在保存草稿…';
  // Keep input snapshots in event order; save/delete consume only their matching draft atomically.
  draftQueue=draftQueue.catch(()=>{}).then(()=>command({type:'draft',draft}));
  draftQueue.then(()=>{persistedDraftVersion=version;if(version===draftVersion)$('#draft-status').textContent='草稿已保存到本机';},error=>{$('#draft-status').textContent='草稿未保存：'+error.message;});return draftQueue;
 }
 function fillEditor(site){editingId=site.id||null;const f=forms.editor.elements;f.name.value=site.name||'';f.url.value=site.url||'';f.group.value=site.group||'tools';editorOrigin=papers[core.GROUPS.findIndex(g=>g.id===(state.sites.find(s=>s.id===editingId)?.group||f.group.value))];editorContext();$('#editor-error').textContent='';$('#draft-status').textContent='';$('#delete-site').hidden=!editingId;$('#editor-title').textContent=editingId?'编辑网站':'添加网站';show($('#editor'));f.name.focus({preventScroll:true});}
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
  try{await draftQueue.catch(()=>{});await command({type:'draft',draft:currentDraft()});await close($('#editor'));}
  catch(error){$('#editor-error').textContent=error.message;}
  finally{editorLock(false);}
 }
 forms.editor.addEventListener('input',()=>queueDraft().catch(()=>{}));forms.editor.addEventListener('change',()=>queueDraft().catch(()=>{}));
 forms.editor.addEventListener('submit',async event=>{
  event.preventDefault();if(editorBusy)return;const site=currentDraft();editorLock(true);$('#editor-error').textContent='';
  try{await draftQueue.catch(()=>{});const result=await command({type:'saveSite',site,expectedDraft:site});editingId=result.result.site.id;await close($('#editor'));notice('网站已保存');}
  catch(error){$('#editor-error').textContent='未完成保存：'+error.message+'。输入仍在此处。';}
  finally{editorLock(false);}
 });
 $('#editor-close').addEventListener('click',()=>closeEditor());
 $('#editor-back').addEventListener('click',()=>closeEditor());forms.editor.elements.group.addEventListener('change',editorContext);
 $('#editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
 $('#delete-site').addEventListener('click',()=>confirm('将这个网站移入收纳？之后可以恢复。',async()=>{
  if(editorBusy)return;const expectedDraft=currentDraft();editorLock(true);try{await draftQueue.catch(()=>{});await command({type:'deleteSite',id:editingId,expectedDraft});await close($('#editor'));notice('已移入收纳，可从设置恢复');}finally{editorLock(false);}
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
  const box=$('#stats-content'),focus=document.activeElement?.dataset,focusRange=focus?.statsRange,focusBin=focus?.statsBin,oldDetails=box.querySelector('.stats-details'),detailsOpen=oldDetails?.open,summaryFocused=document.activeElement===oldDetails?.querySelector('summary');
  const data=SkyStats.summarize(state.stats,statsRange),number=n=>n.toLocaleString('zh-CN'),short=d=>d.slice(5).replace('-','/'),period=b=>b.start===b.end?b.start:b.start+' 至 '+b.end;
  box.replaceChildren();const hero=el('section',undefined,'stats-summary');
  for(const [label,value]of [['累计打开',data.metrics.total],['近7天',data.metrics.days7],['近30天',data.metrics.days30],['访问网站',data.metrics.unique]]){const p=el('p',undefined,'stats-metric');p.append(el('span',label),el('strong',number(value)));hero.append(p);}box.append(hero);
  const toolbar=el('nav',undefined,'stats-range');toolbar.setAttribute('aria-label','统计时间范围');
  for(const [value,label]of [['7','7天'],['30','30天'],['all','全部']]){const b=button(label,()=>{statsRange=value;renderStats();box.querySelector('[data-stats-range="'+value+'"]').focus({preventScroll:true});});b.dataset.statsRange=value;b.setAttribute('aria-pressed',String(statsRange===value));toolbar.append(b);}
  const rangeDate=data.start.slice(0,4)===data.end.slice(0,4)?short:d=>d;
  toolbar.append(el('span',rangeDate(data.start)+' — '+rangeDate(data.end)+' · '+number(data.total)+' 次','stats-period'));box.append(toolbar);
  const chart=el('figure',undefined,'stats-trend'),caption=el('figcaption','打开趋势'),hint=el('p',data.total?'选择柱条查看日期与次数':'尚无打开记录。从主页打开网站后会在这里显示。','stats-chart-hint');chart.append(caption);
  const svg=(tag,attrs={},text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));if(text!==undefined)n.textContent=text;return n;};
  const plotWidth=Math.max(240,Math.min(960,innerWidth-(innerWidth>700?120:60))),graph=svg('svg',{viewBox:'0 0 '+plotWidth+' 216',role:'group','aria-label':'打开趋势，'+data.bins.length+'个日期区间',class:'stats-chart'}),defs=svg('defs'),pattern=svg('pattern',{id:'stats-ink-dots',width:4,height:4,patternUnits:'userSpaceOnUse'});pattern.append(svg('circle',{cx:1,cy:1,r:.65,fill:'currentColor'}));defs.append(pattern);graph.append(defs);
  const max=Math.max(1,...data.bins.map(b=>b.count)),step=(plotWidth-80)/data.bins.length;
  for(const value of [0,Math.ceil(max/2),max].filter((v,i,a)=>a.indexOf(v)===i)){const y=178-value/max*146;graph.append(svg('line',{x1:48,y1:y,x2:plotWidth-24,y2:y,class:'stats-gridline'}),svg('text',{x:36,y:y+4,'text-anchor':'end',class:'stats-axis'},number(value)));}
  data.bins.forEach((bin,i)=>{
   const x=48+i*step+step*.15,h=Math.max(2,bin.count/max*146),bar=svg('rect',{x,y:178-h,width:Math.max(1,step*.7),height:h,class:'stats-bar',tabindex:0,role:'img','aria-label':period(bin)+'，'+bin.count+'次','data-stats-bin':i});bar.append(svg('title',{},period(bin)+' · '+number(bin.count)+' 次'));
   const inspect=()=>hint.textContent=period(bin)+' · '+number(bin.count)+' 次';bar.addEventListener('pointerenter',inspect);bar.addEventListener('focus',inspect);bar.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const j=(i+(e.key==='ArrowLeft'?-1:1)+data.bins.length)%data.bins.length;graph.querySelector('[data-stats-bin="'+j+'"]').focus();});graph.append(bar);
   if(i===0||i===data.bins.length-1||data.bins.length<=7&&plotWidth>=480||i===Math.floor(data.bins.length/2))graph.append(svg('text',{x:x+step*.35,y:202,'text-anchor':'middle',class:'stats-axis'},short(bin.start)));
  });chart.append(graph,hint);box.append(chart);
  const columns=el('div',undefined,'stats-columns'),ranking=el('section',undefined,'stats-ranking'),recent=el('section',undefined,'stats-recent');ranking.append(el('h3','常用网站'));recent.append(el('h3','最近打开'));
  if(!data.ranking.length){ranking.append(el('p','这个时间范围内没有打开记录。','stats-empty'));recent.append(el('p','尚无记录','stats-empty'));}
  const rankList=el('ol'),peak=data.ranking[0]?.count||1;
  data.ranking.slice(0,8).forEach((item,i)=>{const row=el('li',undefined,'stats-rank-row'),name=el('span',item.name,'stats-site-name'),track=el('span',undefined,'stats-rank-track'),ink=el('span');ink.style.width=item.count/peak*100+'%';track.setAttribute('aria-hidden','true');track.append(ink);name.title=item.name+'\n'+item.url;row.append(el('span',String(i+1).padStart(2,'0'),'stats-position'),name,el('strong',number(item.count)+' 次'),track);rankList.append(row);});ranking.append(rankList);
  const recentList=el('ol');data.recent.slice(0,6).forEach(item=>{const row=el('li'),name=el('span',item.name),when=el('time',new Date(item.lastAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}));name.title=item.url;when.dateTime=item.lastAt;row.append(name,when);recentList.append(row);});recent.append(recentList);columns.append(ranking,recent);box.append(columns);
  const details=el('details',undefined,'stats-details'),table=el('table'),head=el('tr');details.append(el('summary','查看日期与次数明细'));for(const label of ['日期','打开次数'])head.append(el('th',label));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');for(const bin of data.bins){const tr=el('tr');tr.append(el('td',period(bin)),el('td',number(bin.count)));body.append(tr);}table.append(body);details.append(table);box.append(details);
  details.open=!!detailsOpen;
  if(summaryFocused)details.querySelector('summary').focus({preventScroll:true});else if(focusRange)box.querySelector('[data-stats-range="'+focusRange+'"]')?.focus({preventScroll:true});else if(focusBin)box.querySelector('[data-stats-bin="'+focusBin+'"]')?.focus({preventScroll:true});
 }
 let statsResizeQueued=false;
 addEventListener('resize',()=>{if(!$('#statistics').open||statsResizeQueued)return;statsResizeQueued=true;requestAnimationFrame(()=>{statsResizeQueued=false;if($('#statistics').open)renderStats();});});
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
  if(!importJob?.preview||importBusy)return;const job=importJob,b=$('#confirm-import');b.disabled=true;importBusy=true;
  try{
   if(job.recovery){const response=await store.recover(job.value,true);receive(response.state);$('#load-error').hidden=true;loading=false;ensureMotion();if(!unsubscribe)unsubscribe=store.subscribe(receive);}
   else await command({type:'import',value:job.value,mode:$('#import-mode').value,keepRollback:$('#keep-rollback').checked});
   notice('数据已保存到本机');close($('#importer'));
  }catch(error){$('#import-error').textContent=error.message+'。原有记录未被此次失败覆盖；可先导出，再取消回退重试。';b.disabled=false;}finally{importBusy=false;}
 }
 function chooseFile(purpose){filePurpose=purpose;$('#json-file').value='';$('#json-file').click();}
 $('#json-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>core.MAX_IMPORT_BYTES)throw Error('文件超过 '+Math.floor(core.MAX_IMPORT_BYTES/1024/1024)+' MiB 导入上限');const value=JSON.parse(await file.text());startImport(value,file.name,null,filePurpose==='recovery');}catch(error){fail(error);}
 });
 $('#import-mode').addEventListener('change',renderImport);$('#keep-rollback').addEventListener('change',renderImport);$('#confirm-import').addEventListener('click',acceptImport);
 $('#cancel-import').addEventListener('click',()=>{if(!importBusy)close($('#importer'));});$('#import-export').addEventListener('click',exportState);
 $('#importer').addEventListener('close',()=>{importJob=null;if(initialPreview){initialPreview=false;startBrowserOpening();}else if(!openingStarted&&!loading)startBrowserOpening();});
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
 const cloudOpen=button('同步与备份',async()=>{show($('#cloud-dialog'));await cloudAction('Status');});cloudOpen.id='cloud-open';$('#settings .settings-actions').prepend(cloudOpen);
 $('#cloud-dialog').addEventListener('close',()=>{$('#cloud-token').value='';});
 function cloudView(s){$('#cloud-enabled').checked=s.enabled;$('#cloud-status').textContent=s.status+(s.at?' · '+new Date(s.at).toLocaleString('zh-CN'):'');$('#cloud-id').textContent='扩展 ID：'+s.extensionId+(s.version?' · 已加载版本 '+s.version:'');$('#cloud-repository').value=s.repository;$('#cloud-token').placeholder=s.hasToken?'令牌已保存在此设备，留空保持不变':'填写仅授权此私有仓库的令牌';$('#cloud-backup-status').textContent=s.backupAt?'最近上传：'+new Date(s.backupAt).toLocaleString('zh-CN'):'尚未上传完整备份';
  if(/^[a-f0-9]{40}$/.test(s.backupCommit||'')&&/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)){const a=el('a',' · 查看提交 '+s.backupCommit.slice(0,7));a.href='https://github.com/'+s.repository+'/commit/'+s.backupCommit;a.target='_blank';a.rel='noopener noreferrer';$('#cloud-backup-status').append(a);}
  $('#cloud-conflict').hidden=!s.conflict;if(s.conflict)$('#cloud-conflict-info').textContent='本机 '+s.conflict.localSites+' 个网站，云端 '+s.conflict.cloudSites+' 个网站。两边都有修改；选择前可先导出当前完整数据。';}
 async function cloudAction(type,value={}){if(cloudBusy)return;cloudBusy=true;$('#cloud-error').textContent='';const buttons=[...$('#cloud-dialog').querySelectorAll('button,input')];buttons.forEach(n=>n.disabled=true);try{const r=await store.cloud(type,value);if(r.cloud)cloudView(r.cloud);return r;}catch(e){$('#cloud-error').textContent=e.message;}finally{cloudBusy=false;buttons.forEach(n=>n.disabled=false);}}
 $('#cloud-enabled').addEventListener('change',async e=>{const enabled=e.target.checked;await cloudAction('Configure',{enabled});if(enabled)await cloudAction('Sync');});$('#cloud-check').addEventListener('click',()=>cloudAction('Sync'));
 $('#cloud-use-local').addEventListener('click',()=>confirm('用本机日常数据更新云端？其他设备尚未同步的修改将形成冲突，访问统计不参与此次同步。',()=>cloudAction('Sync',{resolve:'local'})));
 $('#cloud-use-remote').addEventListener('click',()=>confirm('使用云端网站、设置与收纳？会先保存本机完整备份，访问统计和草稿留在本机。',async()=>{await cloudAction('Sync',{resolve:'cloud'});}));
 $('#cloud-export-previous').addEventListener('click',async()=>{const r=await cloudAction('BeforePull');if(r?.value)download(r.value,'坐井观天-同步前备份-'+day()+'.json');else if(r)$('#cloud-error').textContent='尚无同步前的本机备份';});
 $('#cloud-save-github').addEventListener('click',async()=>{if(cloudBusy)return;$('#cloud-error').textContent='';try{if(!globalThis.chrome?.permissions||!await chrome.permissions.request({origins:['https://api.github.com/*']}))throw Error('未授予 GitHub 连接权限，配置未保存');const token=$('#cloud-token').value,value={repository:$('#cloud-repository').value.trim()};if(token)value.token=token;const r=await cloudAction('Configure',value);if(r)$('#cloud-token').value='';}catch(e){$('#cloud-error').textContent=e.message;}});
 $('#cloud-forget-token').addEventListener('click',async()=>{await cloudAction('Configure',{token:''});$('#cloud-token').value='';});$('#cloud-github-upload').addEventListener('click',()=>cloudAction('Backup'));$('#cloud-github-download').addEventListener('click',async()=>{const r=await cloudAction('Download');if(r?.value){close($('#cloud-dialog'));close($('#settings'));startImport(r.value,'GitHub 私有仓库完整备份');}});
 for(const [label,url]of [['创建私有备份仓库','https://github.com/new?name=zuojing-guantian-sync&visibility=private'],['创建细粒度令牌','https://github.com/settings/personal-access-tokens/new']]){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('#cloud-links').append(a);}
 $('#organize').addEventListener('click',()=>{if(!state)return;organizing=!organizing;motion?.setSearch(false);renderPapers();motion?.refresh();});
 $('#continue-draft').addEventListener('click',()=>openEditor());$('#settings-open').addEventListener('click',()=>{if(state){fillSettings();show($('#settings'));}});$('#stats-open').addEventListener('click',()=>{if(state){renderStats();show($('#statistics'));}});$('#trash-open').addEventListener('click',()=>{renderTrash();show($('#trash'));});
 $('#opening-replay').addEventListener('click',()=>{close($('#settings'));motion?.playOpening(true,true);});$('#folio-open').addEventListener('click',()=>{close($('#settings'));motion?.openFolio();});
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{const dialog=b.closest('dialog');if(dialog.id==='confirmation'&&$('#confirm-yes').disabled||dialog.id==='cloud-dialog'&&cloudBusy)return;close(dialog);}));
 document.querySelectorAll('dialog:not(#editor)').forEach(dialog=>dialog.addEventListener('close',()=>{if(dialog._return?.isConnected)dialog._return.focus({preventScroll:true});}));
 // A backdrop gesture must start and end outside the same topmost dialog.
 document.querySelectorAll('dialog').forEach(dialog=>{
  let press=null;
  const busy=()=>dialog.id==='editor'?editorBusy:dialog.id==='importer'?importBusy:dialog.id==='cloud-dialog'?cloudBusy:dialog.id==='confirmation'&&$('#confirm-yes').disabled;
  const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',e=>{press=e.button===0&&outside(e)?e.pointerId:null;});
  dialog.addEventListener('pointercancel',()=>{press=null;});
  dialog.addEventListener('pointerup',e=>{const dismiss=press===e.pointerId&&outside(e);press=null;if(!dismiss||busy())return;if(dialog.id==='editor')closeEditor();else close(dialog);});
  dialog.addEventListener('cancel',e=>{if(busy())e.preventDefault();});
 });
 function ensureMotion(){if(motion)return;renderPapers();motion=SkyMotion.init(papers,{engine:value=>command({type:'settings',settings:{engine:value}}).catch(fail),error:fail});motion.settings(state.settings);}
 async function startBrowserOpening(){
  if(openingStarted||loading)return;openingStarted=true;motion?.prepareOpening();
  try{const response=await command({type:'claimOpening',day:day()});motion.playOpening(response.result.playOpening);}catch(error){fail(error);motion?.playOpening(false);}
 }
 async function load(){
  try{
   const next=await store.get();receive(next);const cleanupError=await cleanLegacySiteNames();loading=false;$('#load-error').hidden=true;ensureMotion();
   if(!unsubscribe)unsubscribe=store.subscribe(receive);
   notice(cleanupError?'网站命名整理未完成：'+cleanupError:'',Boolean(cleanupError));
   if(!state.sites.length&&!state.trash.length&&!state.lastVisitDay){
    // Default visual setting for a new install; no website is imported before confirmation.
    if(state.revision===0)await command({type:'settings',settings:{artPresence:88}});
    initialPreview=true;seedPreview();
   }else startBrowserOpening();
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
