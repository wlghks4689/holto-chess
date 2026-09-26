import { resolveR2 } from "./lib/fixture.ts";

const match = resolveR2({
  leftCards: ["As", "Ah", "Kd"],
  rightCards: ["7c", "7d", "9h"],
  seed: 12345,
});
console.log("playerIds", match.playerIds);
console.log("winnerIds", match.winnerIds);
console.log("boards.length", match.boards.length, "runoutCount", match.runoutCount);
console.log("runCards", match.runCards);
console.log("pointAwards", match.pointAwards);
console.log("results", match.results.map((r) => ({ id: r.playerId, place: r.place, cat: r.hand.category })));
