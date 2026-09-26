// Q5: how large is the combinatorial space, and is exact enumeration
// realistic? This measures ONE run's MARGINAL exact win probability
// (C(46,5)=1,370,754 boards for a single run's remaining deck) using the
// real findBestFive/compareHands — no reimplementation. The JOINT (both
// runs together, non-overlapping) exact space is C(46,5)*C(41,5) ≈ 1.03e12,
// which is combinatorially infeasible and is NOT attempted here — only
// reported as a calculated (not measured) figure.
import { makeDeck, type Card } from "/home/user/holto-chess-BAL-007/holto-chess/src/core/poker/cards.ts";
import { combinations, compareHands, findBestFive } from "/home/user/holto-chess-BAL-007/holto-chess/src/core/poker/evaluate.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

const leftCards = ["As", "Ah", "Kd"]; // anchor=As, secondaries Ah/Kd
const rightCards = ["7c", "7d", "9h"]; // anchor=7c, secondaries 7d/9h
const run1Left = hand(leftCards[0]!, leftCards[1]!);
const run1Right = hand(rightCards[0]!, rightCards[1]!);
const deadCards = hand(...leftCards, ...rightCards); // full 6-card exclusion, matches encounterBoards

const known = new Set(deadCards.map((c) => c.id));
const unseen = deck.filter((c) => !known.has(c.id));

const t0 = Date.now();
const boards = combinations(unseen, 5);
let leftWins = 0, ties = 0;
for (const board of boards) {
  const cmp = compareHands(findBestFive([...run1Left, ...board]), findBestFive([...run1Right, ...board]));
  if (cmp > 0) leftWins += 1; else if (cmp === 0) ties += 1;
}
const ms = Date.now() - t0;
const n = boards.length;
console.log(`RUN1 exact enumeration: ${n} boards (C(46,5)), ${(ms / 1000).toFixed(1)}s`);
console.log(`leftWinExact=${((leftWins / n) * 100).toFixed(4)}% tieExact=${((ties / n) * 100).toFixed(4)}% ` +
  `leftEquityExact=${(((leftWins + ties * 0.5) / n) * 100).toFixed(4)}%`);
console.log(`\n(joint 2-board space would be C(46,5)*C(41,5) = ${n} * ${749398} ≈ ${(n * 749398).toExponential(2)} — not attempted)`);
