import { expect, it } from "vitest";
import { runItTwiceSummary } from "./runItTwiceSummary";

it.each([
  { boards: [["a"], ["a"]], score: { a: 2, b: 0 }, tied: false, winner: "a" },
  { boards: [["a"], ["a", "b"]], score: { a: 1, b: 0 }, tied: false, winner: "a" },
  { boards: [["a"], ["b"], ["b"]], score: { a: 1, b: 1 }, tied: true, winner: "b" },
  { boards: [["a", "b"], ["a", "b"], ["a", "b"], ["a"]], score: { a: 0, b: 0 }, tied: true, winner: "a" },
])("projects authoritative results without adding SD to regular score: $boards", ({ boards, score, tied, winner }) => {
  const summary = runItTwiceSummary({ runoutCount: 2, boardWinnerIds: boards, winnerIds: [winner] }, ["a", "b"])!;
  expect(summary.regularScore).toEqual(score);
  expect(summary.tied).toBe(tied);
  expect(summary.suddenDeath).toHaveLength(boards.length - 2);
  expect(summary.finalWinnerPlayerId).toBe(winner);
  if (boards.length === 4) expect(summary.suddenDeath).toEqual([{ winnerPlayerId: null, split: true, attempt: 1 }, { winnerPlayerId: "a", split: false, attempt: 2 }]);
});
