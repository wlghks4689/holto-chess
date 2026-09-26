// Q3: does pairwise heads-up equity (computed independently per pair, on
// boards that only exclude THAT PAIR's cards) approximate true 3-way
// regulation equity? This demonstrates numerically why it cannot: the boards
// are drawn from different decks per pair (not shared across all 3), and a
// naive combination throws away the joint distribution needed for "who is
// exactly first among 3."
import { makeDeck, shuffle, type Card } from "/home/user/holto-chess-BAL-006/holto-chess/src/core/poker/cards.ts";
import { compareHands, findBestFive } from "/home/user/holto-chess-BAL-006/holto-chess/src/core/poker/evaluate.ts";
import { mulberry32, hashSeed } from "./lib/prng.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

const hands = {
  A: hand("As", "Ah", "Kd", "Kc", "2s"),
  B: hand("7c", "7d", "9h", "Jc", "4s"),
  C: hand("Qs", "Qh", "Tc", "8d", "3h"),
};

/** Heads-up win probability for `left` vs `right`, board drawn from a deck excluding ONLY these two hands (10 cards). */
function pairwiseHeadsUp(left: Card[], right: Card[], n: number, seed: number): number {
  const known = new Set([...left, ...right].map((c) => c.id));
  const unseen = deck.filter((c) => !known.has(c.id));
  const rng = mulberry32(seed);
  let leftShare = 0;
  for (let i = 0; i < n; i += 1) {
    const board = shuffle(unseen, rng).slice(0, 5);
    const cmp = compareHands(findBestFive([...left, ...board]), findBestFive([...right, ...board]));
    leftShare += cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
  }
  return leftShare / n;
}

const N = 200_000;
const pAB = pairwiseHeadsUp(hands.A, hands.B, N, hashSeed("AB"));
const pAC = pairwiseHeadsUp(hands.A, hands.C, N, hashSeed("AC"));
const pBC = pairwiseHeadsUp(hands.B, hands.C, N, hashSeed("BC"));

console.log(`Pairwise heads-up win rates (independent boards, N=${N} each):`);
console.log(`  P(A beats B) = ${(pAB * 100).toFixed(2)}%`);
console.log(`  P(A beats C) = ${(pAC * 100).toFixed(2)}%`);
console.log(`  P(B beats C) = ${(pBC * 100).toFixed(2)}%`);

// A naive (and WRONG) way someone might try to combine these into "P(A is best of 3)":
const naiveA = pAB * pAC;
const naiveB = (1 - pAB) * pBC;
const naiveC = (1 - pAC) * (1 - pBC);
const naiveSum = naiveA + naiveB + naiveC;
console.log(`\nNaive independence combination P(X beats both others), NOT normalized: A=${(naiveA * 100).toFixed(2)}% B=${(naiveB * 100).toFixed(2)}% C=${(naiveC * 100).toFixed(2)}% (sum=${(naiveSum * 100).toFixed(2)}%, should be ~100% if valid — it is NOT because the pairwise events are not independent and use DIFFERENT boards per pair, not one shared board)`);
console.log("\nCompare against exact_3way_regulation.json's true fractionalEquity for the SAME hands (see benchExact.log) to see the mismatch.");
