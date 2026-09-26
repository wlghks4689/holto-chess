// Sweeps many seeds per hand pool (both winner-group and loser-group), tags
// each trial by which engine branch it hit, and records the first exemplar
// seed found for each (pool, group, branch) combination — for building the
// deterministic case matrix in REPORT.md from REAL engine behavior, not
// hand-waved assumptions.
import { writeFileSync } from "node:fs";
import { runOneTrial } from "./lib/fullEngineMC.ts";
import { HAND_POOLS } from "./lib/cases.ts";
import { RESULTS_DIR } from "./lib/paths.ts";

type Branch = "SOLO_1ST" | "TIE_1ST_NO_SUDDEN_DEATH_NEEDED" | "TIE_1ST_1_SUDDEN_DEATH" | "TIE_1ST_2_SUDDEN_DEATH" | "TIE_1ST_HIGH_CARD_DRAW" | "TIED_2ND_ONLY";

function classify(trial: ReturnType<typeof runOneTrial>): Branch {
  if (trial.suddenDeathCount === 0) {
    const secondPlaceCount = trial.place.filter((p) => p === 2).length;
    return secondPlaceCount > 1 ? "TIED_2ND_ONLY" : "SOLO_1ST";
  }
  if (trial.hadHighCardDraw) return "TIE_1ST_HIGH_CARD_DRAW";
  if (trial.suddenDeathCount === 2) return "TIE_1ST_2_SUDDEN_DEATH";
  return "TIE_1ST_1_SUDDEN_DEATH";
}

const SEEDS_PER_POOL = 4000;
const found: Record<string, { seed: number; group: string; trial: unknown }> = {};
const branchCounts: Record<string, number> = {};

for (const pool of HAND_POOLS) {
  for (const group of ["winner", "loser"] as const) {
    for (let seed = 1; seed <= SEEDS_PER_POOL; seed += 1) {
      const trial = runOneTrial(pool.hands, group, seed);
      const branch = classify(trial);
      const key = `${pool.id}:${group}:${branch}`;
      branchCounts[key] = (branchCounts[key] ?? 0) + 1;
      const exemplarKey = `${pool.id}:${group}:${branch}`;
      if (!found[exemplarKey]) found[exemplarKey] = { seed, group, trial };
    }
  }
  console.log(`pool ${pool.id} done`);
}

writeFileSync(`${RESULTS_DIR}/branch_exemplars.json`, JSON.stringify(found, null, 2));
writeFileSync(`${RESULTS_DIR}/branch_counts.json`, JSON.stringify(branchCounts, null, 2));
console.log("Branch exemplars found:");
for (const [key, value] of Object.entries(found)) console.log(` ${key} -> seed ${value.seed}`);
console.log("\nBranch counts (rate over", SEEDS_PER_POOL, "seeds per pool/group):");
for (const [key, count] of Object.entries(branchCounts)) console.log(` ${key}: ${count} (${(count / SEEDS_PER_POOL * 100).toFixed(2)}%)`);
