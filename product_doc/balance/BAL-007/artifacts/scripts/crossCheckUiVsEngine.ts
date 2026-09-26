// Q1/Q2: does the UI's per-run equity call use the RIGHT hand split (matches
// engine.ts's handFor/shownCardIds) and the RIGHT dead-card exclusion (all 6
// owned cards, not just the 4 cards shown in that run)? Calls the REAL
// showdownEquity() — no reimplementation.
import { makeDeck, type Card } from "/home/user/holto-chess-BAL-007/holto-chess/src/core/poker/cards.ts";
import { showdownEquity } from "/home/user/holto-chess-BAL-007/holto-chess/src/ui/showdownEquity.ts";
import { resolveR2 } from "./lib/fixture.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

const leftCards: [string, string, string] = ["As", "Ah", "Kd"]; // anchor=As, secondaries Ah/Kd
const rightCards: [string, string, string] = ["7c", "7d", "9h"]; // anchor=7c, secondaries 7d/9h

// 1) Confirm the engine's actual RUN split (via resolvePrimary -> handFor/shownCardIds).
//    match.runCards[playerId] is string[][] (card ids), not Card objects.
const match = resolveR2({ leftCards, rightCards, seed: 999 });
console.log("engine runCards.p1:", match.runCards!.p1!);
console.log("engine runCards.p2:", match.runCards!.p2!);

// 2) The UI's playerView.ts builds runIds identically: [[sel[0],sel[1]],[sel[0],sel[2]]].
//    Reproduce that same construction here (it's the exact one-liner from playerView.ts,
//    not a reimplementation of any evaluation logic) and confirm it matches the engine's
//    actual runCards above.
const uiRun1Left = [leftCards[0], leftCards[1]], uiRun2Left = [leftCards[0], leftCards[2]];
const uiRun1Right = [rightCards[0], rightCards[1]], uiRun2Right = [rightCards[0], rightCards[2]];
const uiMatchesEngine =
  JSON.stringify(uiRun1Left) === JSON.stringify(match.runCards!.p1![0]!) &&
  JSON.stringify(uiRun2Left) === JSON.stringify(match.runCards!.p1![1]!) &&
  JSON.stringify(uiRun1Right) === JSON.stringify(match.runCards!.p2![0]!) &&
  JSON.stringify(uiRun2Right) === JSON.stringify(match.runCards!.p2![1]!);
console.log("\nUI runIds construction matches engine's actual RUN split:", uiMatchesEngine);

// 3) Dead-card exclusion: correct (all 6 owned cards) vs a WRONG "only this run's 4 shown
//    cards" exclusion, to show numerically why the full-6 exclusion matters.
const allSix = hand(...leftCards, ...rightCards);
const run1Left = hand(leftCards[0], leftCards[1]);
const run1Right = hand(rightCards[0], rightCards[1]);

const correct = showdownEquity(2, run1Left, run1Right, allSix)!;
const wrongNoDeadCards = showdownEquity(2, run1Left, run1Right, [])!; // as if only the 4 shown-in-this-run cards were dead
console.log("\nRUN1 equity WITH correct 6-card dead-card exclusion:", correct);
console.log("RUN1 equity WITH NO dead-card exclusion (wrong — leaves the other 2 secondaries in the deck):", wrongNoDeadCards);
console.log("Difference exists (dead-card exclusion changes the result):", JSON.stringify(correct) !== JSON.stringify(wrongNoDeadCards));
