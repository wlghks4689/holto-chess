import { useState } from "react";
import { BALANCE, cardPrice } from "../game/config";
import { ABILITY_IDS, type AbilityId } from "../game/abilities";
import type { Round } from "../game/types";
import { ShopPanel } from "./App";
import { ShowdownCinematic } from "./ShowdownCinematic";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { ShowdownHand } from "./ShowdownHand";
import { RoundResults } from "./RoundResults";
import { FinalStandingRow, FinalStandingsHeader } from "./FinalStandingRow";
import { OnlineScoreboard } from "./OnlineScoreboard";
import { AbilitySelectionPanel } from "./AbilitySelectionPanel";
import { OpenDraftPanel, RunLoadoutPanel } from "./OpenDraft";
import { qaDeck, qaGame, qaMatch, qaRows, qaView, QA_NAMES } from "./responsiveFixtures";
import "./responsivePreview.css";
import { auditResponsiveLayout } from "./responsiveAudit";
import { OnlineLoadout } from "./OnlineLoadout";
import { PrepRoundHeader, RoundProgress } from "./PrepPhase";
import { getPrepPresentation } from "./prepPresentation";
import { cinematicTimeline } from "./cinematicTimeline";

type Case = { id: string; screen: string; round: Round; count: number };
const cases: Case[] = [];
for (const round of [1,2,3,4,5] as const) {
  for (const count of [...new Set([0, Math.ceil(BALANCE.handLimits[round] / 2), BALANCE.handLimits[round]])]) {
    for (const screen of ["shop", "match", "showdown"]) cases.push({ id:`${screen}-r${round}-${count}`, screen, round, count });
  }
  cases.push({ id:`results-r${round}`, screen:"results", round, count:BALANCE.handLimits[round] });
}
for (const count of [0,1,4,7,8]) cases.push({ id:`ability-${count}`, screen:"ability", round:1, count });
cases.push({ id:"ability-8-full-preview", screen:"ability-full-preview", round:1, count:8 });
cases.push({ id:"ability-8-logo-only-preview", screen:"ability-logo-only-preview", round:1, count:8 });
cases.push({ id:"ability-8-two-column-preview", screen:"ability-two-column-preview", round:1, count:8 });
cases.push({ id:"ability-quad-core", screen:"ability-quad-core", round:1, count:8 });
cases.push({ id:"ability-front-runner", screen:"ability-front-runner", round:1, count:8 });
cases.push({ id:"ability-order", screen:"ability-order", round:1, count:0 }, { id:"final", screen:"final", round:5, count:7 }, { id:"brackets", screen:"brackets", round:4, count:5 }, { id:"loadout", screen:"loadout", round:2, count:3 }, { id:"showdown-r4-headsup", screen:"showdown-headsup", round:4, count:5 });
for (const round of [2,4] as const) cases.push({ id:`draft-r${round}`, screen:"draft", round, count:BALANCE.handLimits[round] });
for (const round of [2,4] as const) cases.push({ id:`draft-r${round}-picking`, screen:"draft", round, count:BALANCE.handLimits[round]-1 });
for (const round of [3,4] as const) cases.push({ id:`prep-r${round}`, screen:"prep", round, count:BALANCE.handLimits[round] });
cases.push({ id:"loadout-two-games", screen:"loadout-two-games", round:3, count:4 });
cases.push({ id:"match-r4-headsup", screen:"match-headsup", round:4, count:5 });
cases.push({ id:"showdown-r2-run1-result", screen:"showdown-run1-result", round:2, count:3 }, { id:"showdown-r2-run2-river", screen:"showdown-run2-river", round:2, count:3 });
cases.push({ id:"showdown-r3-tiebreak", screen:"showdown-tiebreak", round:3, count:4 });

function Scene({ scene, interactive }: { scene: Case; interactive: boolean }) {
  const { screen, round, count } = scene;
  const view = qaView(round, count);
  const match = qaMatch(round, count, screen.endsWith("headsup") ? false : screen === "showdown-tiebreak" || round >= 4);
  if (screen === "showdown-tiebreak") {
    match.stage = "secondary"; match.group = "loser"; match.tiebreakKind = "SURVIVAL_TIEBREAK";
    match.winnerIds = ["p2"]; match.boardWinnerIds = [["p2"]];
    match.results = match.results.map((result,i)=>({...result,place:i === 0 ? 3 : i}));
    match.boardResults = [match.results];
    match.rewards = match.rewards?.map((reward,i)=>({...reward,deltaBB:0,afterBB:reward.beforeBB,deltaPoints:0,afterPoints:reward.beforePoints,outcome:i === 0 ? "ELIMINATED" : "SURVIVED"}));
  }
  const profiles = view.players;
  const rows = qaRows(round);
  if (screen === "loadout-two-games") { view.me.loadoutSlots = view.me.ownedCards.map(c=>c.id); return <OnlineLoadout me={view.me} disabled={false} onChange={()=>{}} />; }
  if (screen === "shop" || screen === "prep") return <ShopPanel state={qaGame(round,count)} act={() => {}} />;
  if (screen.startsWith("showdown")) {
    const frames = cinematicTimeline(match);
    const elapsed = screen === "showdown-run1-result" ? frames.find(f=>f.phase === "RUN_RESULT")!.at : screen === "showdown-run2-river" ? frames.find(f=>f.phase === "RIVER_SETTLE" && f.boardIndex === 1)!.at : Number.MAX_SAFE_INTEGER;
    return <ShowdownCinematic match={match} profiles={profiles} viewerId="p1" onComplete={() => {}} elapsedMs={elapsed} nextMatchSeconds={screen === "showdown" || screen === "showdown-tiebreak" ? 3 : undefined} catchUp />;
  }
  if (screen.startsWith("match")) {
    const seats = match.participantIds.map((playerId, i) => ({ playerId, name:QA_NAMES[i]!, points:12345, abilityId:ABILITY_IDS[i], cards:match.revealedCards[playerId]!, ...(round === 2 ? { runCards:[match.revealedCards[playerId]!.slice(0,2),match.revealedCards[playerId]!.slice(-2)] as [typeof qaDeck,typeof qaDeck] } : {}) }));
    return <ShowdownPrepPanel round={round} playerName={QA_NAMES[0]!} seconds={3} matchup={{ matchNumber:1, viewer:seats[0]!, opponents:seats.slice(1) }} />;
  }
  if (screen === "results" || screen === "brackets") return <><OnlineScoreboard view={view} /><RoundResults round={round} rows={rows} viewerId="p1" showBrackets={screen === "brackets"} secondsLeft={30}><ShowdownHand cards={qaDeck.slice(0,count)} usedCardIds={qaDeck.slice(0,5).map(c=>c.id)} winner displayName="원 페어" category="PAIR" kickers={[14,12,9,6]} /></RoundResults></>;
  if (screen === "final") return <section className="final-panel"><div className="standings"><FinalStandingsHeader />{rows.map(row => <FinalStandingRow key={row.playerId} name={row.name} row={{ playerId:row.playerId, points:row.totalPoints, handScore:50, stackScore:12345, stackBB:row.stackBB, total:111160, displayName:"로열 스트레이트 플러시", finalPlace:row.rank, placement:row.rank, rankPoints:8, cards:row.cards, usedCardIds:row.cards.slice(0,5).map(c=>c.id), ...(row.rank > 4 ? { eliminatedRound:row.eliminated ? 3 : 4 } : {}) }} />)}</div></section>;
  if (screen.startsWith("ability")) {
    view.phase = screen === "ability-order" ? "ABILITY_ORDER" : count === 8 ? "ABILITY_REVEAL" : "ABILITY_PICK";
    const featured = screen === "ability-front-runner" ? "front-runner" : screen === "ability-quad-core" ? "quad-core" : undefined;
    const abilities: readonly AbilityId[] = featured ? [featured, ...ABILITY_IDS.filter(id=>id !== featured)] : ABILITY_IDS;
    view.abilityDraft = { slotCount:ABILITY_IDS.length, order:profiles.map(p=>p.playerId), pickedCount:count, availableSlots:Array.from({length:ABILITY_IDS.length-count},(_,i)=>i+count), currentPlayerId:profiles[count]?.playerId, abilities:profiles.slice(0,count).map((p,i)=>({playerId:p.playerId, slot:i, abilityId:abilities[i]!})), ...(interactive && count > 0 ? { myPick:{ slot:0, abilityId:abilities[0]! } } : {}) };
    return <AbilitySelectionPanel view={view} send={()=>{}} seconds={30} />;
  }
  if (screen === "loadout") return <RunLoadoutPanel view={view} send={()=>{}} disabled={false} seconds={30} />;
  view.phase = "OPEN_DRAFT";
  view.draft = { currentPlayerId:"p1", order:profiles.map(p=>({ playerId:p.playerId, points:p.points, stackBB:p.stackBB })), cards:qaDeck.slice(20,round === 4 ? 36 : 28).map((card,i)=>({card, price:cardPrice(card.rank), ...(i === 0 ? {claimedBy:"p2"} : {})})) };
  return <OpenDraftPanel view={view} send={()=>{}} disabled={false} seconds={20} />;
}

/** Reuses production components; no network actions, timers or new test dependencies. */
export function ResponsivePreview() {
  const [selected,setSelected] = useState(new URLSearchParams(location.search).get("case") ?? "shop-r4-5");
  const [audit,setAudit] = useState<ReturnType<typeof auditResponsiveLayout> | null>(null);
  const shown = selected === "all" ? cases : cases.filter(scene=>scene.id === selected);
  const toolbar = <details className="qa-controls"><summary>QA</summary><header className="qa-toolbar"><label>UI QA 상태 <select value={selected} onChange={e=>{setSelected(e.target.value);setAudit(null);}}><option value="all">전체 상태 매트릭스</option>{cases.map(scene=><option key={scene.id}>{scene.id}</option>)}</select></label><p>단일 상태: 내비·헤더·하단 조작 포함. 쇼다운은 실제처럼 root 바로 아래 렌더링.</p><button onClick={()=>setAudit(auditResponsiveLayout())}>레이아웃 검사</button>{audit && <pre data-qa-report>{JSON.stringify(audit,null,2)}</pre>}</header></details>;
  if (shown.length === 1 && shown[0]!.screen.startsWith("showdown")) return <>{toolbar}<Scene scene={shown[0]!} interactive={false} /></>;
  return <main className={`game-arena responsive-preview ${selected === "all" ? "qa-matrix" : "qa-single"}`}>
    {toolbar}
    {shown.map(scene=><section data-qa-case={scene.id} key={scene.id}>
      {!scene.screen.startsWith("showdown") && <nav><div className="brand"><b>PORENA</b></div><RoundProgress round={scene.round} prep={null}/><div className="nav-status"><button className="secondary">나가기</button></div></nav>}
      <div data-round={scene.round} className={`page-shell ${scene.screen === "shop" ? "shop-page" : scene.screen === "final" ? "final-results-page" : ""}`}>
        {scene.screen === "prep" && <PrepRoundHeader prep={getPrepPresentation(scene.round, "SHOP")!} />}
        {!scene.screen.startsWith("match") && !scene.screen.startsWith("ability") && !scene.screen.startsWith("showdown") && scene.screen !== "prep" && <header className={`round-header ${["draft","loadout"].includes(scene.screen) ? "is-centered-phase-header" : ""}`}><div>{scene.screen !== "final" && <span className="round-number">{scene.screen === "draft" ? `ROUND ${scene.round} · DRAFT PHASE` : `ROUND 0${scene.round}`}</span>}<div className="round-title-row"><h1>{scene.screen === "final" ? "FINAL STANDINGS" : ["","TWO HAND","RUN IT TWICE","OMAHA SWISS","BEST FIVE","THE LAST HAND"][scene.round]}</h1>{scene.screen !== "final" && <button className="secondary title-guide-trigger">?</button>}</div></div>{scene.screen !== "loadout" && scene.screen !== "final" && <div className="phase-badge"><b>{scene.screen === "shop" ? "상점" : scene.screen === "draft" ? "공개 드래프트" : "라운드 결과"}</b></div>}</header>}
        <Scene scene={scene} interactive={false} />
        {["shop","prep","results","brackets"].includes(scene.screen) && <div className="action-bar phase-ready-bar"><div className="phase-wait-copy"><b>{["shop","prep"].includes(scene.screen) ? "준비 완료" : "결과 확인"}</b><p>다음 단계로 진행합니다.</p></div><button className="primary">{["shop","prep"].includes(scene.screen) ? "준비 완료" : "다음 라운드"} →</button></div>}
      </div>
    </section>)}
  </main>;
}
