// Local-day aggregation for the statistics sheet; no network or browser history.
(function(root){
 'use strict';
 function summarize(rows,range='30',today){
  const n=new Date();today=today||[n.getFullYear(),String(n.getMonth()+1).padStart(2,'0'),String(n.getDate()).padStart(2,'0')].join('-');
  const ordinal=s=>Date.parse(s+'T00:00:00Z')/86400000;
  const date=n=>new Date(n*86400000).toISOString().slice(0,10),now=ordinal(today),sum=items=>items.reduce((s,r)=>s+r.count,0);
  let first=now,last=now;for(const row of rows){const d=ordinal(row.day);first=Math.min(first,d);last=Math.max(last,d);}
  const all=range==='all',end=all?last:now,start=all?first:now-(range==='7'?6:29),startDay=date(start),endDay=date(end);
  const selected=rows.filter(r=>r.day>=startDay&&r.day<=endDay),byURL=new Map();
  for(const row of selected){let item=byURL.get(row.url);if(!item){item={url:row.url,name:row.name,lastAt:row.lastAt,count:0};byURL.set(row.url,item);}item.count+=row.count;if(row.lastAt>item.lastAt){item.lastAt=row.lastAt;item.name=row.name;}}
  const span=end-start+1,step=Math.max(1,Math.ceil(span/45)),bins=Array.from({length:Math.ceil(span/step)},(_,i)=>({start:date(start+i*step),end:date(Math.min(end,start+(i+1)*step-1)),count:0}));
  for(const row of selected)bins[Math.floor((ordinal(row.day)-start)/step)].count+=row.count;
  const items=[...byURL.values()],recent=items.slice().sort((a,b)=>b.lastAt.localeCompare(a.lastAt)),ranking=items.slice().sort((a,b)=>b.count-a.count||a.url.localeCompare(b.url));
  return {range,start:startDay,end:endDay,bins,ranking,recent,total:sum(selected),unique:items.length,
   metrics:{total:sum(rows),days7:sum(rows.filter(r=>r.day>=date(now-6)&&r.day<=today)),days30:sum(rows.filter(r=>r.day>=date(now-29)&&r.day<=today)),unique:new Set(rows.map(r=>r.url)).size}};
 }
 const api={summarize};if(typeof module==='object'&&module.exports)module.exports=api;root.SkyStats=api;
})(globalThis);
