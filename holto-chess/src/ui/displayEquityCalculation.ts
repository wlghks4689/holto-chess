import { finalFourWayEquity, r4ThreeWayEquity, showdownEquity } from "../game/showdownEquity";
import { visibleStreetEquity } from "./streetEquity";
import type { EquityJob, EquityValues } from "./displayEquity";

/** Runs in the display Worker; game/ability eligibility continues to use the original evaluator. */
export function calculateDisplayEquity(jobs: readonly EquityJob[]): EquityValues {
  return jobs.map(job => {
    if (job.hands.some(hand => hand.some(card => card.hidden))) return null;
    switch (job.kind) {
      case "headsUp": return job.hands.length === 2 ? showdownEquity(job.round, job.hands[0]!, job.hands[1]!, job.dead) : null;
      case "threeWay": return r4ThreeWayEquity(job.hands);
      case "final": return finalFourWayEquity(job.hands, job.dead).map(Math.round);
      case "street": return visibleStreetEquity(job.hands, job.board, job.omaha, job.dead);
    }
  });
}
