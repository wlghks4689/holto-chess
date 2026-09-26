// Q7 proof-of-concept: generalizing BAL-005's fix ("sort the full known-card
// union before building the seed string") to N hands. This is NOT the real
// showdownEquity.ts — it's a standalone prototype demonstrating the design
// recommendation is sound before recommending it to Codex.
import { makeDeck, shuffle, type Card } from "/home/user/holto-chess-BAL-006/holto-chess/src/core/poker/cards.ts";

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
}

/** Prototype N-way canonical-seed board sampler. */
function sampleBoard(hands: readonly (readonly Card[])[]): Card[] {
  const known = hands.flat();
  const ids = new Set(known.map((c) => c.id));
  if (ids.size !== known.length) throw new Error("duplicate card id across hands");
  const deck = makeDeck();
  const available = deck.filter((c) => !ids.has(c.id));
  const canonicalIds = known.map((c) => c.id).sort(); // <-- the whole point: sort the UNION, not per-hand
  const rng = seededRandom(canonicalIds.join(":"));
  return shuffle(available, rng).slice(0, 5);
}

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

const A = hand("As", "Ah", "Kd", "Kc", "2s");
const B = hand("7c", "7d", "9h", "Jc", "4s");
const C = hand("Qs", "Qh", "Tc", "8d", "3h");

const boardIds = (board: Card[]) => board.map((c) => c.id).sort().join(",");

const baseline = boardIds(sampleBoard([A, B, C]));

const checks: { label: string; board: string }[] = [
  { label: "original order [A,B,C]", board: boardIds(sampleBoard([A, B, C])) },
  { label: "hand array order swapped [C,A,B]", board: boardIds(sampleBoard([C, A, B])) },
  { label: "hand array order swapped [B,C,A]", board: boardIds(sampleBoard([B, C, A])) },
  { label: "cards WITHIN hand A reversed", board: boardIds(sampleBoard([[...A].reverse(), B, C])) },
  { label: "cards WITHIN hand B reversed", board: boardIds(sampleBoard([A, [...B].reverse(), C])) },
  { label: "all 3 hands internally reversed AND array order swapped", board: boardIds(sampleBoard([[...C].reverse(), [...A].reverse(), [...B].reverse()])) },
];

console.log("baseline board:", baseline);
let allPass = true;
for (const check of checks) {
  const pass = check.board === baseline;
  if (!pass) allPass = false;
  console.log(`[${pass ? "PASS" : "FAIL"}] ${check.label}: ${check.board}`);
}
console.log(`\n${allPass ? "모든 순서 변형에서 보드 시드가 동일함 (제안된 N-way canonicalization이 유효함)" : "일부 변형에서 보드가 달라짐 — 제안 재검토 필요"}`);

// Also confirm a DIFFERENT card set gets a DIFFERENT board (i.e., not a constant function).
const D = hand("2h", "3d", "4c", "5h", "6d");
console.log("\ndifferent hand set produces a different board:", boardIds(sampleBoard([A, B, D])) !== baseline);
