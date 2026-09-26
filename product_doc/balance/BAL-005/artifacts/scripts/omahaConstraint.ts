// Targeted, deterministic checks that findBestOmaha() really enforces
// "exactly two hole cards + exactly three board cards" (REQUEST Q3), using
// adversarial hands where a naive best-5-of-7 evaluator would give a
// different (illegal) answer than true Omaha rules.
import { findBestFive, findBestOmaha } from "/home/user/holto-chess/holto-chess/src/core/poker/evaluate.ts";
import { makeDeck, type Card } from "/home/user/holto-chess/holto-chess/src/core/poker/cards.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const hand = (...ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

type Check = { name: string; holes: Card[]; board: Card[]; expectCategory: string; note: string };

const checks: Check[] = [
  {
    name: "hole-triple-eight + board-eight trap (must stay TRIPS, not QUADS)",
    holes: hand("8s", "8h", "8d", "Kc"),
    board: hand("8c", "2h", "9d"),
    expectCategory: "TRIPS",
    note: "홀 3장(8s8h8d)+보드 1장(8c) 합쳐 8이 네 장 있어도, Omaha는 홀 2장만 쓸 수 있어 포카드가 아니라 트립스여야 한다.",
  },
  {
    name: "trips-in-hole trap (3 hole kings, only 2 usable)",
    holes: hand("Ks", "Kh", "Kd", "2c"),
    board: hand("3d", "5h", "9s"),
    expectCategory: "PAIR",
    note: "홀카드에 K가 3장 있어도 2장만 쓸 수 있어 트립스가 아니라 페어(K 페어)에 그쳐야 한다.",
  },
  {
    name: "board-only-flush trap (zero hole spades)",
    holes: hand("2c", "5d", "9h", "Qc"),
    board: hand("As", "Ks", "Ts", "6s", "4s"),
    expectCategory: "HIGH_CARD",
    // Board alone has (up to) a 5-spade flush, but Omaha requires exactly
    // 2 hole + 3 board cards. Zero hole spades means 0+3=3 spades at most in
    // any legal combo, so no flush is legal however many spades sit on the board.
    note: "보드에 스페이드가 4~5장 떠 있어도 홀카드에 스페이드가 0장이면 어떤 2+3 조합도 스페이드 5장을 만들 수 없다.",
  },
  {
    name: "one-hole-flush-card is not enough (only 1 hole spade)",
    holes: hand("2s", "5d", "9h", "Qc"),
    board: hand("As", "Ks", "Ts", "6s", "4s"),
    expectCategory: "HIGH_CARD",
    note: "홀카드에 스페이드가 1장뿐이면 어떤 조합도 스페이드 5장(홀 2장 모두 필요)을 만들 수 없다.",
  },
  {
    name: "positive control: exactly 2 hole spades DOES complete a legal flush",
    holes: hand("2s", "5s", "9h", "Qc"),
    board: hand("As", "Ks", "Ts", "6s", "4c"),
    expectCategory: "FLUSH",
    note: "홀에 스페이드가 정확히 2장(2s,5s)이면 보드 스페이드 3장과 합쳐 합법적인 5-플러시가 된다 — 제약이 있어도 정상적인 플러시는 인정되어야 한다.",
  },
];

let failures = 0;
for (const check of checks) {
  const omaha = findBestOmaha(check.holes, check.board);
  const naiveSevenCard = findBestFive([...check.holes, ...check.board]);
  const pass = omaha.category === check.expectCategory;
  if (!pass) failures += 1;
  console.log(`[${pass ? "PASS" : "FAIL"}] ${check.name}`);
  console.log(`  holes=${check.holes.map((c) => c.id).join(",")} board=${check.board.map((c) => c.id).join(",")}`);
  console.log(`  findBestOmaha => ${omaha.category} (expected ${check.expectCategory})`);
  console.log(`  naive best-5-of-7 (WRONG rule, for contrast) => ${naiveSevenCard.category}`);
  console.log(`  ${check.note}`);
}

console.log(`\n${checks.length - failures}/${checks.length} Omaha constraint checks passed.`);
if (failures) process.exitCode = 1;
