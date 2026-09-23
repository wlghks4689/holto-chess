import { useState } from "react";
import { createGame, prepareShowdown, resolvePrimary, startNextRound, leaveRoundResult, autoPickDraft, openDraft, lockRunLoadouts, pickDraftCard, setRunLoadout } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { createMatchView } from "../game/matchView";
import { TimedOpenDraftPanel, TimedRunLoadoutPanel } from "./OpenDraft";
import { ShowdownCinematic } from "./ShowdownCinematic";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { RoundGuide } from "./RoundGuide";
import { ShopCard } from "./ShopCard";
import type { GameAction } from "../shared/protocol";

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
  return <main className="page-shell"><header className="round-header"><div><span className="eyebrow">ROUND 02</span><h1>RUN IT TWICE</h1></div></header><ShowdownPrepPanel round={2} playerName="나" seconds={3} /></main>;
}
function ShopStylePreview() {
  return <main className="game-arena"><div className="page-shell shop-page"><header className="round-header"><div><span className="round-number">ROUND 01</span><h1>TWO HAND</h1></div></header><section className="shop-layout"><div className="market panel"><header><div className="shop-heading"><h2>카드 마켓</h2><strong className="shop-count">2 / 2</strong></div><span className="purchase-count">구매 0 / 2</span></header><div className="card-row market-row"><ShopCard card={{ id:"6d", rank:6, suit:"d" }} price={6} locked={false} onBuy={() => undefined} onLock={() => undefined} /><ShopCard card={{ id:"2s", rank:2, suit:"s" }} price={5} locked={false} dealIndex={1} onBuy={() => undefined} onLock={() => undefined} /></div></div></section></div></main>;
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
  return <DraftFixturePreview />;
}
