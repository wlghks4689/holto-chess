// Development harness: real seeded engine state, server projection and disclosure; no synthetic cards.
import { createGame, prepareShowdown, lockRunLoadouts } from "../../src/game/engine";
import { fastForwardToRound } from "../../src/ui/devFastForward";
import { applyLocalGameCommand } from "../../src/ui/localGameCommand";
import { barrierDeadline, forceBarrier, type RoomSnapshot } from "../../src/game/room";
import { createPlayerView } from "../../src/game/playerView";
import { anchorNewPresentation } from "../../src/game/presentationCommit";
import type { Round } from "../../src/game/types";
import { finalFourWayEquity } from "../../src/game/showdownEquity";
let room: RoomSnapshot | undefined;
let busy = false;
let metrics: Record<string, number> = {};
function sendView(viewer: string) {
  const start = performance.now();
  const view = createPlayerView(room!, viewer);
  metrics.maxProjectionMs = Math.max(metrics.maxProjectionMs ?? 0, performance.now() - start);
  self.postMessage({ view, viewer, metrics });
}
self.onmessage = async (event: MessageEvent<{ round?: Round; mode?: string }>) => {
  if (busy) return; // Mirror GameRoom's blockConcurrencyWhile event serialization.
  busy = true;
  try {
    if (event.data.round) {
      let game = fastForwardToRound(createGame(789), event.data.round);
      for (let seed = 790; game.players[0]!.eliminated && seed < 810; seed++) game = fastForwardToRound(createGame(seed), event.data.round);
      for (let i = 0; i < 200 && game.phase !== "SHOWDOWN_PRIMARY"; i++) {
        if (game.phase === "SHOP") game = prepareShowdown(game, []);
        else if (game.phase === "RUN_LOADOUT") game = lockRunLoadouts(game, []);
        else game = applyLocalGameCommand(game, { type: game.phase === "FINAL_AUCTION" || game.phase === "FINAL_LOADOUT" ? "AUCTION_TICK" : "ADVANCE" }, (game.finalAuction?.loadoutEndsAt ?? game.finalAuction?.endsAt ?? Date.now()) + 1000);
      }
      if (game.phase !== "SHOWDOWN_PRIMARY") throw Error(`Fixture stopped at ${game.phase}`);
      if (event.data.mode === "local") { self.postMessage({ game }); return; }
      const viewer = game.players.find(p => !p.eliminated)!.id;
      room = { schema: 1, roomId: "PERF", revision: 0, status: "PLAYING", game,
        sessions: game.players.filter(p => !p.eliminated).map(p => ({ playerId: p.id, tokenHash: "test", requests: [] })),
        readyIds: [], endedShopIds: [], barrierSince: Date.now() - 8000 };
      metrics = {};
      if (game.round === 6) {
        const prep = createPlayerView(room, viewer).showdownPrep!;
        const seats = [prep.viewer, ...prep.opponents!];
        const start = performance.now();
        // Diagnostic only: measure the former synchronous dependency off the browser main thread.
        finalFourWayEquity(seats.map(seat => seat.cards), seats.flatMap(seat => seat.blockCards ?? []));
        metrics.finalEquityMs = performance.now() - start;
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      anchorNewPresentation(undefined, room, Date.now());
      sendView(viewer); return;
    }
    if (room) {
      if (room.game.phase === "SHOWDOWN_PRIMARY" && Date.now() >= barrierDeadline(room)!) {
        const start = performance.now();
        const next = forceBarrier(room, Date.now());
        metrics.resolveMs = performance.now() - start;
        if (next) { await new Promise(resolve => setTimeout(resolve, 0)); anchorNewPresentation(room, next, Date.now()); room = next; }
      }
      const viewer = room.game.players.find(p => !p.eliminated)!.id;
      sendView(viewer);
    }
  } catch (error) { self.postMessage({ error: String(error) }); }
  finally { busy = false; }
};
