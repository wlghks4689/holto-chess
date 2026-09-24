import fs from 'node:fs';
import path from 'node:path';
const dir=process.argv[2]||'.audit/multiplayer';
const events=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
const screens=events.filter(e=>e.type==='screen');
const views=events.filter(e=>e.type==='view');
const transitionType=events.some(e=>e.type==='dom-transition')?'dom-transition':'screen';
const groups=new Map();
for(const e of events.filter(e=>e.type===transitionType)){
  const s=e.state||e;if(!s.phase||!s.matchId)continue;
  const key=[s.matchId,s.phase,s.openCards?.length??s.open].join('|');
  if(!groups.has(key))groups.set(key,new Map());
  if(!groups.get(key).has(e.seat))groups.get(key).set(e.seat,s.browserTime||e.t);
}
const spreads=[...groups].filter(([,g])=>g.size>1).map(([key,g])=>({key,spreadMs:Math.max(...g.values())-Math.min(...g.values()),seats:[...g.keys()]})).sort((a,b)=>b.spreadMs-a.spreadMs);
const schedules=new Map();
for(const e of views){const p=e.view.presentation;if(!p)continue;const key=`${e.view.round}:${p.startsAt}`;if(!schedules.has(key))schedules.set(key,new Map());schedules.get(key).set(e.seat,p);}
const scheduleDiff=[];
for(const [key,seats]of schedules){const matches=new Map();for(const [seat,p]of seats)for(const entry of p.matches){if(!matches.has(entry.matchId))matches.set(entry.matchId,[]);matches.get(entry.matchId).push({seat,offset:entry.offsetMs,duration:entry.durationMs});}for(const [match,entries]of matches)if(new Set(entries.map(e=>e.offset)).size>1)scheduleDiff.push({key,match,entries});}
const lastBySeat={};for(const e of views)lastBySeat[e.seat]={round:e.view.round,phase:e.view.phase,alive:e.view.me.alive};
const normalSpreads=[...groups].map(([key,g])=>({key,values:[...g].filter(([seat])=>seat!=='p2').map(([,t])=>t)}))
  .filter(g=>g.values.length>1).map(g=>Math.max(...g.values)-Math.min(...g.values)).sort((a,b)=>a-b);
const transitionStats={count:normalSpreads.length,medianMs:normalSpreads[Math.floor(normalSpreads.length/2)],p95Ms:normalSpreads[Math.floor(normalSpreads.length*.95)],maxMs:normalSpreads.at(-1)};
const recovery=events.filter(e=>['freeze-start','freeze-resume','reload-start','reload-resume','outage-start','js-pause-start','js-pause-resume'].includes(e.type)).map(e=>({
  ...e,before:events.filter(x=>x.type==='dom-transition'&&x.seat===e.seat&&x.t<e.t).at(-1),
  after:events.find(x=>x.type==='dom-transition'&&x.seat===e.seat&&x.t>e.t)}));
const report={lastBySeat,eventCount:events.length,errors:events.filter(e=>['fatal','pageerror','server-error','driver-error','sample-error'].includes(e.type)),
  transitionStatsExcludingP2:transitionStats,recovery,
  transitionMeasurement:transitionType,largestTransitionSpreads:spreads.slice(0,15),scheduleDiff,
  horizontalOverflow:screens.filter(e=>e.state.width>e.state.viewport.w+1).map(e=>({seat:e.seat,round:e.round,phase:e.state.phase,width:e.state.width,viewport:e.state.viewport.w})),
  mobileBoardBounds:screens.filter(e=>e.state.viewport.w<=393&&e.state.phase==='RESULT').map(e=>({seat:e.seat,round:e.round,match:e.state.matchId,scroll:e.state.scroll,viewport:e.state.viewport,boards:e.state.bounds.filter(b=>b.selector.includes('cinema-board')).map(b=>b.rect)})),
  shops:screens.filter(e=>e.serverPhase==='SHOP'&&!e.state.phase).map(e=>({seat:e.seat,round:e.round,width:e.state.viewport.w,timerVisible:e.state.text.includes('남은 시간'),readyStatusVisible:e.state.text.includes('전원이 준비'),scroll:e.state.scroll})),
  resilience:events.filter(e=>['freeze-start','freeze-resume','reload-start','reload-resume','outage-start','outage-screen','js-pause-start','js-pause-resume','early-history'].includes(e.type))};
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,mobileBoardBounds:report.mobileBoardBounds.slice(-8),shops:report.shops.slice(0,8)},null,2));
