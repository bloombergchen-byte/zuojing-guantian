'use strict';
const KEY='sky-home-v1', titleNode=document.querySelector('#page-title'), hostNode=document.querySelector('#page-host'), groupsNode=document.querySelector('#groups'), statusNode=document.querySelector('#status');
let page;
const setStatus=(text,kind='')=>{statusNode.textContent=text;statusNode.className=`op-status ${kind}`.trim();};
function showGroups(){
 for(const group of SkyCore.GROUPS){
  const button=document.createElement('button');button.type='button';button.className='op-paper-choice';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',`添加到${group.name}`);button.dataset.group=group.id;
  const glyph=document.createElement('span');glyph.className='op-paper-glyph';glyph.setAttribute('aria-hidden','true');glyph.textContent=group.glyph;
  const name=document.createElement('span');name.className='op-paper-name';name.textContent=group.name;button.append(glyph,name);
  button.addEventListener('click',()=>addTo(group,button));groupsNode.append(button);
 }
}
async function addTo(group,selected){
 for(const button of groupsNode.children)button.disabled=true;
 try{
  const response=await chrome.runtime.sendMessage({channel:KEY,type:'dispatch',command:{type:'saveSite',site:{name:page.name,url:page.url,group:group.id}}});
  if(!response?.ok)throw new Error(response?.error||'本机保存失败，请重试');
  selected.setAttribute('aria-pressed','true');setStatus(`已加入「${group.name}」`,'success');
 }catch(error){
  setStatus(/已存在/.test(error.message)?'这个网址已在主页或收纳中。':`加入失败：${error.message||'请重试'}`,'error');
  for(const button of groupsNode.children)button.disabled=false;
 }
}
async function init(){
 try{
  const tab=(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
  const url=SkyCore.normalizeURL(tab?.url||'');
  page={url,name:[...String(tab.title||'').trim()].slice(0,120).join('')||new URL(url).hostname};
  titleNode.textContent=page.name;hostNode.textContent=new URL(url).host;showGroups();setStatus('');
 }catch(error){
  titleNode.textContent='当前页面无法添加';hostNode.textContent='请切换到普通 HTTP 或 HTTPS 网页';setStatus(error.message||'无法读取当前网页','error');
 }
}
init();