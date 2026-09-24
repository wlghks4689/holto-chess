import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Production is opt-in: this creates real test rooms and submits normal game actions.
const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5173';
const count = Number(process.env.AUDIT_PLAYERS || 8);
if (!Number.isInteger(count) || count < 2 || count > 8) throw new Error('AUDIT_PLAYERS must be between 2 and 8');
const scenario = process.env.AUDIT_SCENARIO || 'baseline';
const secure = process.env.AUDIT_EXPECT_SECURE === '1';
const output = path.resolve(process.env.AUDIT_OUTPUT || '.audit/multiplayer');
fs.mkdirSync(output, { recursive: true });
const journal = fs.createWriteStream(path.join(output, 'events.jsonl'));
const start = Date.now();
const log = (type, data = {}) => journal.write(JSON.stringify({ t: Date.now(), ms: Date.now() - start, type, ...data }) + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const sizes = [{width:1366,height:900},{width:393,height:852},{width:360,height:660},{width:768,height:1024}];
const seats = [];
let roomId;
let stop = false;

async function measure(page) {
  return page.evaluate(() => {
    const text = selector => document.querySelector(selector)?.innerText || '';
    const rect = el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}; };
    const cinema = document.querySelector('.cinema');
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const tracked = [...document.querySelectorAll('.cinema-seat,.cinema-board,.cinema-profile,.cinema-standing-line,.cinema-footer,.showdown-prep-player,.shop-layout,.action-bar,.final-standing,.room-error,.phase-ready-bar')].filter(visible);
    return {
      localTime:Date.now(), viewport:{w:innerWidth,h:innerHeight}, scroll:{x:scrollX,y:scrollY},
      width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight,
      phase:cinema?.getAttribute('data-phase'), matchId:cinema?.getAttribute('data-match-id'),
      heading:text('.cinema-heading') || text('.round-header') || text('h1'),
      footer:text('.cinema-footer'), prep:!!document.querySelector('.showdown-prep'),
      seats:[...document.querySelectorAll('.cinema-seat')].map(el=>({id:el.getAttribute('data-player-id'),profile:el.querySelector('.cinema-profile')?.innerText,record:el.querySelector('.swiss-record')?.innerText,stamp:el.querySelector('.cinema-status-stamp')?.innerText,rect:rect(el)})),
      openCards:[...document.querySelectorAll('.cinema-flip-slot[data-open="true"]')].map(el=>el.getAttribute('data-card-id')),
      outcomes:[...document.querySelectorAll('.cinema-victory')].map(el=>el.innerText),
      buttons:[...document.querySelectorAll('button')].filter(visible).map(el=>({text:el.innerText,disabled:el.disabled})),
      bounds:tracked.map(el=>({selector:el.className,rect:rect(el),scrollW:el.scrollWidth,clientW:el.clientWidth})),
      text:document.body.innerText.slice(0,16000)
    };
  });
}
async function clickIf(page, locator) {
  if (await locator.count() && await locator.first().isVisible() && await locator.first().isEnabled()) {
    await locator.first().click({timeout:1500}); return true;
  }
  return false;
}
async function enter(seat, create) {
  const page=seat.page;
  await page.goto(origin,{waitUntil:'networkidle'});
  log('initial',{seat:seat.id,buttons:await page.getByRole('button').allTextContents()});
  await page.getByRole('button',{name:'시작하기',exact:true}).click();
  log('modes',{seat:seat.id,buttons:await page.getByRole('button').allTextContents()});
  await page.getByRole('button',{name:/멀티\s*플레이/}).click();
  await page.getByRole('button',{name:create?/새 방 만들기/:/방 찾기/}).click();
  await page.getByRole('textbox',{name:'닉네임',exact:true}).fill(seat.name);
  if (!create) await page.getByRole('textbox',{name:'방 코드',exact:true}).fill(roomId);
  await page.getByRole('button',{name:create?'방 만들기':'참가하기',exact:true}).click();
  await page.getByTestId('room-id').waitFor({timeout:20000});
  if(create) roomId=await page.getByTestId('room-id').innerText();
  console.log(`joined ${seat.id} ${roomId}`);
}

async function drive(seat) {
  const {page,view}=seat;
  if(!view || seat.driving || seat.paused || Date.now()-seat.lastAction<550) return;
  seat.driving=true;
  try {
    if(await page.locator('.cinema').count()) return;
    const p=page;
    if(view.phase==='LOBBY') return;
    if(!view.me.alive) {
      if (scenario !== 'auto-spectator' && !seat.spectatorClicked && await clickIf(p,p.getByRole('button',{name:'다른 플레이어 관전',exact:true}))) {seat.spectatorClicked=true; log('spectate',{seat:seat.id,round:view.round});}
      return;
    }
    if(view.phase==='SHOP') {
      if(view.me.committed) return;
      if(view.me.ownedCards.length<view.me.handLimit) {
        const slots=p.locator('.shop-card-slot');
        for(let i=0;i<view.me.shopCards.length;i++) if(view.me.shopCards[i].price<=view.me.stackBB) {
          if(await clickIf(p,slots.nth(i).getByRole('button',{name:/구매/}))) break;
        }
      } else await clickIf(p,p.locator('.shop-ready-bar > button'));
    } else if(view.phase==='OPEN_DRAFT' && view.draft?.currentPlayerId===view.me.playerId) {
      if(view.round===2) await clickIf(p,p.locator('.r2-price:enabled'));
      else await clickIf(p,p.locator('.draft-offer .playing-card:enabled'));
    } else if(view.phase==='RUN_LOADOUT') await clickIf(p,p.getByRole('button',{name:'배치 확정 · 준비 완료',exact:true}));
    else if(['ROUND_RESULT','NEXT_ROUND','GROUP_ASSIGNMENT','SURVIVAL_READY'].includes(view.phase)) {
      // Keep results visible briefly so layouts and timers can be sampled.
      if(Date.now()-(seat.lastNonCinemaAt||Date.now())>2400) await clickIf(p,p.locator('.phase-ready-bar button.primary'));
    }
    seat.lastAction=Date.now();
  }catch(error){log('driver-error',{seat:seat.id,message:error.message.split('\n')[0]});}
  finally{seat.driving=false;}
}

try {
  for(let i=0;i<count;i++) {
    const context=await browser.newContext({viewport:sizes[i%4],deviceScaleFactor:1});
    const page=await context.newPage();
    const seat={id:`p${i+1}`,name:i%2?`점검${i+1}긴닉네임`:`점검${i+1}`,context,page,lastAction:0,lastKey:'',lastNonCinemaAt:0,captured:new Set()};
    seats.push(seat);
    await page.exposeFunction('auditTransition', state => log('dom-transition',{seat:seat.id,...state}));
    await page.addInitScript(() => {
      let previous='';
      const sample=()=>{
        const cinema=document.querySelector('.cinema');
        const phase=cinema?.getAttribute('data-phase')||'';
        const matchId=cinema?.getAttribute('data-match-id')||'';
        const open=document.querySelectorAll('.cinema-flip-slot[data-open="true"]').length;
        const footer=document.querySelector('.cinema-footer')?.innerText||'';
        const key=[phase,matchId,open,footer].join('|');
        if(key!==previous){previous=key;void window.auditTransition({browserTime:Date.now(),phase,matchId,open,footer,scrollY});}
      };
      new MutationObserver(sample).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-phase','data-match-id','data-open']});
    });
    const recordMessage = payload => {
      try {
        const message=JSON.parse(payload.toString());
        if(message.type==='PLAYER_VIEW') {
          seat.view=message.payload;
          if(secure && seat.view.presentation && seat.view.serverNow<seat.view.presentation.endsAt &&
            (seat.view.standings.length || seat.view.roundHistory?.length || seat.view.roundSummary?.length || seat.view.finalResultsReleased)) {
            log('security-failure',{seat:seat.id,reason:'premature aggregate result'});process.exitCode=1;
          }
          log('view',{seat:seat.id,view:message.payload});
          const key=`${message.payload.round}:${message.payload.phase}`;
          if(key!==seat.viewKey){console.log(`${seat.id} ${key} r${message.payload.revision}`);seat.viewKey=key;}
        } else if(message.type==='ERROR') log('server-error',{seat:seat.id,...message});
      }catch{}
    };
    if(scenario==='resilience' && i===1) {
      await page.routeWebSocket('**/ws/rooms/**', ws=>{
        if(Date.now()<(seat.outageUntil||0)){void ws.close({code:1013,reason:'QA transient outage'});return;}
        const server=ws.connectToServer();
        seat.wsRoute=ws;seat.serverRoute=server;
        server.onMessage(message=>setTimeout(()=>{try{ws.send(message);recordMessage(message);}catch{}},650));
        ws.onMessage(message=>server.send(message));
      });
      log('latency-config',{seat:seat.id,inboundMs:650});
    }
    page.on('pageerror',error=>log('pageerror',{seat:seat.id,message:error.message}));
    page.on('console',msg=>{if(msg.type()==='error') log('console-error',{seat:seat.id,message:msg.text()});});
    page.on('websocket',ws=>{
      ws.on('framereceived',event=>{
        if(!(scenario==='resilience'&&i===1))recordMessage(event.payload);
      });
      ws.on('close',()=>log('ws-close',{seat:seat.id}));
    });
    await enter(seat,i===0);
  }
  fs.writeFileSync(path.join(output,'run.json'),JSON.stringify({origin,roomId,start,count,sizes},null,2));
  await Promise.all(seats.map(s=>s.page.getByRole('button',{name:'READY · 준비 완료',exact:true}).click()));
  const maxMs=Number(process.env.AUDIT_MAX_MS || 20*60*1000);
  while(!stop && Date.now()-start<maxMs) {
    await Promise.all(seats.map(async seat=>{
      if(seat.paused)return;
      try{
        const state=await measure(seat.page);
        const key=[seat.view?.round,seat.view?.phase,state.phase,state.matchId,state.footer,state.openCards.length].join('|');
        if(!state.phase && !seat.lastNonCinemaAt)seat.lastNonCinemaAt=Date.now();
        if(state.phase)seat.lastNonCinemaAt=0;
        if(key!==seat.lastKey){log('screen',{seat:seat.id,revision:seat.view?.revision,serverPhase:seat.view?.phase,round:seat.view?.round,state});seat.lastKey=key;}
        // Compact high-frequency trace gives transition spread without storing full DOM repeatedly.
        log('sample',{seat:seat.id,round:seat.view?.round,serverPhase:seat.view?.phase,phase:state.phase,matchId:state.matchId,open:state.openCards.length,time:Date.now(),width:state.width,viewport:state.viewport.w});
        const captureKey=`${seat.view?.round}-${seat.view?.phase}-${state.matchId||''}-${state.phase||'page'}`;
        if(['p1','p2','p3','p4'].includes(seat.id) && (!state.phase || ['TABLE_ENTER','RESULT','COMPLETE','FINAL_WINNER'].includes(state.phase)) && !seat.captured.has(captureKey)) {
          seat.captured.add(captureKey);
          await seat.page.screenshot({path:path.join(output,`${seat.id}-${captureKey.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`),fullPage:true});
          if(['p2','p3'].includes(seat.id))await seat.page.screenshot({path:path.join(output,`${seat.id}-${captureKey.replace(/[^a-zA-Z0-9_-]/g,'_')}-viewport.png`)});
        }
        if(scenario==='resilience' && seat.id==='p3' && seat.view?.round===3 && state.phase==='FLOP_HAND' && !seat.freezeTest) {
          seat.freezeTest=true;seat.paused=true;log('freeze-start',{seat:seat.id});
          const cdp=await seat.context.newCDPSession(seat.page);
          await cdp.send('Debugger.enable');await cdp.send('Debugger.pause');
          setTimeout(async()=>{await cdp.send('Debugger.resume');await cdp.detach();seat.paused=false;log('freeze-resume',{seat:seat.id});},8000);
        }
        if(scenario==='suspension' && seat.id==='p1' && seat.view?.round===1 && state.phase==='FLOP_HAND' && !seat.pauseTest) {
          seat.pauseTest=true;seat.paused=true;
          const cdp=await seat.context.newCDPSession(seat.page);
          await cdp.send('Debugger.enable');await cdp.send('Debugger.pause');
          log('js-pause-start',{seat:seat.id,state});
          setTimeout(async()=>{
            try { await cdp.send('Debugger.resume');log('js-pause-resume',{seat:seat.id});await cdp.detach(); }
            finally {seat.paused=false;}
          },8000);
        }
        if(scenario==='resilience' && seat.id==='p2' && seat.view?.round===2 && state.phase==='FLOP_HAND' && !seat.disconnectTest) {
          seat.disconnectTest=true;seat.outageUntil=Date.now()+7000;log('outage-start',{seat:seat.id});
          await seat.wsRoute.close({code:1013,reason:'QA transient outage'});await seat.serverRoute.close();
          setTimeout(async()=>{log('outage-screen',{seat:seat.id,state:await measure(seat.page)});await seat.page.screenshot({path:path.join(output,'disconnected-during-cinematic.png')});},1200);
        }
        if(scenario==='resilience' && seat.id==='p4' && seat.view?.round===3 && state.phase==='TURN_HAND' && !seat.reloadTest) {
          seat.reloadTest=true;seat.paused=true;log('reload-start',{seat:seat.id});
          await seat.page.reload({waitUntil:'networkidle'});
          await seat.page.getByRole('button',{name:'시작하기',exact:true}).click();
          await seat.page.getByRole('button',{name:/멀티\s*플레이/}).click();
          const resume=seat.page.getByRole('button',{name:/다시 참가/});
          await resume.first().click();seat.paused=false;log('reload-resume',{seat:seat.id});
        }
        if(scenario==='resilience' && seat.id==='p1' && seat.view?.phase==='GAME_RESULT' && state.phase && !seat.historyTest) {
          seat.historyTest=true;
          const history=await seat.context.newPage();await history.goto(origin,{waitUntil:'networkidle'});
          await history.getByRole('button',{name:'시작하기',exact:true}).click();
          await history.getByRole('button',{name:/멀티\s*플레이/}).click();
          await history.getByRole('button',{name:/대전 기록/}).click();
          const historyText=await history.locator('body').innerText();
          log('early-history',{seat:seat.id,serverEndsAt:seat.view.presentation?.endsAt,sourceState:state.phase,text:historyText});
          if(secure && historyText.includes(roomId)){log('security-failure',{seat:seat.id,reason:'premature archive'});process.exitCode=1;}
          await history.screenshot({path:path.join(output,'early-final-history.png'),fullPage:true});await history.close();
        }
        await drive(seat);
      }catch(error){log('sample-error',{seat:seat.id,message:error.message.split('\n')[0]});}
    }));
    if(seats.every(s=>s.view?.phase==='GAME_RESULT')) {
      const end=Math.max(...seats.map(s=>s.view.presentation?.endsAt||0));
      if(Date.now()>end+6000)stop=true;
    }
    await sleep(120);
  }
  console.log(`finished ${roomId}, seconds ${(Date.now()-start)/1000}, stop=${stop}`);
  log('run-finished',{roomId,completed:stop,seconds:(Date.now()-start)/1000});
  if(!stop)process.exitCode=1;
  for(const seat of seats) {
    log('final-screen',{seat:seat.id,state:await measure(seat.page)});
    if(secure) {
      const records=await seat.page.evaluate(()=>JSON.parse(localStorage.getItem('porena-final-results-v1')||'[]'));
      log('archive-after-final',{seat:seat.id,published:!!seat.view?.finalResultsReleased,saved:records.some(record=>record.roomId===roomId)});
      if(!seat.view?.finalResultsReleased||!records.some(record=>record.roomId===roomId)){log('security-failure',{seat:seat.id,reason:'final archive not released after standings'});process.exitCode=1;}
    }
  }
}catch(error){console.error(error);log('fatal',{message:error.stack});process.exitCode=1;}
finally {await browser.close(); journal.end();}
