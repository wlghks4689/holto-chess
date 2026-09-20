import { useState } from "react";
import { createGame, prepareShowdown, resolvePrimary, startNextRound, leaveRoundResult, autoPickDraft, openDraft, lockRunLoadouts, pickDraftCard, setRunLoadout } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { createMatchView } from "../game/matchView";
import { OpenDraftPanel, RunLoadoutPanel } from "./OpenDraft";
import { ShowdownCinematic } from "./ShowdownCinematic";
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
export function DraftPreview() {
  const [game, setGame] = useState(() => fixture(2));
  const viewer = game.draft?.order[game.draft.picks.length]?.playerId ?? "p1";
  const view = createPlayerView({ schema:1, roomId:"PREVIEW", revision:0, status:"PLAYING", game, sessions:[{playerId:viewer,tokenHash:"fixture",requests:[]}], readyIds:[], endedShopIds:[], augmentChoices:{} },viewer);
  const send = (a: GameAction) => {
    if(a.type==="DRAFT_PICK") setGame((s)=>pickDraftCard(s,viewer,a.cardId));
    if(a.type==="RUN_LOADOUT") setGame((s)=>setRunLoadout(s,viewer,a.cardIds));
    if(a.type==="LOCK_RUN_LOADOUT") setGame((s)=>resolvePrimary(lockRunLoadouts(s)));
  };
  if(game.phase==="ROUND_RESULT") return <ShowdownCinematic key={game.roundResults[0]!.id} match={createMatchView(game,game.roundResults[0]!)} profiles={game.players.map((p)=>({playerId:p.id,name:p.name,points:p.points,alive:!p.eliminated}))} viewerId={viewer} controls onComplete={()=>setGame(fixture(2))} />;
  return <main className="page-shell"><h1>LOCAL DRAFT PREVIEW</h1><div className="room-controls"><button onClick={()=>setGame(fixture(2))}>R2</button><button onClick={()=>setGame(fixture(4))}>R4</button><button disabled={!["DRAFT_ORDER","OPEN_DRAFT"].includes(game.phase)} onClick={()=>setGame((s)=>s.phase==="DRAFT_ORDER"?openDraft(s):autoPickDraft(s))}>다음 선택</button></div>
    {["DRAFT_ORDER", "OPEN_DRAFT"].includes(game.phase) && <OpenDraftPanel view={view} send={send} disabled={false} seconds={20} />}
    {game.phase==="RUN_LOADOUT" && <RunLoadoutPanel view={view} send={send} disabled={false} seconds={60} />}
    {game.phase==="SHOP" && <p>상점 준비 완료 · 보유 {view.me.ownedCards.length}장 · 진열 {view.me.shopCards.length}장</p>}
  </main>;
}
