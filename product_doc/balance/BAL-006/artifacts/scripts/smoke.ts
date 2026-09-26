import { resolveSecondary } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/engine.ts";
import { buildThreeWayState } from "./lib/fixture.ts";

const state = buildThreeWayState({
  group: "winner",
  seed: 12345,
  hands: [
    ["As", "Ah", "Kd", "Kc", "2s"],
    ["7c", "7d", "9h", "Jc", "4s"],
    ["Qs", "Qh", "Tc", "8d", "3h"],
  ],
});
const result = resolveSecondary(state);
const match = result.roundResults.find((m) => m.group === "winner")!;
console.log("playerIds", match.playerIds);
console.log("winnerIds", match.winnerIds);
console.log("boards.length", match.boards.length);
console.log("suddenDeathCount", match.suddenDeathCount);
console.log("highCardDraw", match.highCardDraw);
console.log("results", match.results.map((r) => ({ id: r.playerId, place: r.place, cat: r.hand.category })));
console.log("pointAwards", match.pointAwards);
