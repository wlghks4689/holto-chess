// Q6: reproducibility, left-right symmetry, card-order invariance, and
// duplicate/incomplete-input handling — specifically for the R2 deadCards
// path, which src/ui/showdownEquity.test.ts does NOT yet combine with the
// order-reversal check (it tests order-invariance for rounds 1/2/3/4 without
// deadCards, and deadCards validation separately, but not both together).
import { makeDeck, type Card } from "/home/user/holto-chess-BAL-007/holto-chess/src/core/poker/cards.ts";
import { showdownEquity } from "/home/user/holto-chess-BAL-007/holto-chess/src/ui/showdownEquity.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

let failures = 0;
function check(name: string, pass: boolean, detail?: string) {
  if (!pass) failures += 1;
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
}

const leftCards = ["As", "Ah", "Kd"], rightCards = ["7c", "7d", "9h"];
const run1Left = hand(leftCards[0]!, leftCards[1]!), run1Right = hand(rightCards[0]!, rightCards[1]!);
const deadCards = hand(...leftCards, ...rightCards);

// 1) Repeatability.
const a = showdownEquity(2, run1Left, run1Right, deadCards);
const b = showdownEquity(2, run1Left, run1Right, deadCards);
check("repeatability (same call twice)", JSON.stringify(a) === JSON.stringify(b));

// 2) Left-right symmetry WITH deadCards.
const swapped = showdownEquity(2, run1Right, run1Left, deadCards);
check("left-right symmetry with deadCards", JSON.stringify(swapped) === JSON.stringify([a![1], a![0]]),
  `a=${JSON.stringify(a)} swapped=${JSON.stringify(swapped)}`);

// 3) Card order invariance WITHIN each hand, WITH deadCards reordered too.
const reordered = showdownEquity(2, [...run1Left].reverse(), [...run1Right].reverse(), [...deadCards].reverse());
check("card-order invariance (hands + deadCards all reversed) with deadCards", JSON.stringify(reordered) === JSON.stringify(a));

// 4) deadCards array order invariance (deadCards shuffled, not just reversed).
const shuffledDead = [deadCards[3]!, deadCards[0]!, deadCards[5]!, deadCards[1]!, deadCards[4]!, deadCards[2]!];
const deadReordered = showdownEquity(2, run1Left, run1Right, shuffledDead);
check("deadCards internal order invariance", JSON.stringify(deadReordered) === JSON.stringify(a));

// 5) Duplicate card across shown hands and deadCards (e.g. same card appears in both run's shown hand AND deadCards list) -> should be rejected.
const dupDeadCards = [...deadCards, run1Left[0]!]; // As duplicated
const dupResult = showdownEquity(2, run1Left, run1Right, dupDeadCards);
check("duplicate card (shown hand card repeated in deadCards) returns null", dupResult === null, `got ${JSON.stringify(dupResult)}`);

// 6) Incomplete hand (1 card instead of 2) -> null.
const incomplete = showdownEquity(2, hand(leftCards[0]!), run1Right, deadCards);
check("incomplete hand (1 card) returns null", incomplete === null);

// 7) Missing deadCards entirely (empty array) still returns a valid (if different) result, not null/crash.
const noDead = showdownEquity(2, run1Left, run1Right, []);
check("empty deadCards array does not crash / returns a valid result", noDead !== null && noDead[0]! + noDead[1]! === 100);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}`);
if (failures) process.exitCode = 1;
