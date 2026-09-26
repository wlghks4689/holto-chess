// Combines production_equity_r*.json (real showdownEquity() output),
// reference_mc_r*.json (independent-RNG large-N ground truth), and
// exact_spotcheck_r*.json (full enumeration, where computed) into one
// classification per case, and emits markdown tables ready to paste into
// REPORT.md §5.
import { readFileSync, writeFileSync } from "node:fs";
import { RESULTS_DIR } from "./lib/paths.ts";

// Shipped SAMPLES per round (showdownEquity.ts) — used to compute each case's
// OWN production-sampling-error tolerance from the reference win probability,
// rather than a flat p=0.5 approximation (which over/under-states the true
// per-case variance depending on how far p sits from 50%).
const PRODUCTION_N: Record<1 | 3 | 4, number> = { 1: 1200, 3: 600, 4: 240 };

/** 95% CI half-width (in percentage points) for a single production sample of
 * N draws, given the reference win probability p (0-100). Ties make the
 * per-trial outcome trinary (0/0.5/1), so this is a conservative upper bound
 * using the binomial p(1-p) variance, which is >= the true trinary variance. */
function productionCiHalfWidthPP(pPercent: number, n: number): number {
  const p = pPercent / 100;
  return 1.96 * Math.sqrt((p * (1 - p)) / n) * 100;
}

type ProdCase = { id: string; label: string; category: string; shownLeftPercent: number; orderStable: boolean; reorderedLeftPercent: number };
type RefCase = { id: string; leftEquityPercent: number; ci95HalfWidthPercentPoints: number };
type ExactCase = { id: string; leftEquityPercent: number };

function load<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")); }

function classifyRound(round: 1 | 3 | 4) {
  const prod = load<{ results: ProdCase[] }>(`${RESULTS_DIR}/production_equity_r${round}.json`).results;
  const ref = load<{ results: RefCase[] }>(`${RESULTS_DIR}/reference_mc_r${round}.json`).results;
  let exact: ExactCase[] = [];
  try { exact = load<{ results: ExactCase[] }>(`${RESULTS_DIR}/exact_spotcheck_r${round}.json`).results; } catch { /* not run for this round subset */ }

  const refById = new Map(ref.map((r) => [r.id, r]));
  const exactById = new Map(exact.map((r) => [r.id, r]));

  const rows = prod.map((p) => {
    const r = refById.get(p.id)!;
    const e = exactById.get(p.id);
    const baseline = e ?? r;
    const baselineLabel = e ? "exact" : "mc";
    const delta = p.shownLeftPercent - baseline.leftEquityPercent;
    const tolerance = (e ? 0 : r.ci95HalfWidthPercentPoints) + productionCiHalfWidthPP(baseline.leftEquityPercent, PRODUCTION_N[round]);
    const verdict = Math.abs(delta) <= tolerance ? "표본오차" : "계산 오류 후보";
    return { ...p, refLeftPercent: r.leftEquityPercent, refCiHalf: r.ci95HalfWidthPercentPoints,
      exactLeftPercent: e?.leftEquityPercent ?? null, baselineLabel, delta, tolerance, verdict };
  });

  const markdown = [
    "| case | 구성 | 표시값(%) | 기준값(%) | 기준 종류 | Δ(pp) | 허용오차(pp) | 판정 | 순서-안정 |",
    "|---|---|---:|---:|---|---:|---:|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.label} | ${r.shownLeftPercent} | ${r.baselineLabel === "exact" ? r.exactLeftPercent!.toFixed(3) : r.refLeftPercent.toFixed(2)} | ${r.baselineLabel === "exact" ? "★전수" : "MC(±" + r.refCiHalf.toFixed(2) + ")"} | ${r.delta.toFixed(2)} | ${r.tolerance.toFixed(2)} | ${r.verdict} | ${r.orderStable ? "안정" : `**불안정(${r.shownLeftPercent}→${r.reorderedLeftPercent})**`} |`),
  ].join("\n");

  const flagged = rows.filter((r) => r.verdict === "계산 오류 후보");
  const unstable = rows.filter((r) => !r.orderStable);
  return { round, rows, markdown, flaggedCount: flagged.length, unstableCount: unstable.length, maxOrderDelta: Math.max(0, ...unstable.map((r) => Math.abs(r.shownLeftPercent - r.reorderedLeftPercent))) };
}

const r1 = classifyRound(1);
const r3 = classifyRound(3);
const r4 = classifyRound(4);

for (const r of [r1, r3, r4]) {
  console.log(`R${r.round}: ${r.rows.length} cases, 계산오류후보=${r.flaggedCount}, 순서불안정=${r.unstableCount}, 최대 순서편차=${r.maxOrderDelta}pp`);
}

writeFileSync(`${RESULTS_DIR}/classification.json`, JSON.stringify({ r1: r1.rows, r3: r3.rows, r4: r4.rows }, null, 2));
writeFileSync(`${RESULTS_DIR}/tables.md`, [
  "## R1", r1.markdown, "", "## R3", r3.markdown, "", "## R4", r4.markdown,
].join("\n"));

const totalCases = r1.rows.length + r3.rows.length + r4.rows.length;
const totalUnstable = r1.unstableCount + r3.unstableCount + r4.unstableCount;
const maxDelta = Math.max(r1.maxOrderDelta, r3.maxOrderDelta, r4.maxOrderDelta);
console.log(`\nTOTAL cases=${totalCases} order-unstable=${totalUnstable} maxOrderDelta=${maxDelta}pp`);
console.log("Wrote classification.json and tables.md");
