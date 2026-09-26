// Specifically hunts for a trial where ALL THREE hands tie for 1st on the
// regulation board (not just 2-of-3), to demonstrate the "any original
// tied-for-1st leader who doesn't ultimately win becomes place=2, regardless
// of how the tiebreak actually played out" collapse concretely (REPORT.md §1.2).
import { runOneTrial } from "./lib/fullEngineMC.ts";
import { HAND_POOLS } from "./lib/cases.ts";

for (const pool of HAND_POOLS) {
  for (const group of ["winner", "loser"] as const) {
    for (let seed = 1; seed <= 6000; seed += 1) {
      const trial = runOneTrial(pool.hands, group, seed);
      if (trial.suddenDeathCount > 0) {
        const twos = trial.place.filter((p) => p === 2).length;
        if (twos === 2) {
          console.log(`FOUND: pool=${pool.id} group=${group} seed=${seed} place=${JSON.stringify(trial.place)} sd=${trial.suddenDeathCount} hcd=${trial.hadHighCardDraw} pts=${JSON.stringify(trial.pointAwards)}`);
        }
      }
    }
  }
}
console.log("done");
