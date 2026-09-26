// Q3/Q4: the UI shows each RUN's marginal win% independently. But the two
// RUN boards come from ONE non-overlapping shuffle (encounterBoards ->
// createShowdownDeck + drawCommunityBoards(deck, 2), engine.ts/showdownDeck.ts
// — real exported functions, no reimplementation), and BOTH runs share the
// same anchor card. This script measures the TRUE joint distribution of
// (RUN1 result, RUN2 result) for a fixed hand pair and compares it against
// the naive "treat the two marginals as independent" approximation.
import { makeDeck, type Card } from "/home/user/holto-chess-BAL-007/holto-chess/src/core/poker/cards.ts";
import { compareHands, findBestFive } from "/home/user/holto-chess-BAL-007/holto-chess/src/core/poker/evaluate.ts";
import { createShowdownDeck, drawCommunityBoards } from "/home/user/holto-chess-BAL-007/holto-chess/src/game/showdownDeck.ts";
import { showdownEquity } from "/home/user/holto-chess-BAL-007/holto-chess/src/ui/showdownEquity.ts";
import { mulberry32, hashSeed } from "./prng.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

export type R2JointCase = { id: string; label: string; leftCards: [string, string, string]; rightCards: [string, string, string] };

/** 1 = left win, 0.5 = split, 0 = left loss (same encoding as engine's r2Run reward branch). */
function outcome(left: Card[], right: Card[], board: Card[]): number {
  const cmp = compareHands(findBestFive([...left, ...board]), findBestFive([...right, ...board]));
  return cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
}

export function jointSimulate(c: R2JointCase, n: number, seed: number) {
  const leftAnchor = hand(c.leftCards[0])[0]!, leftSec1 = hand(c.leftCards[1])[0]!, leftSec2 = hand(c.leftCards[2])[0]!;
  const rightAnchor = hand(c.rightCards[0])[0]!, rightSec1 = hand(c.rightCards[1])[0]!, rightSec2 = hand(c.rightCards[2])[0]!;
  const owned = [leftAnchor, leftSec1, leftSec2, rightAnchor, rightSec1, rightSec2];
  const run1Left = [leftAnchor, leftSec1], run1Right = [rightAnchor, rightSec1];
  const run2Left = [leftAnchor, leftSec2], run2Right = [rightAnchor, rightSec2];

  const rng = mulberry32(seed);
  const run1Outcomes: number[] = new Array(n);
  const run2Outcomes: number[] = new Array(n);
  const t0 = Date.now();
  for (let i = 0; i < n; i += 1) {
    // Exactly mirrors engine.ts's resolveSplitRuns: ONE shuffled deck excluding
    // all 6 owned cards, 2 non-overlapping 5-card boards drawn from it in order.
    const showdownDeck = createShowdownDeck(owned, rng);
    const [board1, board2] = drawCommunityBoards(showdownDeck, 2);
    run1Outcomes[i] = outcome(run1Left, run1Right, board1!);
    run2Outcomes[i] = outcome(run2Left, run2Right, board2!);
  }
  const ms = Date.now() - t0;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const run1Win = mean(run1Outcomes), run2Win = mean(run2Outcomes);
  // Joint categorical outcome per trial in {win,split,loss} x {win,split,loss} — collapse
  // to a simple "did left come out ahead on points" indicator too (win=4,split=2,loss=0 per run).
  const pointsOf = (o: number) => (o === 1 ? 4 : o === 0.5 ? 2 : 0);
  const leftPoints = run1Outcomes.map((o, i) => pointsOf(o) + pointsOf(run2Outcomes[i]!));
  const expectedLeftPoints = mean(leftPoints);
  const bothWin = mean(run1Outcomes.map((o, i) => (o === 1 && run2Outcomes[i] === 1 ? 1 : 0)));
  const bothLoss = mean(run1Outcomes.map((o, i) => (o === 0 && run2Outcomes[i] === 0 ? 1 : 0)));
  const splitSplit = mean(run1Outcomes.map((o, i) => (o === 0.5 && run2Outcomes[i] === 0.5 ? 1 : 0)));

  // Naive "treat marginals as independent" approximation using the SAME marginals
  // (computed here from this simulation, which should match showdownEquity's own
  // marginal estimate within MC noise — checked separately below).
  const naiveBothWin = run1Win * run2Win;

  // Pearson correlation between the two runs' win-indicator (1/0.5/0 outcome) series.
  const covariance = mean(run1Outcomes.map((o, i) => o * run2Outcomes[i]!)) - run1Win * run2Win;
  const sd = (xs: number[], m: number) => Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  const correlation = covariance / (sd(run1Outcomes, run1Win) * sd(run2Outcomes, run2Win));

  return {
    id: c.id, label: c.label, n, ms,
    run1WinPercent: run1Win * 100, run2WinPercent: run2Win * 100,
    trueBothWinPercent: bothWin * 100, naiveBothWinPercent: naiveBothWin * 100,
    bothLossPercent: bothLoss * 100, splitSplitPercent: splitSplit * 100,
    expectedLeftPoints, correlation,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c: R2JointCase = { id: "smoke", label: "AAKx vs 77Nx", leftCards: ["As", "Ah", "Kd"], rightCards: ["7c", "7d", "9h"] };
  const N = 1000;
  const result = jointSimulate(c, N, hashSeed(c.id));
  console.log(JSON.stringify(result, null, 2));

  // Cross-check: this simulation's run1/run2 marginal % should roughly match the
  // production showdownEquity()'s own marginal estimate for the same hands (both
  // are Monte Carlo estimates of the SAME marginal quantity, just different N/seed).
  const allSix = hand(...c.leftCards, ...c.rightCards);
  const uiRun1 = showdownEquity(2, hand(c.leftCards[0], c.leftCards[1]), hand(c.rightCards[0], c.rightCards[1]), allSix)!;
  const uiRun2 = showdownEquity(2, hand(c.leftCards[0], c.leftCards[2]), hand(c.rightCards[0], c.rightCards[2]), allSix)!;
  console.log("\nproduction showdownEquity() RUN1:", uiRun1, "RUN2:", uiRun2);
  console.log(`(sanity check only — N=${N} here vs SAMPLES[2]=1200 in production, so a few points of MC noise is expected)`);
}
