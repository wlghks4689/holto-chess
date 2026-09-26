// Q8: how does the real engine behave for missing/incomplete hands and
// group sizes other than 3? Drives resolveSecondary directly — no
// reimplementation, so this is ground truth, not a guess.
import { createGame, resolveSecondary } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/engine.ts";
import { assertPoolIntegrity, releasePlayerCards } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/cardPool.ts";
import type { PorenaGameState } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/types.ts";

function assign(state: PorenaGameState, playerId: string, cardIds: readonly string[]) {
  const player = state.players.find((p) => p.id === playerId)!;
  for (const id of cardIds) {
    const entry = state.ownershipCardPool.find((e) => e.card.id === id)!;
    if (entry.state !== "AVAILABLE") throw new Error(`${id} already owned by ${entry.ownerPlayerId} — cannot double-assign`);
    entry.state = "OWNED"; entry.ownerPlayerId = playerId; player.ownedCardIds.push(id);
  }
}

function base(): PorenaGameState {
  const state = createGame(1, "seeded", 2);
  for (const p of state.players) releasePlayerCards(state, p);
  state.round = 4; state.phase = "SHOWDOWN_SECONDARY"; state.matches = []; state.roundResults = [];
  return state;
}

console.log("=== Case: one player has only 4 owned cards (incomplete hand) ===");
{
  const state = base();
  assign(state, "p1", ["As", "Ah", "Kd", "Kc"]); // only 4, missing the 5th
  assign(state, "p2", ["7c", "7d", "9h", "Jc", "4s"]);
  assign(state, "p3", ["Qs", "Qh", "Tc", "8d", "3h"]);
  assign(state, "p4", ["2c", "2d", "3c", "3d", "4c"]);
  assign(state, "p5", ["5c", "5d", "6c", "6d", "7h"]);
  state.winnerGroup = ["p1", "p2", "p3"]; state.loserGroup = ["p4", "p5"]; state.seed = 42;
  assertPoolIntegrity(state);
  const result = resolveSecondary(state);
  const match = result.roundResults.find((m) => m.group === "winner")!;
  console.log("winnerIds", match.winnerIds);
  console.log("results", match.results.map((r) => ({ id: r.playerId, place: r.place, category: r.hand.category, categoryRank: r.hand.categoryRank })));
  console.log("pointAwards", match.pointAwards);
  console.log("=> forfeited player's hand.categoryRank should be 0 (forfeitHand sentinel), pointAwards 0, and it never wins.");
}

console.log("\n=== Case: winner-group of 4 (not 3) ===");
{
  const state = base();
  assign(state, "p1", ["As", "Ah", "Kd", "Kc", "2s"]);
  assign(state, "p2", ["7c", "7d", "9h", "Jc", "4s"]);
  assign(state, "p3", ["Qs", "Qh", "Tc", "8d", "3h"]);
  assign(state, "p4", ["Js", "Jh", "9c", "9d", "6s"]);
  assign(state, "p5", ["5c", "5d", "6c", "6d", "7h"]);
  assign(state, "p6", ["2c", "2d", "3c", "3d", "4d"]);
  state.winnerGroup = ["p1", "p2", "p3", "p4"]; state.loserGroup = ["p5", "p6"]; state.seed = 7;
  assertPoolIntegrity(state);
  const result = resolveSecondary(state);
  const match = result.roundResults.find((m) => m.group === "winner")!;
  console.log("playerIds", match.playerIds, "winnerIds", match.winnerIds);
  console.log("results", match.results.map((r) => ({ id: r.playerId, place: r.place })));
  console.log("pointAwards", match.pointAwards, "(note: rewardMatch's r4WinnerGroup prize table only defines places 1/2/3 — place 4 falls through to `?? 0`)");
}

console.log("\n=== Case: duplicate card id across two 'different' hands (should be structurally impossible / must throw) ===");
{
  try {
    const state = base();
    assign(state, "p1", ["As", "Ah", "Kd", "Kc", "2s"]);
    assign(state, "p2", ["As", "7d", "9h", "Jc", "4s"]); // As already OWNED by p1 above
    console.log("Did NOT throw — unexpected");
  } catch (err) {
    console.log("Threw as expected:", (err as Error).message);
  }
}
