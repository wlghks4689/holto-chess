// Exact (full) enumeration ground truth for a marquee subset of cases —
// every possible remaining board, no sampling error at all — used to
// validate the large-N reference Monte Carlo methodology (referenceMC.ts).
// Exhaustive enumeration for ALL 72 cases is computationally prohibitive
// (R4's 42-choose-5 boards x 252 sub-evaluations per side takes ~10-12
// minutes PER CASE), so REQUEST.md's fallback ("계산 비용 때문에 샘플링하면
// 표준오차·95% CI·seed를 함께 기록한다") is used for the full case set via
// referenceMC.ts, and this script spot-checks a representative subset with
// the true exact answer.
import { writeFileSync, mkdirSync } from "node:fs";
import { makeDeck, type Card } from "/home/user/holto-chess/holto-chess/src/core/poker/cards.ts";
import { combinations } from "/home/user/holto-chess/holto-chess/src/core/poker/evaluate.ts";
import { R1_CASES, R3_CASES, R4_CASES, type Case } from "./lib/cases.ts";
import { compareRound, outcomeFor } from "./lib/evalRound.ts";
import { RESULTS_DIR } from "./lib/paths.ts";

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const asCards = (ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

function exactEquity(round: 1 | 3 | 4, c: Case) {
  const left = asCards(c.left);
  const right = asCards(c.right);
  const known = new Set([...c.left, ...c.right]);
  const unseen = deck.filter((card) => !known.has(card.id));
  const boards = combinations(unseen, 5);
  let leftWins = 0, ties = 0;
  const t0 = Date.now();
  for (const board of boards) {
    const cmp = compareRound(round, left, right, board);
    if (cmp > 0) leftWins += 1; else if (cmp === 0) ties += 1;
  }
  const ms = Date.now() - t0;
  const totalBoards = boards.length;
  const leftEquityPercent = ((leftWins + ties * 0.5) / totalBoards) * 100;
  return { id: c.id, round, label: c.label, category: c.category, left: c.left, right: c.right, totalBoards, leftWins, ties, leftLosses: totalBoards - leftWins - ties, leftEquityPercent, ms };
}

const PICKS: Record<1 | 3 | 4, string[]> = {
  1: ["r1-01", "r1-04", "r1-05", "r1-08", "r1-16", "r1-23"],
  3: ["r3-01", "r3-02", "r3-07", "r3-17"],
  4: ["r4-01", "r4-07", "r4-14"],
};

function run(round: 1 | 3 | 4, all: Case[]) {
  const cases = PICKS[round].map((id) => all.find((c) => c.id === id)!);
  console.log(`\n=== Exact enumeration round ${round}, ${cases.length} cases ===`);
  const results = cases.map((c, i) => {
    const r = exactEquity(round, c);
    console.log(`[${i + 1}/${cases.length}] ${c.id} ${c.label}: exact left=${r.leftEquityPercent.toFixed(4)}% ` +
      `(boards=${r.totalBoards}, ${(r.ms / 1000).toFixed(1)}s)`);
    return r;
  });
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(`${RESULTS_DIR}/exact_spotcheck_r${round}.json`, JSON.stringify({ round, results }, null, 2));
  return results;
}

run(1, R1_CASES);
run(3, R3_CASES);
run(4, R4_CASES);
console.log("\nDone. Wrote exact_spotcheck_r1.json, exact_spotcheck_r3.json, exact_spotcheck_r4.json");
