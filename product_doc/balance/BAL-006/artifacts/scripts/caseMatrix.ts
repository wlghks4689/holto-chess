// Builds the >=20-case deterministic matrix from REAL exemplars discovered by
// sweepBranches.ts (not hand-picked assumptions), plus a seat-order
// permutation/bias check for a subset of them.
import { writeFileSync } from "node:fs";
import { runOneTrial } from "./lib/fullEngineMC.ts";
import { HAND_POOLS, type HandTriple } from "./lib/cases.ts";
import { RESULTS_DIR } from "./lib/paths.ts";

type Exemplar = { poolId: string; group: "winner" | "loser"; branch: string; seed: number };

// Selected to cover every REQUEST-required scenario at least once, spread
// across different hand pools so no single pool's quirks dominate.
const SELECTION: Exemplar[] = [
  { poolId: "distinct-strength", group: "winner", branch: "SOLO_1ST", seed: 1 },
  { poolId: "distinct-strength", group: "loser", branch: "SOLO_1ST", seed: 1 },
  { poolId: "distinct-strength", group: "winner", branch: "TIED_2ND_ONLY", seed: 348 },
  { poolId: "distinct-strength", group: "loser", branch: "TIED_2ND_ONLY", seed: 196 },
  { poolId: "near-mirror-pairs", group: "winner", branch: "SOLO_1ST", seed: 6 },
  { poolId: "near-mirror-pairs", group: "winner", branch: "TIED_2ND_ONLY", seed: 2 },
  { poolId: "near-mirror-pairs", group: "winner", branch: "TIE_1ST_1_SUDDEN_DEATH", seed: 5 },
  { poolId: "near-mirror-pairs", group: "winner", branch: "TIE_1ST_2_SUDDEN_DEATH", seed: 3 },
  { poolId: "near-mirror-pairs", group: "winner", branch: "TIE_1ST_HIGH_CARD_DRAW", seed: 1 },
  { poolId: "near-mirror-pairs", group: "loser", branch: "SOLO_1ST", seed: 1 },
  { poolId: "near-mirror-pairs", group: "loser", branch: "TIED_2ND_ONLY", seed: 4 },
  { poolId: "near-mirror-pairs", group: "loser", branch: "TIE_1ST_1_SUDDEN_DEATH", seed: 9 },
  { poolId: "near-mirror-pairs", group: "loser", branch: "TIE_1ST_2_SUDDEN_DEATH", seed: 2 },
  { poolId: "near-mirror-pairs", group: "loser", branch: "TIE_1ST_HIGH_CARD_DRAW", seed: 6 },
  { poolId: "weak-disconnected-trio", group: "winner", branch: "SOLO_1ST", seed: 6 },
  { poolId: "weak-disconnected-trio", group: "winner", branch: "TIED_2ND_ONLY", seed: 2 },
  { poolId: "weak-disconnected-trio", group: "winner", branch: "TIE_1ST_HIGH_CARD_DRAW", seed: 1 },
  { poolId: "two-strong-one-weak", group: "winner", branch: "SOLO_1ST", seed: 2 },
  { poolId: "two-strong-one-weak", group: "winner", branch: "TIED_2ND_ONLY", seed: 5 },
  { poolId: "two-strong-one-weak", group: "winner", branch: "TIE_1ST_1_SUDDEN_DEATH", seed: 4 },
  { poolId: "two-strong-one-weak", group: "loser", branch: "TIE_1ST_HIGH_CARD_DRAW", seed: 6 },
  { poolId: "all-suited-runup", group: "winner", branch: "SOLO_1ST", seed: 2 },
  { poolId: "all-suited-runup", group: "winner", branch: "TIE_1ST_1_SUDDEN_DEATH", seed: 1 },
  { poolId: "all-suited-runup", group: "winner", branch: "TIE_1ST_2_SUDDEN_DEATH", seed: 65 },
];

const poolById = new Map(HAND_POOLS.map((p) => [p.id, p]));

const rows = SELECTION.map((ex) => {
  const pool = poolById.get(ex.poolId)!;
  const trial = runOneTrial(pool.hands, ex.group, ex.seed);
  return { ...ex, label: pool.label, hands: pool.hands, trial };
});

// Seat-order / permutation bias check: for 3 representative (pool, seed) pairs,
// permute WHICH hand sits at p1/p2/p3 and confirm the outcome for a given HAND
// (not seat) is invariant to where it sits -- i.e. no seat-position bias in
// the engine's tie-break/placement logic itself. This is a property of
// resolveParticipants (identical for every playerId), verified empirically.
function permute<T>(arr: [T, T, T], order: [number, number, number]): [T, T, T] {
  return [arr[order[0]], arr[order[1]], arr[order[2]]] as [T, T, T];
}
const ORDERS: [number, number, number][] = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1]];
const seatBiasChecks = [
  { poolId: "distinct-strength", group: "winner" as const, seed: 1 },
  { poolId: "near-mirror-pairs", group: "winner" as const, seed: 2 },
  { poolId: "weak-disconnected-trio", group: "loser" as const, seed: 1 },
].map(({ poolId, group, seed }) => {
  const pool = poolById.get(poolId)!;
  const perOrder = ORDERS.map((order) => {
    const hands = permute(pool.hands, order);
    const trial = runOneTrial(hands, group, seed);
    // Map result back to "which original hand (0/1/2) got which place"
    const placeByOriginalHand: number[] = [0, 0, 0];
    order.forEach((originalIndex, seatIndex) => { placeByOriginalHand[originalIndex] = trial.place[seatIndex]; });
    return { order, placeByOriginalHand };
  });
  const baseline = JSON.stringify(perOrder[0]!.placeByOriginalHand);
  const allMatch = perOrder.every((p) => JSON.stringify(p.placeByOriginalHand) === baseline);
  return { poolId, group, seed, perOrder, allMatch };
});

writeFileSync(`${RESULTS_DIR}/case_matrix.json`, JSON.stringify(rows, null, 2));
writeFileSync(`${RESULTS_DIR}/seat_bias_check.json`, JSON.stringify(seatBiasChecks, null, 2));

console.log(`Wrote ${rows.length} case-matrix rows to case_matrix.json`);
console.log("\nSeat-bias check (same 3 hands, different p1/p2/p3 seat assignment, same seed):");
for (const check of seatBiasChecks) {
  console.log(` ${check.poolId}/${check.group} seed=${check.seed}: allOrdersAgree=${check.allMatch}`);
}
