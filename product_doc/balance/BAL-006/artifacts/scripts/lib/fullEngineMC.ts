// Drives the REAL resolveSecondary() for every trial — the only way to get
// the actual final-match win probability, expected R4 points, and (for the
// loser group) survival probability, because the sudden-death cascade and
// the "any original regulation-tied leader who doesn't ultimately win is
// placed 2nd" rule (engine.ts resolveParticipants, ~line 402-411) are too
// intricate to safely reimplement — see REPORT.md for the full trace.
import { resolveSecondary } from "/home/user/holto-chess-BAL-006/holto-chess/src/game/engine.ts";
import { buildThreeWayState, type ThreeWaySpec } from "./fixture.ts";
import { ci95HalfWidth } from "./prng.ts";

export type TrialOutcome = {
  place: [number, number, number];
  winnerIndex: number; // index (0/1/2) of playerIds[...] that has place===1
  suddenDeathCount: number;
  hadHighCardDraw: boolean;
  boardsUsed: number;
  pointAwards?: [number, number, number];
};

/** playerIds are always ["p1","p2","p3"] in the tested group per lib/fixture.ts. */
export function runOneTrial(hands: [string[], string[], string[]], group: "winner" | "loser", seed: number): TrialOutcome {
  const spec: ThreeWaySpec = { hands, group, seed };
  const state = buildThreeWayState(spec);
  const result = resolveSecondary(state);
  const match = result.roundResults.find((m) => m.group === group)!;
  const testIds = ["p1", "p2", "p3"];
  const place = testIds.map((id) => match.results.find((r) => r.playerId === id)!.place) as [number, number, number];
  const winnerIndex = testIds.findIndex((id) => match.winnerIds.includes(id));
  const pointAwards = match.pointAwards ? (testIds.map((id) => match.pointAwards![id]!) as [number, number, number]) : undefined;
  return {
    place, winnerIndex, suddenDeathCount: match.suddenDeathCount,
    hadHighCardDraw: !!match.highCardDraw, boardsUsed: match.boards.length, pointAwards,
  };
}

export type MCSummary = {
  n: number;
  winProbability: number[]; // P(place===1) per test player
  expectedPoints: number[]; // requires group === "winner"
  survivalProbability: number[]; // requires group === "loser" (== winProbability, named for clarity)
  ci95HalfWidthWin: number[];
  ci95HalfWidthPoints?: number[];
  tieRate: number; // fraction of trials with suddenDeathCount > 0
  highCardDrawRate: number;
  ms: number;
};

export function runMonteCarlo(hands: [string[], string[], string[]], group: "winner" | "loser", n: number, seedBase: number): MCSummary {
  const winOutcomes: number[][] = [[], [], []];
  const pointOutcomes: number[][] = [[], [], []];
  let ties = 0, highCardDraws = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i += 1) {
    const trial = runOneTrial(hands, group, seedBase + i);
    for (let p = 0; p < 3; p += 1) {
      winOutcomes[p]!.push(trial.place[p] === 1 ? 1 : 0);
      if (trial.pointAwards) pointOutcomes[p]!.push(trial.pointAwards[p]!);
    }
    if (trial.suddenDeathCount > 0) ties += 1;
    if (trial.hadHighCardDraw) highCardDraws += 1;
  }
  const ms = Date.now() - t0;
  const winProbability = winOutcomes.map((o) => o.reduce((a, b) => a + b, 0) / n);
  const ci95HalfWidthWin = winOutcomes.map((o) => ci95HalfWidth(o));
  const hasPoints = pointOutcomes[0]!.length > 0;
  const expectedPoints = hasPoints ? pointOutcomes.map((o) => o.reduce((a, b) => a + b, 0) / n) : [];
  const ci95HalfWidthPoints = hasPoints ? pointOutcomes.map((o) => ci95HalfWidth(o)) : undefined;
  return {
    n, winProbability, expectedPoints, survivalProbability: winProbability,
    ci95HalfWidthWin, ci95HalfWidthPoints, tieRate: ties / n, highCardDrawRate: highCardDraws / n, ms,
  };
}
