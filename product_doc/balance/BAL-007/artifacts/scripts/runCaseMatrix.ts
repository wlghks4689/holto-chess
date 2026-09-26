import { writeFileSync } from "node:fs";
import { jointSimulate } from "./lib/jointVsMarginal.ts";
import { R2_CASES, validateCases } from "./lib/cases.ts";
import { hashSeed } from "./lib/prng.ts";
import { RESULTS_DIR } from "./lib/paths.ts";

validateCases(R2_CASES);

const N = 50_000;
const t0 = Date.now();
const results = R2_CASES.map((c, i) => {
  const r = jointSimulate(c, N, hashSeed(c.id));
  console.log(`[${i + 1}/${R2_CASES.length}] ${c.id} ${c.label}: run1=${r.run1WinPercent.toFixed(2)}% run2=${r.run2WinPercent.toFixed(2)}% ` +
    `trueBothWin=${r.trueBothWinPercent.toFixed(2)}% naiveBothWin=${r.naiveBothWinPercent.toFixed(2)}% ` +
    `corr=${r.correlation.toFixed(4)} E[points]=${r.expectedLeftPoints.toFixed(3)} (${r.ms}ms)`);
  return { ...c, ...r };
});
const totalMs = Date.now() - t0;
console.log(`\nTotal: N=${N} x ${R2_CASES.length} cases, ${(totalMs / 1000).toFixed(1)}s`);

writeFileSync(`${RESULTS_DIR}/joint_case_matrix.json`, JSON.stringify({ n: N, totalMs, results }, null, 2));
console.log("Wrote joint_case_matrix.json");
