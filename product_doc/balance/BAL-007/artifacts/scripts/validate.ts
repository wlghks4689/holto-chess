import { R2_CASES, validateCases } from "./lib/cases.ts";
try {
  validateCases(R2_CASES);
  console.log(`OK: ${R2_CASES.length} cases, no id collisions.`);
} catch (err) {
  console.error("VALIDATION FAILED:", (err as Error).message);
  process.exitCode = 1;
}
