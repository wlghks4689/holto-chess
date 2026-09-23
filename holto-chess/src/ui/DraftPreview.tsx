import { useState } from "react";
import { createGame, prepareShowdown, resolvePrimary, startNextRound, leaveRoundResult, autoPickDraft, openDraft, lockRunLoadouts, pickDraftCard, setRunLoadout } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { createMatchView } from "../game/matchView";
import { TimedOpenDraftPanel, TimedRunLoadoutPanel } from "./OpenDraft";
import { ShowdownCinematic } from "./ShowdownCinematic";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { RoundGuide } from "./RoundGuide";
import { ShopCard } from "./ShopCard";
import { FinalStandingRow, FinalStandingsHeader } from "./FinalStandingRow";
import type { GameAction } from "../shared/protocol";
import type { FinalStandingView } from "../shared/protocol";

/** Development-only fixture gallery; never connected to a real room. */
function fixture(round: 2 | 4) {
  let game = startNextRound(leaveRoundResult(resolvePrimary(prepareShowdown(createGame(303), []))));
  if (round === 4) {
    game.round = 3; game.phase = "NEXT_ROUND";
    game.ownershipCardPool.forEach((e) => { e.state = "AVAILABLE"; delete e.ownerPlayerId; delete e.reservedPlayerId; });
    game.players.forEach((p, index) => {
      p.eliminated = index >= 6; p.ownedCardIds = []; p.shopCardIds = []; p.lockedShopCardIds = [];
      if (!p.eliminated) for (const entry of game.ownershipCardPool.slice(index * 4, index * 4 + 4)) { p.ownedCardIds.push(entry.card.id); entry.state = "OWNED"; entry.ownerPlayerId = p.id; }
    });
    game = startNextRound(game);
  }
  return game;
}
function ShowdownPrepPreview() {
  const matchup = { matchNumber:1, viewer:{playerId:"p1",name:"나",points:12,cards:[{id:"As",rank:14 as const,suit:"s" as const},{id:"Kh",rank:13 as const,suit:"h" as const},{id:"Qd",rank:12 as const,suit:"d" as const},{id:"8c",rank:8 as const,suit:"c" as const}]}, opponent:{playerId:"p2",name:"블러프 폭스",points:16,cards:[{id:"Th",rank:10 as const,suit:"h" as const},{id:"Tc",rank:10 as const,suit:"c" as const},{id:"7d",rank:7 as const,suit:"d" as const},{id:"2s",rank:2 as const,suit:"s" as const}]} };
  return <main className="game-arena"><div className="page-shell"><ShowdownPrepPanel round={3} playerName="나" seconds={3} matchup={matchup} /></div></main>;
}
function ShopStylePreview() {
  return <main className="game-arena"><div className="page-shell shop-page"><header className="round-header"><div><span className="round-number">ROUND 01</span><h1>TWO HAND</h1></div></header><section className="shop-layout"><div className="market panel"><header><div className="shop-heading"><h2>카드 마켓</h2><strong className="shop-count">2 / 2</strong></div><span className="purchase-count">구매 0 / 2</span></header><div className="card-row market-row"><ShopCard card={{ id:"6d", rank:6, suit:"d" }} price={6} locked={false} onBuy={() => undefined} onLock={() => undefined} /><ShopCard card={{ id:"2s", rank:2, suit:"s" }} price={5} locked={false} dealIndex={1} onBuy={() => undefined} onLock={() => undefined} /></div></div></section></div></main>;
}
const finalRows: FinalStandingView[] = [
  { playerId:"p1", points:52, handScore:15, stackScore:24, stackBB:195, total:95, displayName:"풀하우스", finalPlace:1, placement:1, rankPoints:8, cards:[{id:"Ad",rank:14,suit:"d"},{id:"Kh",rank:13,suit:"h"},{id:"As",rank:14,suit:"s"},{id:"Kd",rank:13,suit:"d"},{id:"Ac",rank:14,suit:"c"}], usedCardIds:["Ad","Kh","As","Kd","Ac"] },
  { playerId:"p2", points:32, handScore:12, stackScore:27, stackBB:177, total:71, displayName:"플러시", finalPlace:2, placement:2, rankPoints:4, cards:[{id:"Td",rank:10,suit:"d"},{id:"Qd",rank:12,suit:"d"},{id:"2d",rank:2,suit:"d"},{id:"6d",rank:6,suit:"d"},{id:"3d",rank:3,suit:"d"}], usedCardIds:["Td","Qd","2d","6d","3d"] },
  { playerId:"p3", points:35, handScore:2, stackScore:25, stackBB:168, total:62, displayName:"투페어", finalPlace:3, placement:3, rankPoints:2, cards:[{id:"9h",rank:9,suit:"h"},{id:"Ah",rank:14,suit:"h"},{id:"8d",rank:8,suit:"d"},{id:"8h",rank:8,suit:"h"},{id:"9s",rank:9,suit:"s"}], usedCardIds:["9h","Ah","8d","8h","9s"] },
];
function FinalResultsPreview() {
  const names = ["나", "턴 샤크", "올인 베어"];
  return <main className="game-arena"><div className="page-shell final-results-page"><header className="round-header"><div><span className="round-number">ROUND 05</span><h1>FINAL STANDINGS</h1></div></header><section className="final-panel"><div className="standings"><FinalStandingsHeader />{finalRows.map((row,index)=><FinalStandingRow key={row.playerId} row={row} name={names[index]!} />)}</div></section></div></main>;
}
function AugmentPreview() {
  return <main className="game-arena"><div className="page-shell"><header className="round-header"><div><span className="round-number">ROUND 03</span><h1>PREPARE FOR ROUND 03</h1></div></header><section className="panel augment-panel"><span className="eyebrow">AUGMENT DRAFT</span><h2>전략을 바꿀 증강 하나를 선택하세요</h2><div className="augment-grid">{[["검은 시장","스페이드 카드 구매가 3BB 저렴합니다."],["승자의 배당","승리 보상이 5BB 증가합니다."],["회수 전문가","판매 환급률이 20% 증가합니다."]].map(([name,description])=><button key={name}><b>{name}</b><p>{description}</p><em>선택하기 →</em></button>)}</div></section></div></main>;
}
function RunSummaryPreview() {
  let game = openDraft(fixture(2));
  while (game.phase === "OPEN_DRAFT") game = autoPickDraft(game);
  game = resolvePrimary(lockRunLoadouts(game));
  const match = createMatchView(game, game.roundResults[0]!);
  return <ShowdownCinematic match={match} profiles={game.players.map((player)=>({playerId:player.id,name:player.name,points:player.points,alive:!player.eliminated}))} viewerId="p1" onComplete={()=>undefined} elapsedMs={Number.MAX_SAFE_INTEGER} />;
}
function DraftFixturePreview() {
  const [game, setGame] = useState(() => fixture(2));
  const draftPickIndex = game.draft?.picks.length ?? 0;
  const viewer = game.draft?.order[game.draft.picks.length]?.playerId ?? "p1";
  const view = createPlayerView({ schema:1, roomId:"PREVIEW", revision:0, status:"PLAYING", game, sessions:[{playerId:viewer,tokenHash:"fixture",requests:[]}], readyIds:[], endedShopIds:[], augmentChoices:{} },viewer);
  const send = (a: GameAction) => {
    if(a.type==="DRAFT_PICK") setGame((s)=>pickDraftCard(s,viewer,a.cardId));
    if(a.type==="RUN_LOADOUT") setGame((s)=>setRunLoadout(s,viewer,a.cardIds));
    if(a.type==="LOCK_RUN_LOADOUT") setGame((s)=>resolvePrimary(lockRunLoadouts(s)));
  };
  if(game.phase==="ROUND_RESULT") return <ShowdownCinematic key={game.roundResults[0]!.id} match={createMatchView(game,game.roundResults[0]!)} profiles={game.players.map((p)=>({playerId:p.id,name:p.name,points:p.points,alive:!p.eliminated}))} viewerId={viewer} controls onComplete={()=>setGame(fixture(2))} />;
  return <main className="page-shell"><h1>LOCAL DRAFT PREVIEW</h1><div className="room-controls"><button onClick={()=>setGame(fixture(2))}>R2</button><button onClick={()=>setGame(fixture(4))}>R4</button><button disabled={!["DRAFT_ORDER","OPEN_DRAFT"].includes(game.phase)} onClick={()=>setGame((s)=>s.phase==="DRAFT_ORDER"?openDraft(s):autoPickDraft(s))}>다음 선택</button></div>
    {["DRAFT_ORDER", "OPEN_DRAFT"].includes(game.phase) && <TimedOpenDraftPanel key={`${game.phase}:${draftPickIndex}`} view={view} send={send} disabled={false} seconds={null} durationSeconds={game.phase === "DRAFT_ORDER" ? 3 : 20} />}
    {game.phase==="RUN_LOADOUT" && <TimedRunLoadoutPanel key={game.phase} view={view} send={send} disabled={false} seconds={null} durationSeconds={30} />}
    {game.phase==="SHOP" && <p>상점 준비 완료 · 보유 {view.me.ownedCards.length}장 · 진열 {view.me.shopCards.length}장</p>}
  </main>;
}
export function DraftPreview() {
  const params = new URLSearchParams(location.search);
  if (params.has("showdownPrep")) return <ShowdownPrepPreview />;
  if (params.has("roundGuide")) return <RoundGuide round={params.get("roundGuide") === "1" ? 1 : 2} onClose={() => undefined} />;
  if (params.has("shopStyle")) return <ShopStylePreview />;
  if (params.has("finalResults")) return <FinalResultsPreview />;
  if (params.has("augment")) return <AugmentPreview />;
  if (params.has("runSummary")) return <RunSummaryPreview />;
  return <DraftFixturePreview />;
}
