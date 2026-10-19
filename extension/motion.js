/* Adapted from prototypes/edge-collage.js. Same 21-node comic-to-album sequence,
 * Anime.js 4.5.0; original source catalogue in assets/sources.json. */
(() => {
 'use strict';
 globalThis.SkyMotion = {init};
 function init(papers, hooks) {
 const root=document.getElementById('sky-edge-collage'),stage=root.querySelector('.op-stage'),main=root.querySelector('main'),letters=[...root.querySelectorAll('.op-letter')],edgeGallery=root.querySelector('.op-edge-gallery'),rule=root.querySelector('.op-rule'),nav=root.querySelector('.op-nav'),search=root.querySelector('.op-search'),input=search.querySelector('input'),searchToggle=root.querySelector('.op-search-toggle'),folio=root.querySelector('.op-folio'),motion=globalThis.anime,total=6000;
 const assets=Object.fromEntries(Array.from({length:21},(_,i)=>{const id=String(i+1).padStart(2,'0');return [id,{src:'assets/'+id+'.webp'}];}));
 const compositions=[{main:'04'}];
 const state={scene:0,active:-1,searchOpen:false,searchVisible:false,mode:'web',query:'',engine:'google',folio:0};
 const openingPhase={p:0},searchPhase={p:0};let timeline=null,searchTimeline=null,layoutAnimation=null,frames=null,lastWidth=0,lastHeight=0,resizeQueued=false,folioReturn=null,folioAnimation=null,searchDriver=null,openingTakenOver=false,searchEpoch=0,searchQueued=false,edgeLayoutKey='';
 const searchDuration=2300,inkCanvas=document.createElement('canvas');inkCanvas.className='op-search-ink';inkCanvas.setAttribute('aria-hidden','true');stage.append(inkCanvas);const inkContext=inkCanvas.getContext('2d');let ink=null,inkKey='';
 const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const save=()=>{};
 const edgeNodes=Array.from({length:21},(_,i)=>{const id=String(i+1).padStart(2,'0'),button=document.createElement('button'),sheet=document.createElement('span'),img=document.createElement('img');button.type='button';button.className='op-edge-item cursor-interaction';button.dataset.art=id;button.setAttribute('aria-label','查看原画 '+id);sheet.className='op-edge-sheet';img.src=assets[id].src;img.alt='';img.draggable=false;sheet.append(img);button.append(sheet);button.addEventListener('click',()=>openFolio(i));edgeGallery.append(button);return button;});

 function centerFrames(width,coarse=false,active=-1){
  const snap=n=>Math.round(n*(globalThis.devicePixelRatio||1))/(globalThis.devicePixelRatio||1);
  const columns=width>=920?4:width>=620?2:1,margin=columns===4?Math.min(230,width*.16):columns===2?Math.max(72,width*.12):width<440?50:70,gap=columns===4?18:24,pw=snap((width-2*margin-gap*(columns-1))/columns);
  const angles=[-1.1,-.5,.5,1.1,-.8,0,.8],lift=columns===4?[0,12,12,0,8,0,8]:[0,5,0,5,0,5,0];
  papers.forEach(p=>p.style.width=pw+'px');
  const heights=papers.map(p=>Math.max(176,p.querySelector('.op-paper-content').scrollHeight+2));
  const top=columns===1?260:230,end=[];let y=top;
  for(let start=0;start<7;start+=columns){const count=Math.min(columns,7-start),left=(width-count*pw-(count-1)*gap)/2;for(let col=0;col<count;col++){const i=start+col;end.push({x:snap(left+col*(pw+gap)),y:snap(y+lift[i]),w:pw,h:heights[i],r:angles[i]});}y+=Math.max(...heights.slice(start,start+columns).map((h,i)=>h+lift[start+i]))+(columns===4?46:30);}
  return {end,margin,top,height:Math.max(innerHeight,...end.map(b=>b.y+b.h+ (columns===1?145:195)))};
 }
 function sync(){main.inert=state.searchVisible&&(!state.searchOpen||!(state.mode==='local'&&state.query.trim()));nav.inert=false;edgeGallery.inert=false;}

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
function settleHome(){
 timeline?.pause();frames=openingFrames(stage.clientWidth);lastWidth=stage.clientWidth;lastHeight=innerHeight;stage.style.height=frames.height+'px';openingPhase.p=1;
 papers.forEach((paper,i)=>{const b=frames.end[i];Object.assign(paper.style,{left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px',transform:'none',clipPath:'none',opacity:'1'});paper.style.setProperty('--paper-angle',b.r+'deg');Object.assign(paper.querySelector('.op-paper-content').style,{opacity:'1',transform:'none'});});
 letters.forEach((letter,i)=>{Object.assign(letter.style,{left:frames.titleX+i*36+'px',top:frames.titleY+'px',fontSize:(stage.clientWidth<620?32:36)+'px',transform:'none',opacity:'1'});Object.assign(letter.firstElementChild.style,{transform:'none',opacity:'1',clipPath:'none'});});
 Object.assign(rule.style,{left:frames.titleX+'px',right:frames.titleX+'px',top:frames.titleY+(stage.clientWidth<620?92:61)+'px',transform:'none',opacity:'1'});Object.assign(nav.style,{right:frames.titleX+'px',top:frames.titleY+(stage.clientWidth<620?47:0)+'px',opacity:'1'});
 const key=[stage.clientWidth,frames.height,frames.margin].join(':');if(key!==edgeLayoutKey){layoutEdges(frames.height);edgeLayoutKey=key;}edgeGallery.style.zIndex='1';edgeNodes.forEach(n=>Object.assign(n.style,{clipPath:'none',opacity:'1'}));sync();
}
function build(time=total){stopLayout();if(time>=total){settleHome();return;}timeline?.revert();timeline=null;frames=openingFrames(stage.clientWidth,matchMedia('(pointer: coarse)').matches,state.active);frames.glyphs.forEach(p=>p[1]=Math.max(32,p[1]));edgeLayoutKey='';papers.forEach(p=>p.style.setProperty('--paper-angle','0deg'));letters.forEach(l=>l.style.fontSize=stage.clientWidth<620?'40px':'80px');stage.style.height=frames.height+'px';lastWidth=stage.clientWidth;const tl=motion.createTimeline({defaults:{composition:'none'},autoplay:false,onRender:sync,onComplete:settleHome});openingPhase.p=0;tl.add(openingPhase,{p:[0,1],duration:total,ease:'linear'},0);
  // A replay starts from the same hidden layers as the first visit, rather
  // than leaving settled inline opacity visible before each delayed reveal.
  nav.style.opacity='0';rule.style.opacity='0';papers.forEach(p=>{p.style.opacity='0';Object.assign(p.querySelector('.op-paper-content').style,{opacity:'0',transform:'translateY(16px)'});});letters.forEach(l=>l.firstElementChild.style.opacity='0');
  papers.forEach((paper,i)=>{const a=frames.start[i],b=frames.end[i];Object.assign(paper.style,{left:a.x+'px',top:a.y+'px',width:a.w+'px',height:a.h+'px'});paper.querySelector('button').setAttribute('aria-expanded',String(state.active===i));tl.add(paper,{clipPath:['inset(0 0 100% 0)','inset(0 0 0% 0)'],opacity:[0,1],duration:700,ease:'inOut(3)'},i*65).add(paper,{left:[a.x,b.x],top:[a.y,b.y],width:[a.w,b.w],height:[a.h,b.h],rotate:[0,b.r],duration:1550,ease:'inOut(4)'},2800+i*65).add(paper.querySelector('.op-paper-content'),{opacity:[0,1],y:[16,0],duration:650,ease:'out(3)'},4180+i*50);});
  const ends=layoutEdges(frames.height),starts=albumFrames(frames.start,compositions[state.scene].main);edgeGallery.style.zIndex='3';tl.add(edgeGallery,{zIndex:[3,1],duration:1},4700);
  starts.forEach(a=>{const n=edgeNodes[Number(a.id)-1],b=ends.find(b=>b.id===a.id);Object.assign(n.style,{left:a.x+'px',top:a.y+'px',width:a.w+'px',height:a.h+'px',transform:'rotate(0deg)'});tl.add(n,{clipPath:['inset(0 100% 0 0)','inset(0 0% 0 0)'],opacity:[0,1],duration:600,ease:'out(3)'},80+a.order*18).add(n,{left:[a.x,b.x],top:[a.y,b.y],width:[a.w,b.w],height:[a.h,b.h],rotate:[0,b.r],duration:1900,ease:'inOut(4)'},2100+a.order*32);});
  // Reuse Codrops fx2/fx11 reveal/stretch methods through the existing local Anime.js 4.5.0 timeline.
  letters.forEach((letter,i)=>{const [x,y]=frames.glyphs[i];Object.assign(letter.style,{left:x+'px',top:y+'px'});tl.add(letter.querySelector('span'),{clipPath:['inset(0 0 100% 0)','inset(0 0 0% 0)'],x:[i%2?22:-22,0],scaleX:[.55,1],scaleY:[1.65,1],opacity:[0,1],duration:850,ease:'out(4)'},320+i*100).add(letter,{x:[0,(i%2?1:-1)*22],y:[0,i<2?-15:15],rotate:[0,(i%2?1:-1)*3],duration:500,ease:'inOut(3)'},2100+i*55).add(letter,{left:[x,frames.titleX+i*36],top:[y,frames.titleY],x:[(i%2?1:-1)*22,0],y:[i<2?-15:15,0],rotate:[(i%2?1:-1)*3,0],scaleX:[1,frames.titleScale],scaleY:[1,frames.titleScale],duration:1500,ease:'inOut(4)'},3150+i*130);});
  Object.assign(rule.style,{left:frames.titleX+'px',right:frames.titleX+'px',top:(frames.titleY+(stage.clientWidth<620?92:61))+'px'});Object.assign(nav.style,{left:'',right:frames.titleX+'px',top:(frames.titleY+(stage.clientWidth<620?47:0))+'px'});tl.add(rule,{scaleX:[0,1],opacity:[0,1],duration:750,ease:'out(3)'},4800).add(nav,{opacity:[0,1],duration:450},4700);timeline=tl;tl.seek(Math.max(0,Math.min(total,time)));sync();}

 function stopLayout(){layoutAnimation?.pause();layoutAnimation=null;}
 function finishOpening(){if(timeline&&openingPhase.p<1){stopLayout();timeline.pause().seek(total);settleHome();}sync();}
 function updateRows(){
  state.query=input.value;const q=state.query.trim().toLocaleLowerCase(),local=state.searchVisible&&state.mode==='local'&&!!q,indices=[];let count=0;
  papers.forEach((paper,i)=>{
   const rows=[...paper.querySelectorAll('[data-site]')],found=rows.filter(row=>row.dataset.search.includes(q));
   paper.dataset.expanded=String(state.active===i||local);
   rows.forEach((row,j)=>{row.hidden=local?!found.includes(row):state.active!==i&&j>=(state.searchVisible?3:5);});
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
 function searchFrames(width,rest,matching=[],margin=50,filtering=false){
  const columns=width>=920?3:width>=620?2:1,bar=Math.max(180,Math.min(500,width-2*margin-(width>=920?2*rest[0].w+48:0))),top=width<620?280:Math.round(Math.max(300,Math.min(440,innerHeight*.4)));
  const centers=rest.map(r=>({...r,r:0,opacity:filtering?0:.72}));let y=top+180;
  if(width>=920){
   const left=margin+8,right=width-margin-rest[0].w-8,upper=220,middle=Math.max(upper+Math.max(rest[0].h,rest[3].h)+24,top+20),bottom=middle+Math.max(rest[1].h,rest[2].h)+28;
   [[left,upper],[left,middle],[right,middle],[right,upper],[left,bottom],[(width-rest[5].w)/2,bottom+12],[right,bottom]].forEach(([x,y],i)=>Object.assign(centers[i],{x,y}));
  }else{const delta=top+180-rest[0].y;centers.forEach(b=>b.y+=delta);}
  for(let start=0;start<matching.length;start+=columns){const row=matching.slice(start,start+columns),rw=row.reduce((sum,i)=>sum+rest[i].w,0)+(row.length-1)*20;let x=(width-rw)/2;for(const i of row){const r=rest[i];centers[i]={x,y,w:r.w,h:r.h,r:0,opacity:1};x+=r.w+20;}y+=Math.max(...row.map(i=>rest[i].h))+28;}
  return {bar,top,centers,height:Math.max(innerHeight,y+195,...centers.map(b=>b.y+b.h+180))};
 }
 function cancelSearchDriver(){searchEpoch++;searchTimeline?.tracks.forEach(a=>a.pause());searchDriver=null;}
 function revertSearch(){const previous=searchTimeline;searchTimeline=null;previous?.revert();}
 const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
 // Adapted from the approved search-ink prototype. Cache the glyph mask, draw
 // only this small canvas during the handoff; native animations move the DOM.
 function prepareInk(scene){
  const size=stage.clientWidth<620?40:64,key=[size,scene.bar,scene.top,stage.clientWidth,devicePixelRatio].join(':');if(key===inkKey)return;inkKey=key;
  const wordWidth=size*4,wordHeight=Math.ceil(size*1.3),mask=document.createElement('canvas');mask.width=wordWidth;mask.height=wordHeight;
  const c=mask.getContext('2d');c.font=size+'px '+getComputedStyle(letters[0]).fontFamily;c.fillStyle='#171815';c.textBaseline='top';letters.forEach((l,i)=>c.fillText(l.textContent,i*size,0));
  const pixels=c.getImageData(0,0,wordWidth,wordHeight).data,runs=[];
  for(let y=0;y<wordHeight;y+=2){let start=-1;for(let x=0;x<=wordWidth;x++){const alpha=x<wordWidth?pixels[(y*wordWidth+x)*4+3]:0;if(alpha>60&&start<0)start=x;if((alpha<=60||x===wordWidth)&&start>=0){if(x-start>1)runs.push({x:start,end:x,y,seed:((start*17+y*31)%97)/97});start=-1;}}}
  const width=Math.max(scene.bar,wordWidth)+48,height=wordHeight+60,left=(stage.clientWidth-width)/2,top=scene.top+72-wordHeight/2,dpr=Math.min(devicePixelRatio||1,1.5);
  inkCanvas.width=Math.ceil(width*dpr);inkCanvas.height=Math.ceil(height*dpr);Object.assign(inkCanvas.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});inkContext.setTransform(dpr,0,0,dpr,0,0);
  ink={runs,width,height,wordWidth,wordHeight,wordLeft:(width-wordWidth)/2,wordTop:0,left:(width-scene.bar)/2,lineY:wordHeight/2+28,barWidth:scene.bar,color:'#171815'};
 }
 function paintInk(progress){
  if(!ink)return;const c=inkContext;c.clearRect(0,0,ink.width,ink.height);if(progress<.55||progress>=1)return;
  const flow=clamp((progress-.58)/.36),handoff=smooth((progress-.55)/.08);c.strokeStyle=ink.color;c.lineCap='butt';
  for(const run of ink.runs){const delay=(1-run.y/ink.wordHeight)*.09+run.seed*.045,t=smooth((flow-delay)/(1-delay)),bend=Math.sin(t*Math.PI),x0=ink.wordLeft+run.x,x1=ink.wordLeft+run.end,y0=run.y,tx0=ink.left+run.x/ink.wordWidth*ink.barWidth,tx1=ink.left+run.end/ink.wordWidth*ink.barWidth,shift=Math.sin(run.y*.1)*3*bend,y=y0+(ink.lineY-y0)*t;c.globalAlpha=handoff*(1-smooth((flow-.8)/.2));c.lineWidth=2.1-.8*t;c.beginPath();c.moveTo(x0+(tx0-x0)*t+shift,y);c.lineTo(x1+(tx1-x1)*t+shift,y+(run.seed-.5)*.5*bend);c.stroke();}
  c.globalAlpha=smooth((flow-.4)/.6)*.85;c.lineWidth=1.5;c.beginPath();const reach=ink.barWidth*smooth((flow-.4)/.6)/2;c.moveTo(ink.left+ink.barWidth/2-reach,ink.lineY);c.lineTo(ink.left+ink.barWidth/2+reach,ink.lineY);c.stroke();c.globalAlpha=1;
 }
 function buildSearch(progress=0){
  cancelSearchDriver();revertSearch();finishOpening();
  // The zero endpoint must be the real five-row home, even while local results
  // or three-row previews are visible. Otherwise finishing reverse playback jumps.
  const visible=state.searchVisible;state.searchVisible=false;updateRows();settleHome();state.searchVisible=visible;
  const home=frames,matching=updateRows(),rest=centerFrames(stage.clientWidth).end;
  const scene=searchFrames(stage.clientWidth,rest,matching,frames.margin,state.mode==='local'&&!!state.query.trim()),w=stage.clientWidth,tracks=[],ease='cubic-bezier(.22,.75,.22,1)';
  const track=(node,keyframes)=>{const a=node.animate(keyframes,{duration:searchDuration,fill:'both',easing:'linear'});a.pause();tracks.push(a);};
  Object.assign(search.style,{left:(w-scene.bar)/2+'px',top:scene.top+'px',width:scene.bar+'px'});
  track(stage,[{height:home.height+'px',offset:0},{height:home.height+'px',offset:.26,easing:ease},{height:scene.height+'px',offset:.88},{height:scene.height+'px',offset:1}]);
  const size=w<620?40:64,baseSize=w<620?32:36,centerY=scene.top+72;
  letters.forEach((letter,i)=>{
   const left=frames.titleX+i*36,top=frames.titleY,pose=(sx,sy,y)=>'translate('+((w-baseSize*4*sx)/2+i*baseSize*sx-left)+'px,'+(y-top)+'px) scale('+sx+','+sy+')',scale=size/baseSize,center=pose(scale,scale,centerY-size*.65);
   track(letter,[{transform:'none',opacity:1,offset:0,easing:ease},{transform:'scale(1.08)',opacity:1,offset:.16,easing:ease},{transform:pose(.65,1.5,Math.max(220,scene.top-180)),opacity:1,offset:.26},{transform:pose(.65,1.5,Math.max(223,scene.top-177)),opacity:1,offset:.28,easing:ease},{transform:pose(1.2,1.6,centerY-105),opacity:1,offset:.34,easing:ease},{transform:pose(scale*1.15,scale*.71,centerY-size*.65+8),opacity:1,offset:.43,easing:ease},{transform:pose(scale*.97,scale*1.04,centerY-size*.65-3),opacity:1,offset:.49,easing:ease},{transform:center,opacity:1,offset:.55},{transform:center,opacity:1,offset:.58},{transform:center,opacity:0,offset:.65},{transform:center,opacity:0,offset:1}]);
  });
  papers.forEach((paper,i)=>{
   const a=frames.end[i],b=scene.centers[i],dx=b.x-a.x,dy=b.y-a.y,pressed=i===1||i===2,sign=i===1?-1:1,from=pressed?.19:i===5?.34:.26,to=pressed?.28:from+.07;
   const target='translate('+dx+'px,'+dy+'px)';
   track(paper,[{transform:'none',height:a.h+'px',opacity:1,offset:0},{transform:'none',height:a.h+'px',opacity:1,offset:from,easing:ease},{transform:'translate('+(pressed?sign*28:0)+'px,4px) scale('+(pressed?'.975,1.025':'1.01,.99')+')',height:a.h+'px',opacity:1,offset:to,easing:ease},{transform:target,height:b.h+'px',opacity:b.opacity,offset:i===5?.88:.8},{transform:target,height:b.h+'px',opacity:b.opacity,offset:1}]);
  });
  track(search,[{opacity:0,transform:'scaleX(.15)',offset:0},{opacity:0,transform:'scaleX(.6)',offset:.81,easing:ease},{opacity:1,transform:'none',offset:1}]);track(rule,[{opacity:1,offset:0},{opacity:1,offset:.18},{opacity:0,offset:.33},{opacity:0,offset:1}]);
  prepareInk(scene);searchTimeline={tracks,get currentTime(){return tracks[0].currentTime||0;},seek(t){tracks.forEach(a=>a.currentTime=t);searchPhase.p=t/searchDuration;paintInk(searchPhase.p);syncSearch();},revert(){tracks.forEach(a=>a.cancel());paintInk(0);}};
  const ends=edgeFrames(w,scene.height,frames.margin),starts=edgeFrames(w,home.height,frames.margin);
  starts.forEach((a,i)=>{const b=ends[i],n=edgeNodes[Number(a.id)-1],target='translate('+(b.x-a.x+(b.w-a.w)/2)+'px,'+(b.y-a.y+(b.h-a.h)/2)+'px) rotate('+b.r+'deg) scale('+(b.w/a.w)+','+(b.h/a.h)+')';track(n,[{transform:'rotate('+a.r+'deg)',offset:0},{transform:'rotate('+a.r+'deg)',offset:.26,easing:ease},{transform:target,offset:.88},{transform:target,offset:1}]);});
  searchTimeline.seek(progress*searchDuration);
 }
 function syncSearch(){
  search.inert=!state.searchOpen;searchToggle.setAttribute('aria-expanded',String(state.searchOpen));
  sync();
  if(!state.searchOpen&&searchPhase.p===0&&searchTimeline)closeSearchImmediately();
 }
 function driveSearch(open){
  cancelSearchDriver();if(!searchTimeline)return;const start=searchTimeline.currentTime,end=open?searchDuration:0,epoch=searchEpoch,tl=searchTimeline;
  if(reduce()||Math.abs(start-end)<.01){tl.seek(end);syncSearch();return;}
  searchDriver={paused:false};tl.tracks.forEach(a=>{a.currentTime=start;a.playbackRate=open?1:-1;a.play();});
  tl.tracks[0].finished.then(()=>{if(epoch!==searchEpoch||tl!==searchTimeline)return;searchDriver=null;searchPhase.p=open?1:0;paintInk(searchPhase.p);syncSearch();}).catch(()=>{});
  const sample=()=>{if(epoch!==searchEpoch||!searchDriver)return;searchPhase.p=clamp(tl.currentTime/searchDuration);paintInk(searchPhase.p);requestAnimationFrame(sample);};requestAnimationFrame(sample);
 }
 function setSearch(open){
  if(!open&&!state.searchOpen&&!searchTimeline)return;
  finishOpening();state.searchOpen=open;if(open)state.searchVisible=true;search.hidden=false;
  if(!searchTimeline)buildSearch(0);
  driveSearch(open);if(open)input.focus({preventScroll:true});else searchToggle.focus({preventScroll:true});syncSearch();
 }
 function closeSearchImmediately(){cancelSearchDriver();state.searchOpen=false;state.searchVisible=false;revertSearch();searchPhase.p=0;search.hidden=true;search.inert=true;updateRows();settleHome();}
 function refresh(){
  const open=state.searchOpen,hasSearch=!!searchTimeline,progress=hasSearch?clamp(searchTimeline.currentTime/searchDuration):0,running=!!searchDriver;
  if(hasSearch){search.hidden=false;buildSearch(progress);if(running)driveSearch(open);}else{updateRows();settleHome();search.hidden=true;search.inert=true;searchPhase.p=0;}
 }
 function expandPaper(index){
  finishOpening();if(state.searchOpen)closeSearchImmediately();
  const box=stage.getBoundingClientRect(),old=papers.map(p=>{const r=p.getBoundingClientRect();return {left:r.left-box.left,top:r.top-box.top};});
  state.active=state.active===index?-1:index;updateRows();build(total);
  if(!reduce())layoutAnimation=motion.animate(papers,{x:(_,i)=>[old[i].left-frames.end[i].x,0],y:(_,i)=>[old[i].top-frames.end[i].y,0],duration:350,ease:'inOut(3)',composition:'none',onComplete:()=>papers.forEach(p=>p.style.transform='none')});
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
 input.addEventListener('input',()=>{state.query=input.value;if(state.mode==='local'){if(searchQueued)return;searchQueued=true;requestAnimationFrame(()=>{searchQueued=false;if(state.mode==='local'&&state.searchOpen)refresh();});}else updateRows();});
 search.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;refresh();input.focus({preventScroll:true});}));
 search.querySelector('select').addEventListener('change',e=>{state.engine=e.target.value;hooks.engine(state.engine);});
 search.querySelector('form').addEventListener('submit',e=>{e.preventDefault();if(state.mode==='local')return;try{const url=destination(input.value,state.engine);if(url)window.open(url,'_blank','noopener,noreferrer');}catch(error){hooks.error(error);}});
 root.querySelector('.op-folio-close').addEventListener('click',()=>folio.close());root.querySelector('.op-folio-prev').addEventListener('click',()=>{state.folio=(state.folio+20)%21;renderFolio();});root.querySelector('.op-folio-next').addEventListener('click',()=>{state.folio=(state.folio+1)%21;renderFolio();});folio.addEventListener('close',()=>folioReturn?.focus({preventScroll:true}));
 papers.forEach((paper,i)=>{paper.querySelector('.op-paper-head').addEventListener('click',()=>expandPaper(i));paper.querySelector('.op-more').addEventListener('click',()=>expandPaper(i));});
 root.addEventListener('pointerdown',()=>{openingTakenOver=true;finishOpening();},{capture:true});
 let blankPress=null;
 const blank=e=>!e.target.closest('button,a,input,select,textarea,dialog,.op-search,.op-paper');
 stage.addEventListener('pointerdown',e=>{blankPress=e.button===0&&blank(e)?e.pointerId:null;});
 stage.addEventListener('pointercancel',()=>{blankPress=null;});
 stage.addEventListener('pointerup',e=>{const dismiss=blankPress===e.pointerId&&blank(e);blankPress=null;if(dismiss&&state.searchOpen&&!document.querySelector('dialog[open]'))setSearch(false);});
 document.addEventListener('keydown',event=>{
  openingTakenOver=true;
  if(openingPhase.p<1)finishOpening();
  if(document.querySelector('dialog[open]'))return;
  if(event.key==='Escape'){if(state.searchOpen){event.preventDefault();setSearch(false);}else if(state.active>=0)expandPaper(state.active);}
  if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)){event.preventDefault();setSearch(true);}
 });
 updateRows();build(total);
 function queueResize(){if(resizeQueued||(Math.abs(stage.clientWidth-lastWidth)<1&&innerHeight===lastHeight))return;resizeQueued=true;requestAnimationFrame(()=>{
  resizeQueued=false;const p=searchTimeline?clamp(searchTimeline.currentTime/searchDuration):0,open=state.searchOpen,hasSearch=!!searchTimeline,running=!!searchDriver,time=timeline?.currentTime??total,openingRunning=timeline&&!timeline.paused;
  cancelSearchDriver();revertSearch();stopLayout();updateRows();build(hasSearch?total:time);
  if(hasSearch&&(open||p>0)){search.hidden=false;buildSearch(p);if(running&&!reduce())driveSearch(open);}else if(hasSearch){closeSearchImmediately();}else{search.hidden=true;search.inert=true;state.searchVisible=false;searchPhase.p=0;}
  if(openingRunning&&!reduce()&&!hasSearch)timeline.play();
 });}
 new ResizeObserver(queueResize).observe(stage);addEventListener('resize',queueResize);
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{finishOpening();if(searchTimeline){cancelSearchDriver();searchTimeline.seek(state.searchOpen?searchDuration:0);syncSearch();}});
 return {refresh,finishOpening,playOpening,prepareOpening(){openingTakenOver=false;},openFolio,setSearch,home(){openingTakenOver=true;closeSearchImmediately();state.active=-1;refresh();},settings(settings){state.engine=settings.engine;search.querySelector('select').value=settings.engine;root.style.setProperty('--edge-presence',String(settings.artPresence/100));}};
 }
})();
