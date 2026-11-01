'use strict';
(() => {
 const KEY='sky-home-v1',$=selector=>document.querySelector(selector),form=$('#site-form'),nameInput=$('#site-name'),groupsNode=$('#groups'),statusNode=$('#status');
 let state=null,currentPage=null,editing=null,baseSite=null,group='',selectedAction='',manualAction=false,actionChanged=false,picker=null,busy=false,entryEpoch=0,draftQueue=Promise.resolve(),storedDraft=null,confirmedDraft=null,draftSequence=0,confirmedSequence=0,failedSequence=0,pendingDrafts=0,retriedSequence=0,latestDraft=null,staleDraft=false,recommendTimer;
 const setStatus=(text,kind='')=>{statusNode.textContent=text;statusNode.className=`op-status ${kind}`.trim();};
 const setBusy=value=>{busy=value;form.inert=value;for(const button of $('#duplicates-list').querySelectorAll('button'))button.disabled=value;};
 let compatible=false,handshake;
 async function message(type,command){
  if(!compatible){handshake||=chrome.runtime.sendMessage({channel:KEY,type:'handshake'}).then(result=>{if(!result?.ok||result.protocol!==1)throw Error('后台版本不兼容');compatible=true;}).catch(()=>{handshake=null;throw Error('扩展后台尚未更新，请在 Chrome 扩展程序页重新加载“坐井观天”。');});await handshake;}
  const result=await chrome.runtime.sendMessage({channel:KEY,type,...(command?{command}:{})});if(!result?.ok)throw Error(result?.error||'本机数据读取或保存失败');return result;
 }
 const hostname=url=>{try{return new URL(url).hostname.toLowerCase().replace(/\.$/,'');}catch{return '';}};
 function matches(url){const host=hostname(url);return host?state.sites.filter(site=>hostname(site.url)===host):[];}
 const displaySite=()=>({...(editing?{id:editing.id}:{}),name:nameInput.value,url:editing?.url||currentPage.url,group});
 const groupName=id=>SkyCore.GROUPS.find(item=>item.id===id)?.name||'';
 function setGroup(value){group=value;for(const button of groupsNode.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.group===group));}
 function drawGroups(){
  groupsNode.replaceChildren();
  for(const item of SkyCore.GROUPS){
   const button=document.createElement('button'),glyph=document.createElement('span'),name=document.createElement('span');button.type='button';button.className='op-paper-choice';button.dataset.group=item.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',item.name);
   glyph.className='op-paper-glyph';glyph.setAttribute('aria-hidden','true');glyph.textContent=item.glyph;name.className='op-paper-name';name.textContent=item.name;button.append(glyph,name);
   button.addEventListener('click',()=>{if(busy)return;clearTimeout(recommendTimer);setStatus('');setGroup(item.id);if(editing)queueDraft();else if(!manualAction)selectRecommended();updatePicker();});groupsNode.append(button);
  }
 }
 function updateSource(){
  const selected=SkyActions.resolve(selectedAction,state.sites),source=$('#source-icon');
  source.replaceChildren(...(selected?[SkyActions.renderIcon(editing?.url||currentPage.url,selected,editing?.id)]:[]));
 }
 function updatePicker(){if(!picker)return;picker.update({site:displaySite(),sites:state.sites,selected:selectedAction});updateSource();}
 function selectRecommended(){selectedAction=SkyActions.recommend(displaySite(),state.sites)[0]?.id||'';}
 function currentDraft(){return {id:editing.id,name:nameInput.value,url:editing.url,group};}
 function queueDraft(){
  if(!editing||actionChanged||staleDraft)return;
  const snapshot=currentDraft(),expected=storedDraft,sequence=++draftSequence;
  // Send immediately: the popup can be destroyed as soon as it loses focus.
  // CAS chains our submitted snapshots without overwriting another popup's draft.
  latestDraft=snapshot;storedDraft=snapshot;sendDraft(snapshot,expected,sequence);
 }
 function sendDraft(snapshot,expected,sequence){
  pendingDrafts++;
  const request=message('dispatch',{type:'setPopupDraft',draft:snapshot,expectedDraft:expected,expectedUrl:editing.url}).then(()=>{
   if(sequence>confirmedSequence){confirmedSequence=sequence;confirmedDraft=snapshot;}
   if(sequence===draftSequence){storedDraft=snapshot;failedSequence=0;setStatus('草稿已保存到本机','success');}
   else if(failedSequence===draftSequence)storedDraft=confirmedDraft;
  },error=>{
   if(sequence<confirmedSequence)return;
   if(sequence===draftSequence){failedSequence=sequence;storedDraft=confirmedDraft;}
   setStatus('草稿保存失败：'+(error.message||'请重试'),'error');
  }).finally(()=>{
   pendingDrafts--;
   if(!pendingDrafts&&!busy&&!actionChanged&&!staleDraft&&failedSequence===draftSequence&&retriedSequence!==draftSequence){
    retriedSequence=draftSequence;storedDraft=latestDraft;sendDraft(latestDraft,confirmedDraft,draftSequence);
   }
  });
  draftQueue=Promise.all([draftQueue,request]).then(()=>{});
 }
 async function waitForDrafts(){for(;;){const pending=draftQueue;await pending;if(pending===draftQueue)return;}}
 async function chooseAction(action){
  if(busy||!action)return;
  clearTimeout(recommendTimer);
  if(action===selectedAction){manualAction=true;return;}
  if(!editing){selectedAction=action;manualAction=true;updateSource();return;}
  const before=selectedAction;setBusy(true);setStatus('正在保存动作…');
  try{
   // Action and draft removal must reach the worker together even if the popup closes.
   const command={type:'setIconChoice',id:editing.id,action,expectedUrl:editing.url};
   if(!staleDraft)command.expectedPopupDraft=storedDraft;
   const result=await message('dispatch',command);state=result.state;selectedAction=action;manualAction=true;actionChanged=true;
   const otherDraft=!staleDraft&&result.result?.discarded===false;staleDraft=staleDraft||otherDraft;
   storedDraft=null;confirmedDraft=null;$('#popup-draft-note').textContent=otherDraft?'动作已生效；未能清除另一窗口或较早的草稿。':staleDraft?'旧网址草稿仍保留；本次未保存的修改关闭时会放弃。':'动作已生效；未保存的其他修改关闭时会放弃。';setStatus('动作已生效','success');
  }catch(error){selectedAction=before;setStatus('动作未保存：'+(error.message||'请重试'),'error');}
  finally{setBusy(false);updatePicker();}
 }
 function restoreDraft(site){
  const draft=state.popupDrafts?.[site.id];
  if(!draft)return null;
  try{const a=new URL(draft.url),b=new URL(site.url);return a.origin+a.pathname===b.origin+b.pathname?draft:null;}catch{return null;}
 }
 async function openForm(site=null){
  const epoch=++entryEpoch;setBusy(true);$('#duplicates').hidden=true;form.hidden=false;
  editing=site?{...site}:null;baseSite=site?{...site}:null;manualAction=!!site;actionChanged=false;draftQueue=Promise.resolve();storedDraft=site?restoreDraft(site):null;confirmedDraft=storedDraft;draftSequence=0;confirmedSequence=0;failedSequence=0;pendingDrafts=0;retriedSequence=0;latestDraft=null;staleDraft=!!(site&&state.popupDrafts?.[site.id]&&!storedDraft);
  $('#popup-draft-note').textContent=staleDraft?'已保留旧网址的快捷草稿；本次修改不会覆盖该草稿。':storedDraft?'已恢复未保存的修改。':'';
  nameInput.value=storedDraft?.name??site?.name??currentPage.name;drawGroups();setGroup(storedDraft?.group??site?.group??'');
  $('#page-heading').textContent=site?'编辑已收藏的网站':'添加网站';$('#page-host').textContent=hostname(site?.url||currentPage.url);
  $('#save-site').textContent=site?'保存修改':'确认添加';$('#back-duplicates').hidden=matches(currentPage.url).length<2;
  try{
   const current=site?await SkyActions.current(site,state):null;
   if(epoch!==entryEpoch)return;
   selectedAction=current||SkyActions.recommend(displaySite(),state.sites)[0]?.id||'';
   picker?.destroy();picker=SkyActions.mount($('#action-picker'),{site:displaySite(),sites:state.sites,selected:selectedAction,onSelect:chooseAction});updateSource();setStatus(staleDraft?'已保留旧网址的快捷草稿；本次修改不会覆盖该草稿。':storedDraft?'已恢复未保存的修改':'',staleDraft?'error':'');
  }catch(error){setStatus('动作列表加载失败：'+(error.message||'请重试'),'error');}
  finally{if(epoch===entryEpoch)setBusy(false);}
 }
 function showMatches(items){
  entryEpoch++;picker?.destroy();picker=null;form.hidden=true;$('#source-icon').replaceChildren();$('#duplicates').hidden=false;$('#page-heading').textContent='选择已收藏的网站';$('#page-host').textContent=hostname(currentPage.url);const list=$('#duplicates-list');list.replaceChildren();
  for(const site of items){const button=document.createElement('button'),label=document.createElement('span'),category=document.createElement('small');button.type='button';label.textContent=site.name;category.textContent=groupName(site.group);button.append(label,category);button.addEventListener('click',()=>openForm(site));list.append(button);}
  setStatus('');
 }
 function routeCurrent(){const found=matches(currentPage.url);if(found.length===1)openForm(found[0]);else if(found.length>1)showMatches(found);else openForm();}
 function conflictAwareEdit(latest){
  if(!latest)throw Error('此网站已被移走，请重新打开快捷添加。');
  if(latest.url!==baseSite.url)throw Error('网址已在其他窗口修改，请重新打开快捷添加。');
  const desiredName=nameInput.value.trim(),nameChanged=desiredName!==baseSite.name,groupChanged=group!==baseSite.group;
  if(nameChanged&&latest.name!==baseSite.name&&latest.name!==desiredName)throw Error('名称已在其他窗口修改，请重新打开后检查。');
  if(groupChanged&&latest.group!==baseSite.group&&latest.group!==group)throw Error('分类已在其他窗口修改，请重新打开后检查。');
  return {...latest,name:nameChanged?desiredName:latest.name,group:groupChanged?group:latest.group};
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  clearTimeout(recommendTimer);if(!editing&&!manualAction){selectRecommended();updatePicker();}
  if(!nameInput.value.trim()){setStatus('请填写网站名称。','error');nameInput.focus();return;}
  if(!group){setStatus('请选择分类。','error');groupsNode.querySelector('button')?.focus();return;}
  if(!selectedAction){setStatus('请选择露琪亚动作。','error');return;}
  setBusy(true);setStatus('正在保存…');
  try{
   await waitForDrafts();const latest=await message('get');state=latest.state;
   let command;
   if(editing){const site=conflictAwareEdit(state.sites.find(item=>item.id===editing.id));command={type:'saveSite',site,expectedUrl:baseSite.url,expectedSite:state.sites.find(item=>item.id===editing.id),expectedPopupDraft:confirmedDraft};}
   else command={type:'saveSite',site:{name:nameInput.value.trim(),url:currentPage.url,group},iconAction:selectedAction,expectedNoHost:true};
   const response=await message('dispatch',command);state=response.state;const saved=response.result.site;
   editing={...saved};baseSite={...saved};storedDraft=null;confirmedDraft=null;failedSequence=0;staleDraft=!!state.popupDrafts?.[saved.id];actionChanged=false;manualAction=true;$('#popup-draft-note').textContent=staleDraft?'另有未保存的快捷草稿；本次修改不会覆盖它。':'';$('#page-heading').textContent='编辑已收藏的网站';$('#save-site').textContent='保存修改';setStatus('已保存','success');
  }catch(error){setStatus((/该域名已在主页/.test(error.message)?'该域名刚被收藏，请重新打开快捷添加以编辑。':error.message)||'保存失败，请重试。','error');}
  finally{setBusy(false);}
 });
 nameInput.addEventListener('input',()=>{setStatus('');if(editing)queueDraft();else if(!manualAction){clearTimeout(recommendTimer);recommendTimer=setTimeout(()=>{if(!editing&&!manualAction){selectRecommended();updatePicker();}},180);}});
 $('#back-duplicates').addEventListener('click',async()=>{if(busy)return;try{await waitForDrafts();const result=await message('get');state=result.state;showMatches(matches(currentPage.url));}catch(error){setStatus(error.message||'无法读取已有网站','error');}});
 async function init(){
  try{
   if(!globalThis.SkyCore||!globalThis.SkySiteIcons||!globalThis.SkyActions)throw Error('扩展文件未完整加载，请重新加载扩展。');
   const [tabs,result]=await Promise.all([chrome.tabs.query({active:true,lastFocusedWindow:true}),message('get')]);const tab=tabs[0],url=SkyCore.normalizeURL(tab?.url||'');state=result.state;
   currentPage={url,name:[...String(tab.title||'').trim()].slice(0,120).join('')||hostname(url)};routeCurrent();
  }catch(error){$('#page-heading').textContent='当前页面无法添加';$('#page-host').textContent='请检查页面地址或本机数据';setStatus(error.message||'无法读取当前页面','error');}
 }
 init();
})();
