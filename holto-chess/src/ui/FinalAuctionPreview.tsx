import { useEffect, useState } from "react";
import { practiceState } from "../tutorial/practiceState";
import { TUTORIAL_SEED } from "../tutorial/chapters";
import { FinalAuctionPanel } from "./FinalAuctionPanel";
import { createPlayerView } from "../game/playerView";
import { bidFinalAuction, setFinalLoadout, settleFinalAuction } from "../game/finalAuction";
import { finishFinalLoadouts, resolvePrimary } from "../game/engine";
import { tickAuctionBots } from "../game/finalAuctionBot";
import { createMatchView } from "../game/matchView";
import { ShowdownCinematic } from "./ShowdownCinematic";
import { FinalRoundTransition } from "./ShowdownPrepPanel";
import type { GameAction } from "../shared/protocol";
import type { PorenaGameState } from "../game/types";

/** Development-only playable preview; no server routes or production bypass. */
export function FinalAuctionPreview() {
  const matchOnly = new URLSearchParams(location.search).get("screen") === "match";
  const [game, setGame] = useState(() => {
    const initial = practiceState(TUTORIAL_SEED, 5);
    if (new URLSearchParams(location.search).get("screen") === "bid") return bidFinalAuction(initial, initial.players.find(p => !p.eliminated && p.id !== "p1")!.id, { cardId: initial.finalAuction!.cardIds[0]!, expectedHighestAmount: null }, initial.finalAuction!.startedAt + 500);
    if (!matchOnly) return initial;
    const settled = settleFinalAuction(initial, initial.finalAuction!.endsAt);
    return finishFinalLoadouts(settled, settled.finalAuction!.loadoutEndsAt!);
  });
  const [liveNow, setLiveNow] = useState(Date.now);
  const [running, setRunning] = useState(false), [error, setError] = useState("");
  const [viewed, setViewed] = useState(false);
  const act = (fn: (g: PorenaGameState) => PorenaGameState) => { try { setGame(fn(game)); setError(""); } catch(e) { setError(String(e)); } };
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setGame(s => {
      const now = Date.now(); setLiveNow(now);
      if (s.phase === "FINAL_AUCTION") return now >= s.finalAuction!.endsAt ? settleFinalAuction(s, now) : tickAuctionBots(s, ["p1"], now);
      if (s.phase === "FINAL_LOADOUT") return finishFinalLoadouts(s, now);
      return s;
    }), 150);
    return () => clearInterval(timer);
  }, [running]);
  const now = running ? liveNow : game.phase === "FINAL_AUCTION" ? game.finalAuction!.startedAt + 1000 : game.finalAuction!.loadoutStartsAt! + 1;
  const view = createPlayerView({ schema: 1, roomId: "PREVIEW", revision: 0, status: "PLAYING", game, sessions: [{ playerId: "p1", tokenHash: "preview", requests: [] }], readyIds: [], endedShopIds: [] }, "p1", [], now);
  const send = (a: GameAction) => {
    if (a.type === "FINAL_AUCTION_BID") act(s => bidFinalAuction(s, "p1", a, now));
    if (a.type === "FINAL_LOADOUT") act(s => setFinalLoadout(s, "p1", a.cardIds, now));
    if (a.type === "LOCK_FINAL_LOADOUT") act(s => finishFinalLoadouts(setFinalLoadout(s, "p1", s.players[0]!.finalLoadoutCardIds!, now, true), now));
  };
  if (matchOnly) return <main className="game-arena"><div className="page-shell"><FinalRoundTransition matchup={view.showdownPrep} /></div></main>;
  return <main className="game-arena"><div className="page-shell"><p>DEVELOPMENT · R5 FINAL AUCTION · 실제 엔진 규칙</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
    <button className="secondary" onClick={() => { setGame(practiceState(TUTORIAL_SEED, 5)); setRunning(false); setViewed(false); }}>처음부터</button>
    <button className="secondary" onClick={() => { setGame(practiceState(TUTORIAL_SEED, 5)); setRunning(true); setViewed(false); }}>40초 실시간 경매 시작</button>
    {game.phase === "FINAL_AUCTION" && <button className="secondary" onClick={() => act(s => settleFinalAuction(s, s.finalAuction!.endsAt))}>마감 미리보기</button>}
    {game.phase === "FINAL_LOADOUT" && <button className="secondary" onClick={() => act(s => finishFinalLoadouts(s, s.finalAuction!.loadoutEndsAt!))}>출전 자동 확정</button>}
    {game.phase === "SHOWDOWN_PRIMARY" && <button className="secondary" onClick={() => act(resolvePrimary)}>쇼다운 보기</button>}
  </div>{error && <p role="alert">{error}</p>}
    {["FINAL_AUCTION", "FINAL_LOADOUT"].includes(game.phase) && <FinalAuctionPanel view={view} send={send} clock={running ? undefined : { now: () => now, offset: () => 0, observe: () => {} }} />}
    {game.phase === "SHOWDOWN_PRIMARY" && <FinalRoundTransition matchup={view.showdownPrep} />}
    {game.phase === "GAME_RESULT" && !viewed && <ShowdownCinematic match={createMatchView(game, game.roundResults[0]!)} profiles={view.players} viewerId="p1" onComplete={() => setViewed(true)} />}
    {viewed && <pre>{JSON.stringify(view.standings, null, 2)}</pre>}
  </div></main>;
}
