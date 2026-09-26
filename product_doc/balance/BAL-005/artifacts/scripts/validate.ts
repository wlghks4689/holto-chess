import { R1_CASES, R3_CASES, R4_CASES, validateCases } from "./lib/cases.ts";

try {
  validateCases(R1_CASES, 2);
  validateCases(R3_CASES, 4);
  validateCases(R4_CASES, 5);
  console.log(`OK: R1=${R1_CASES.length} R3=${R3_CASES.length} R4=${R4_CASES.length} cases, no id collisions.`);
} catch (err) {
  console.error("VALIDATION FAILED:", (err as Error).message);
  process.exitCode = 1;
}
