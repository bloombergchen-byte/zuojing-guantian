/* Adapted from prototypes/edge-collage.js. Same 21-node comic-to-album sequence,
 * Anime.js 4.5.0; original source catalogue in assets/sources.json. */
(() => {
 'use strict';
 globalThis.SkyMotion = {init};
 function init(papers, hooks) {
 const root=document.getElementById('sky-edge-collage'),stage=root.querySelector('.op-stage'),main=root.querySelector('main'),letters=[...root.querySelectorAll('.op-letter')],edgeGallery=root.querySelector('.op-edge-gallery'),rule=root.querySelector('.op-rule'),nav=root.querySelector('.op-nav'),search=root.querySelector('.op-search'),input=search.querySelector('input'),searchToggle=root.querySelector('.op-search-toggle'),folio=root.querySelector('.op-folio'),motion=globalThis.anime,total=6000;
 const assets=Object.fromEntries(Array.from({length:21},(_,i)=>{const id=String(i+1).padStart(2,'0');return [id,{src:'assets/'+id+'.webp'}];}));
 const compositions=[{main:'04'}];
 const state={scene:0,active:-1,searchOpen:false,mode:'web',query:'',engine:'google',folio:0};
 const openingPhase={p:0},searchPhase={p:0};let timeline=null,searchTimeline=null,layoutAnimation=null,frames=null,lastWidth=0,resizeQueued=false,folioReturn=null,folioAnimation=null,searchDriver=null,openingTakenOver=false;
 const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const save=()=>{};
 const edgeNodes=Array.from({length:21},(_,i)=>{const id=String(i+1).padStart(2,'0'),button=document.createElement('button'),sheet=document.createElement('span'),img=document.createElement('img');button.type='button';button.className='op-edge-item cursor-interaction';button.dataset.art=id;button.setAttribute('aria-label','查看原画 '+id);sheet.className='op-edge-sheet';img.src=assets[id].src;img.alt='';img.draggable=false;sheet.append(img);button.append(sheet);button.addEventListener('click',()=>openFolio(i));edgeGallery.append(button);return button;});

 function centerFrames(width,coarse=false,active=-1){
  const columns=width>=920?4:width>=620?2:1,margin=columns===4?Math.min(230,width*.16):columns===2?Math.max(72,width*.12):width<440?50:70,gap=columns===4?18:24,pw=(width-2*margin-gap*(columns-1))/columns;
  const angles=[-1.1,-.5,.5,1.1,-.8,0,.8],lift=columns===4?[0,12,12,0,8,0,8]:[0,5,0,5,0,5,0];
  papers.forEach(p=>p.style.width=pw+'px');
  const heights=papers.map(p=>Math.max(176,p.querySelector('.op-paper-content').scrollHeight+2));
  const top=columns===1?260:230,end=[];let y=top;
  for(let start=0;start<7;start+=columns){const count=Math.min(columns,7-start),left=(width-count*pw-(count-1)*gap)/2;for(let col=0;col<count;col++){const i=start+col;end.push({x:left+col*(pw+gap),y:y+lift[i],w:pw,h:heights[i],r:angles[i]});}y+=Math.max(...heights.slice(start,start+columns).map((h,i)=>h+lift[start+i]))+(columns===4?46:30);}
  return {end,margin,top,height:Math.max(innerHeight,...end.map(b=>b.y+b.h+ (columns===1?145:195)))};
 }
 function sync(){main.inert=state.searchOpen&&!(state.mode==='local'&&state.query.trim());nav.inert=false;edgeGallery.inert=false;}

function openingFrames(width,coarse=false,active=-1){const c=centerFrames(width,coarse,active),mobile=width<620,m=mobile?16:48,w=width-2*m,g=12,left=w*(mobile?.56:.36),right=w-left-g,start=mobile?Array.from({length:7},(_,i)=>({x:i===6?m:m+(i%2)*(w+g)/2,y:100+Math.floor(i/2)*168,w:i===6?w:(w-g)/2,h:i===6?108:156,r:0})):[{x:m,y:126,w:left,h:312,r:0},{x:m+left+g,y:82,w:right,h:108,r:0},{x:m+left+g,y:202,w:right*.53-6,h:182,r:0},{x:m+left+g+right*.53+6,y:202,w:right*.47-6,h:182,r:0},{x:m,y:450,w:left,h:106,r:0},{x:m+left+g,y:396,w:right*.53-6,h:160,r:0},{x:m+left+g+right*.53+6,y:396,w:right*.47-6,h:160,r:0}],glyphs=[0,1,2,3].map(i=>[(width-(mobile?176:352))/2+i*(mobile?44:88),mobile?22:0]);return {...c,start,glyphs,titleX:c.margin,titleY:mobile?130:136,titleScale:mobile?.76:.45};}
 // Same 21 nodes form the comic page and travel to a continuous, lightly overlapping album rim.
function albumFrames(panels,lead='04'){const ids=[['04','01','05'],['10','02','03'],['15','18','19'],['06','07','08'],['17','16','21'],['09','11','12'],['13','14','20']].flat(),swap=ids.indexOf(lead);[ids[0],ids[swap]]=[ids[swap],ids[0]];return panels.flatMap((b,i)=>{const g=4,tall=b.h>150,left=(b.w-g)*.62,half=(b.h-g)/2,boxes=tall?[{x:b.x,y:b.y,w:left,h:b.h},{x:b.x+left+g,y:b.y,w:b.w-left-g,h:half},{x:b.x+left+g,y:b.y+half+g,w:b.w-left-g,h:half}]:[0,1,2].map(j=>({x:b.x+j*(b.w+g)/3,y:b.y,w:(b.w-2*g)/3,h:b.h}));return boxes.map((box,j)=>({...box,id:ids[i*3+j],r:0,order:i*3+j}));});}
function edgeFrames(width,height,margin){const mobile=width<620,band=mobile?62:margin-20,top=mobile?82:112,bottom=mobile?100:148,step=(height-top-bottom+34)/6,items=[],add=(id,x,y,w,h,r,side,position='50% 50%')=>items.push({id,x,y,w,h,r,side,position});
  ['10','02','17','03'].forEach((id,i)=>{const w=width*[.30,.30,.29,.30][i],h=top+[4,12,0,8][i];add(id,width*[.10,.365,.63,.90][i]-w/2,-12+[2,-3,0,4][i],w,h,[-4,3,-3,4][i],'top',id==='03'?'50% 20%':'50% 40%');});
  ['04','01','05','06','07','08'].forEach((id,i)=>{const w=band*[1.04,.98,.96,1.05,1.02,1][i],h=step*[1.20,1.15,1.22,1.18,1.16,1.25][i],x=mobile?-16:[-10,-3,-7,-14,-4,-9][i];add(id,x,top-25+i*step,w,h,[-4,3,-4,4,-3,3][i],'left',['50% 45%','30% 25%','50% 45%','72% 40%','50% 50%','50% 45%'][i]);});
  ['15','18','19','20','16','21'].forEach((id,i)=>{const w=band*[1.04,.97,1.02,.98,.96,1.04][i],h=step*[1.24,1.18,1.16,1.20,1.22,1.24][i],x=width-w+(mobile?16:[10,2,12,6,-1,9][i]);add(id,x,top-22+i*step,w,h,[4,-3,4,-4,3,-3][i],'right',['50% 45%','50% 40%','45% 50%','50% 55%','50% 25%','50% 45%'][i]);});
  ['09','11','12','13','14'].forEach((id,i)=>{const w=width*.25,h=bottom+[10,-4,12,0,8][i];add(id,width*[.06,.28,.50,.72,.94][i]-w/2,height-h+8,w,h,[-4,3,-4,4,-3][i],'bottom',['50% 25%','35% 40%','50% 68%','50% 42%','50% 50%'][i]);});return items;
 }
function layoutEdges(height){const boxes=edgeFrames(stage.clientWidth,height,frames.margin);for(const b of boxes){const n=edgeNodes[Number(b.id)-1];Object.assign(n.style,{left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px',transform:'rotate('+b.r+'deg)'});n.dataset.side=b.side;n.style.setProperty('--edge-in-x',b.side==='left'?'12px':b.side==='right'?'-12px':'0px');n.style.setProperty('--edge-in-y',b.side==='bottom'?'-10px':b.side==='top'?'10px':'-4px');n.querySelector('img').style.objectPosition=b.position;}return boxes;}
function build(time=total){stopLayout();timeline?.revert();timeline=null;frames=openingFrames(stage.clientWidth,matchMedia('(pointer: coarse)').matches,state.active);stage.style.height=frames.height+'px';lastWidth=stage.clientWidth;const tl=motion.createTimeline({defaults:{composition:'none'},autoplay:false,onRender:sync,onComplete:sync});openingPhase.p=0;tl.add(openingPhase,{p:[0,1],duration:total,ease:'linear'},0);
  papers.forEach((paper,i)=>{const a=frames.start[i],b=frames.end[i];Object.assign(paper.style,{left:a.x+'px',top:a.y+'px',width:a.w+'px',height:a.h+'px'});paper.querySelector('button').setAttribute('aria-expanded',String(state.active===i));tl.add(paper,{clipPath:['inset(0 0 100% 0)','inset(0 0 0% 0)'],opacity:[0,1],duration:700,ease:'inOut(3)'},i*65).add(paper,{left:[a.x,b.x],top:[a.y,b.y],width:[a.w,b.w],height:[a.h,b.h],rotate:[0,b.r],duration:1550,ease:'inOut(4)'},2800+i*65).add(paper.querySelector('.op-paper-content'),{opacity:[0,1],y:[16,0],duration:650,ease:'out(3)'},4180+i*50);});
  const ends=layoutEdges(frames.height),starts=albumFrames(frames.start,compositions[state.scene].main);edgeGallery.style.zIndex='3';tl.add(edgeGallery,{zIndex:[3,1],duration:1},4700);
  starts.forEach(a=>{const n=edgeNodes[Number(a.id)-1],b=ends.find(b=>b.id===a.id);Object.assign(n.style,{left:a.x+'px',top:a.y+'px',width:a.w+'px',height:a.h+'px',transform:'rotate(0deg)'});tl.add(n,{clipPath:['inset(0 100% 0 0)','inset(0 0% 0 0)'],opacity:[0,1],duration:600,ease:'out(3)'},80+a.order*18).add(n,{left:[a.x,b.x],top:[a.y,b.y],width:[a.w,b.w],height:[a.h,b.h],rotate:[0,b.r],duration:1900,ease:'inOut(4)'},2100+a.order*32);});
  // Reuse Codrops fx2/fx11 reveal/stretch methods through the existing local Anime.js 4.5.0 timeline.
  letters.forEach((letter,i)=>{const [x,y]=frames.glyphs[i];Object.assign(letter.style,{left:x+'px',top:y+'px'});tl.add(letter.querySelector('span'),{clipPath:['inset(0 0 100% 0)','inset(0 0 0% 0)'],x:[i%2?22:-22,0],scaleX:[.55,1],scaleY:[1.65,1],opacity:[0,1],duration:850,ease:'out(4)'},320+i*100).add(letter,{x:[0,(i%2?1:-1)*22],y:[0,i<2?-15:15],rotate:[0,(i%2?1:-1)*3],duration:500,ease:'inOut(3)'},2100+i*55).add(letter,{left:[x,frames.titleX+i*36],top:[y,frames.titleY],x:[(i%2?1:-1)*22,0],y:[i<2?-15:15,0],rotate:[(i%2?1:-1)*3,0],scaleX:[1,frames.titleScale],scaleY:[1,frames.titleScale],duration:1500,ease:'inOut(4)'},3150+i*130);});
  Object.assign(rule.style,{left:frames.titleX+'px',right:frames.titleX+'px',top:(frames.titleY+(stage.clientWidth<620?92:61))+'px'});Object.assign(nav.style,{left:'',right:frames.titleX+'px',top:(frames.titleY+(stage.clientWidth<620?47:0))+'px'});tl.add(rule,{scaleX:[0,1],opacity:[0,1],duration:750,ease:'out(3)'},4800).add(nav,{opacity:[0,1],duration:450},4700);timeline=tl;tl.seek(Math.max(0,Math.min(total,time)));sync();}

 function stopLayout(){layoutAnimation?.pause();layoutAnimation=null;}
 function finishOpening(){if(timeline&&openingPhase.p<1){stopLayout();timeline.pause().seek(total);}sync();}
 function updateRows(){
  state.query=input.value;const q=state.query.trim().toLocaleLowerCase(),local=state.searchOpen&&state.mode==='local'&&!!q,indices=[];let count=0;
  papers.forEach((paper,i)=>{
   const rows=[...paper.querySelectorAll('[data-site]')],found=rows.filter(row=>row.dataset.search.includes(q));
   paper.dataset.expanded=String(state.active===i||local);
   rows.forEach((row,j)=>{row.hidden=local?!found.includes(row):state.active!==i&&j>=5;});
   if(local&&found.length){indices.push(i);count+=found.length;}
   paper.querySelector('.op-more').hidden=local||rows.length<=5;
   paper.querySelector('.op-more').textContent=state.active===i?'收起':'展开全部 '+rows.length+' 个网站';
   paper.querySelector('.op-paper-head').setAttribute('aria-expanded',String(state.active===i));
   paper.querySelector('.op-empty').hidden=rows.length>0;
   paper.inert=local&&!found.length;
  });
  search.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  search.querySelector('select').hidden=state.mode==='local';search.querySelector('[type="submit"]').hidden=state.mode==='local';
  input.placeholder=state.mode==='local'?'查找网站、网址或分类':'搜索全网或输入网址';
  search.querySelector('.op-search-result').textContent=state.mode==='local'?(q?(count?count+' 个匹配网站':'没有匹配的网站'):'输入网站名称、网址或分类'):'Enter 搜索 · Esc 返回纸面';
  return local?indices:[];
 }
 function renderResults(){return updateRows();}
 function searchFrames(width,rest,matching=[]){
  const c=centerFrames(width),bar=Math.min(500,width-2*c.margin),top=width<620?305:280,columns=width>=920?3:width>=620?2:1;
  const centers=rest.map((r,i)=>({x:i%2?width-22:22-r.w,y:220+Math.floor(i/2)*150,w:r.w,h:r.h,r:i%2?6:-6,opacity:.20}));
  let y=top+180;
  for(let start=0;start<matching.length;start+=columns){const row=matching.slice(start,start+columns),rw=row.reduce((sum,i)=>sum+rest[i].w,0)+(row.length-1)*20;let x=(width-rw)/2;for(const i of row){const r=rest[i];centers[i]={x,y,w:r.w,h:r.h,r:0,opacity:1};x+=r.w+20;}y+=Math.max(...row.map(i=>rest[i].h))+28;}
  return {bar,top,centers,height:Math.max(c.height,y+195)};
 }
 function cancelSearchDriver(){searchDriver?.pause();searchDriver=null;}
 function revertSearch(){const previous=searchTimeline;searchTimeline=null;previous?.revert();}
 function buildSearch(progress=0){
  cancelSearchDriver();revertSearch();finishOpening();updateRows();build(total);
  const scene=searchFrames(stage.clientWidth,frames.end,renderResults()),w=stage.clientWidth,tl=motion.createTimeline({defaults:{composition:'none'},autoplay:false,onRender:syncSearch,onComplete:syncSearch});searchPhase.p=0;
  tl.add(searchPhase,{p:[0,1],duration:1500,ease:'linear'},0);Object.assign(search.style,{left:(w-scene.bar)/2+'px',top:scene.top+'px',width:scene.bar+'px'});stage.style.height=scene.height+'px';
  papers.forEach((paper,i)=>{const a=frames.end[i],b=scene.centers[i];tl.add(paper,{left:[a.x,b.x],top:[a.y,b.y],rotate:[a.r,b.r],opacity:[1,b.opacity],duration:950,ease:'inOut(4)'},140+i*30);});
  letters.forEach((letter,i)=>tl.add(letter,{left:[frames.titleX+i*36,(w-scene.bar)/2+i*(scene.bar/4)],top:[frames.titleY,scene.top+48],scaleX:[frames.titleScale,.6],scaleY:[frames.titleScale,.18],opacity:[1,0],rotate:[0,i%2?6:-6],duration:900,ease:'inOut(4)'},i*65));
  tl.add(search,{opacity:[0,1],clipPath:['inset(0 100% 0 0)','inset(0 0% 0 0)'],duration:600,ease:'inOut(3)'},750).add(rule,{opacity:[1,0],duration:300},0);
  layoutEdges(scene.height);searchTimeline=tl;tl.seek(progress*1500);syncSearch();
 }
 function syncSearch(){
  search.inert=!state.searchOpen;searchToggle.setAttribute('aria-expanded',String(state.searchOpen));
  main.inert=state.searchOpen&&!(state.mode==='local'&&state.query.trim());
  if(!state.searchOpen&&searchPhase.p===0&&searchTimeline)closeSearchImmediately();
 }
 function driveSearch(open){
  cancelSearchDriver();const start=searchTimeline.currentTime,end=open?1500:0;
  if(reduce()||start===end){searchTimeline.seek(end);syncSearch();return;}
  // One scalar driver always uses actual current time; rapid reversals never toggle direction blindly.
  const clock={t:start};searchDriver=motion.animate(clock,{t:end,duration:Math.max(1,Math.abs(end-start)),ease:'linear',onRender:()=>searchTimeline?.seek(clock.t),onComplete:syncSearch});
 }
 function setSearch(open){
  if(!open&&!state.searchOpen&&!searchTimeline)return;
  finishOpening();state.searchOpen=open;search.hidden=false;updateRows();
  if(!searchTimeline)buildSearch(0);
  driveSearch(open);if(open)input.focus({preventScroll:true});else searchToggle.focus({preventScroll:true});syncSearch();
 }
 function closeSearchImmediately(){cancelSearchDriver();state.searchOpen=false;revertSearch();searchPhase.p=0;search.hidden=true;search.inert=true;updateRows();build(total);}
 function refresh(){
  const open=state.searchOpen;cancelSearchDriver();revertSearch();updateRows();build(total);
  if(open){search.hidden=false;buildSearch(1);}else{search.hidden=true;search.inert=true;searchPhase.p=0;}
 }
 function expandPaper(index){
  finishOpening();if(state.searchOpen)closeSearchImmediately();
  const old=papers.map(p=>({left:p.offsetLeft,top:p.offsetTop,height:p.offsetHeight}));
  state.active=state.active===index?-1:index;updateRows();build(total);
  if(!reduce())layoutAnimation=motion.animate(papers,{left:(_,i)=>[old[i].left,frames.end[i].x],top:(_,i)=>[old[i].top,frames.end[i].y],height:(_,i)=>[old[i].height,frames.end[i].h],duration:350,ease:'inOut(3)',composition:'none'});
 }
 function playOpening(full=true,manual=false){
  if(openingTakenOver&&!manual){finishOpening();return;}
  closeSearchImmediately();state.active=-1;updateRows();
  if(reduce()||!full){build(total);if(!reduce())motion.animate(main,{opacity:[.5,1],y:[5,0],duration:200,composition:'none'});return;}
  build(0);timeline.play();
 }
 function destination(query,engine){
  const text=query.trim();if(!text)return null;
  if(/^[a-z][a-z\d+.-]*:/i.test(text)&&!/^https?:/i.test(text))throw Error('网址只允许 HTTP 或 HTTPS');
  if(/^https?:\/\//i.test(text)||/^(?:[a-z\d-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(text))return SkyCore.normalizeURL(text);
  const u=new URL({google:'https://www.google.com/search',bing:'https://www.bing.com/search',baidu:'https://www.baidu.com/s'}[engine]||'https://www.google.com/search');u.searchParams.set(engine==='baidu'?'wd':'q',text);return u.href;
 }

function renderFolio(){folioAnimation?.revert();folioAnimation=null;const id=String(state.folio+1).padStart(2,'0');folio.querySelector('img').src=assets[id].src;folio.querySelector('img').alt='原作候选 '+id;folio.querySelector('output').textContent=id+' / 21';if(folio.open&&!reduce())folioAnimation=motion.animate(folio.querySelector('img'),{clipPath:['inset(0 100% 0 0)','inset(0 0% 0 0)'],x:[12,0],opacity:[.5,1],duration:380,ease:'out(3)',composition:'none'});save();}
function openFolio(index=-1){finishOpening();if(index>=0)state.folio=index;folioReturn=document.activeElement;renderFolio();folio.showModal();save();}
 searchToggle.addEventListener('click',()=>setSearch(!state.searchOpen));root.querySelector('.op-search-close').addEventListener('click',()=>setSearch(false));
 input.addEventListener('input',()=>{state.query=input.value;if(state.mode==='local'){const pos=input.selectionStart;refresh();input.focus({preventScroll:true});try{input.setSelectionRange(pos,pos);}catch{}}else updateRows();});
 search.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;refresh();input.focus({preventScroll:true});}));
 search.querySelector('select').addEventListener('change',e=>{state.engine=e.target.value;hooks.engine(state.engine);});
 search.querySelector('form').addEventListener('submit',e=>{e.preventDefault();if(state.mode==='local')return;try{const url=destination(input.value,state.engine);if(url)window.open(url,'_blank','noopener,noreferrer');}catch(error){hooks.error(error);}});
 root.querySelector('.op-folio-close').addEventListener('click',()=>folio.close());root.querySelector('.op-folio-prev').addEventListener('click',()=>{state.folio=(state.folio+20)%21;renderFolio();});root.querySelector('.op-folio-next').addEventListener('click',()=>{state.folio=(state.folio+1)%21;renderFolio();});folio.addEventListener('close',()=>folioReturn?.focus({preventScroll:true}));
 papers.forEach((paper,i)=>{paper.querySelector('.op-paper-head').addEventListener('click',()=>expandPaper(i));paper.querySelector('.op-more').addEventListener('click',()=>expandPaper(i));});
 root.addEventListener('pointerdown',()=>{openingTakenOver=true;finishOpening();},{capture:true});
 document.addEventListener('keydown',event=>{
  openingTakenOver=true;
  if(openingPhase.p<1)finishOpening();
  if(document.querySelector('dialog[open]'))return;
  if(event.key==='Escape'){if(state.searchOpen)setSearch(false);else if(state.active>=0)expandPaper(state.active);}
  if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)){event.preventDefault();setSearch(true);}
 });
 updateRows();build(total);
 new ResizeObserver(()=>{if(resizeQueued||Math.abs(stage.clientWidth-lastWidth)<1)return;resizeQueued=true;requestAnimationFrame(()=>{
  resizeQueued=false;const p=searchPhase.p,open=state.searchOpen,hasSearch=!!searchTimeline,running=!!searchDriver&&!searchDriver.paused,time=timeline.currentTime,openingRunning=!timeline.paused;
  cancelSearchDriver();revertSearch();stopLayout();updateRows();build(hasSearch?total:time);
  if(hasSearch&&(open||p>0)){search.hidden=false;buildSearch(p);if(running&&!reduce())driveSearch(open);}else{search.hidden=true;search.inert=true;searchPhase.p=0;}
  if(openingRunning&&!reduce()&&!hasSearch)timeline.play();
 });}).observe(stage);
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{finishOpening();if(searchTimeline){cancelSearchDriver();searchTimeline.seek(state.searchOpen?1500:0);syncSearch();}});
 return {refresh,finishOpening,playOpening,prepareOpening(){openingTakenOver=false;},openFolio,setSearch,home(){openingTakenOver=true;closeSearchImmediately();state.active=-1;refresh();},settings(settings){state.engine=settings.engine;search.querySelector('select').value=settings.engine;root.style.setProperty('--edge-presence',String(settings.artPresence/100));}};
 }
})();
