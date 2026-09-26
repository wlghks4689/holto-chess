// Ground-truth reference: large-N Monte Carlo with an INDEPENDENT RNG (never
// showdownEquity's seededRandom), so this can never share bias with the code
// under test. N per round is far above the shipped SAMPLES[round] so the
// reference's own sampling error is small compared to what we're measuring.
import { writeFileSync, mkdirSync } from "node:fs";
import { makeDeck, shuffle, type Card } from "/home/user/holto-chess/holto-chess/src/core/poker/cards.ts";
import { R1_CASES, R3_CASES, R4_CASES, validateCases, type Case } from "./lib/cases.ts";
import { compareRound, outcomeFor } from "./lib/evalRound.ts";
import { mulberry32, hashSeed, ci95HalfWidth } from "./lib/prng.ts";
import { RESULTS_DIR } from "./lib/paths.ts";

validateCases(R1_CASES, 2);
validateCases(R3_CASES, 4);
validateCases(R4_CASES, 5);

const deck = makeDeck();
const byId = new Map(deck.map((c) => [c.id, c]));
const asCards = (ids: string[]): Card[] => ids.map((id) => byId.get(id)!);

const REFERENCE_N: Record<1 | 3 | 4, number> = { 1: 200_000, 3: 150_000, 4: 40_000 };

function referenceEquity(round: 1 | 3 | 4, c: Case) {
  const left = asCards(c.left);
  const right = asCards(c.right);
  const known = new Set([...c.left, ...c.right]);
  const unseen = deck.filter((card) => !known.has(card.id));
  const n = REFERENCE_N[round];
  const rng = mulberry32(hashSeed(`ref:${round}:${c.id}`));
  const outcomes: number[] = new Array(n);
  const t0 = Date.now();
  for (let i = 0; i < n; i += 1) {
    const shuffled = shuffle(unseen, rng);
    const board = shuffled.slice(0, 5);
    outcomes[i] = outcomeFor(compareRound(round, left, right, board));
  }
  const ms = Date.now() - t0;
  const mean = outcomes.reduce((a, b) => a + b, 0) / n;
  const half = ci95HalfWidth(outcomes);
  return {
    id: c.id, round, label: c.label, category: c.category,
    left: c.left, right: c.right,
    n, leftEquityPercent: mean * 100,
    ci95LowPercent: (mean - half) * 100, ci95HighPercent: (mean + half) * 100,
    ci95HalfWidthPercentPoints: half * 100,
    ms,
  };
}

function run(round: 1 | 3 | 4, cases: Case[], tag: string) {
  console.log(`\n=== Reference MC round ${round} (${tag}), N=${REFERENCE_N[round]} ===`);
  const results = cases.map((c, i) => {
    const r = referenceEquity(round, c);
    console.log(`[${i + 1}/${cases.length}] ${c.id} ${c.label}: left=${r.leftEquityPercent.toFixed(2)}% ` +
      `CI95=[${r.ci95LowPercent.toFixed(2)}, ${r.ci95HighPercent.toFixed(2)}] (${r.ms}ms)`);
    return r;
  });
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(`${RESULTS_DIR}/reference_mc_r${round}.json`, JSON.stringify({ round, tag, n: REFERENCE_N[round], results }, null, 2));
  return results;
}

run(1, R1_CASES, "hold'em 2v2");
run(3, R3_CASES, "omaha 4v4");
run(4, R4_CASES, "best-five 5v5");
console.log("\nDone. Wrote reference_mc_r1.json, reference_mc_r3.json, reference_mc_r4.json");
