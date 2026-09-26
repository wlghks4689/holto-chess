import { resolveSecondary } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/engine.ts";
import { buildThreeWayState } from "./lib/fixture.ts";

const hands: [string[], string[], string[]] = [
  ["As", "Ah", "Kd", "Kc", "2s"],
  ["7c", "7d", "9h", "Jc", "4s"],
  ["Qs", "Qh", "Tc", "8d", "3h"],
];

const N = 500;
let ties = 0, suddenDeathTotal = 0, highCardDraws = 0, maxBoards = 0;
const t0 = Date.now();
for (let i = 0; i < N; i += 1) {
  const state = buildThreeWayState({ group: "winner", seed: i + 1, hands });
  const result = resolveSecondary(state);
  const match = result.roundResults.find((m) => m.group === "winner")!;
  if (match.suddenDeathCount > 0) ties += 1;
  suddenDeathTotal += match.suddenDeathCount;
  if (match.highCardDraw) highCardDraws += 1;
  maxBoards = Math.max(maxBoards, match.boards.length);
}
const ms = Date.now() - t0;
console.log(`N=${N} trials, ${ms}ms total, ${(ms / N).toFixed(3)}ms/trial`);
console.log(`ties (suddenDeathCount>0): ${ties} (${(ties / N * 100).toFixed(2)}%)`);
console.log(`total sudden-death boards drawn: ${suddenDeathTotal}`);
console.log(`high-card draws (2 sudden deaths still tied): ${highCardDraws}`);
console.log(`max boards.length observed: ${maxBoards}`);
