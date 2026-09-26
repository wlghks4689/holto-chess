import { jointSimulate } from "./lib/jointVsMarginal.ts";
import { R2_CASES } from "./lib/cases.ts";
import { hashSeed } from "./lib/prng.ts";

const N = 2000;
const sample = R2_CASES.slice(0, 3);
for (const c of sample) {
  const r = jointSimulate(c, N, hashSeed(c.id));
  console.log(`${c.id}: N=${N} ms=${r.ms} (${(r.ms / N).toFixed(4)}ms/trial) run1=${r.run1WinPercent.toFixed(1)}% run2=${r.run2WinPercent.toFixed(1)}%`);
}
