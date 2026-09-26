import { makeDeck, type Card } from "/home/user/holto-chess-BAL-006/holto-chess/src/core/poker/cards.ts";
import { exactRegulationEquity } from "./lib/regulationEquity.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

const hands = [
  hand("As", "Ah", "Kd", "Kc", "2s"),
  hand("7c", "7d", "9h", "Jc", "4s"),
  hand("Qs", "Qh", "Tc", "8d", "3h"),
];

const t0 = Date.now();
const result = exactRegulationEquity(hands);
const ms = Date.now() - t0;
console.log(`boards enumerated: ${result.n}, elapsed: ${(ms / 1000).toFixed(1)}s`);
console.log("soloWinProbability", result.soloWinProbability.map((p) => (p * 100).toFixed(3) + "%"));
console.log("tiedFor1stProbability", result.tiedFor1stProbability.map((p) => (p * 100).toFixed(3) + "%"));
console.log("fractionalEquity", result.fractionalEquity.map((p) => (p * 100).toFixed(3) + "%"));
console.log("sum of fractionalEquity (must be ~100%)", result.fractionalEquity.reduce((a, b) => a + b, 0) * 100);
