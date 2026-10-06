import type { HandCategory } from "../../src/core/poker/evaluate";

export const POLICY_NAMES = ["ENGINE_BOT", "HIGH_RANK", "PAIR_BUILDER", "STRAIGHT_BUILDER", "FLUSH_BUILDER", "ECONOMY", "RANDOM", "ABILITY_NEUTRAL", "ABILITY_AWARE"] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];

export type SimConfig = {
  games: number;
  seed: number;
  policies: PolicyName[];
  /** How policies are dealt to the 8 seats. `rotate` shifts the deal every game so no policy owns a seat. */
  assignment: "rotate" | "fixed" | "random";
  maxRerolls: number;
  /** Runtime overrides of `BALANCE` / `FINAL_ROUND_PLACEMENT_POINTS`, applied only while the run executes. */
  overrides: Record<string, number>;
  outputPath: string;
  writeRows: boolean;
  verbose: boolean;
};

export const ROUNDS = [1, 2, 3, 4, 5] as const;
/** Survivors each round must leave; anything else is an engine/simulator disagreement. */
export const EXPECTED_ALIVE_AFTER: Record<number, number> = { 1: 8, 2: 8, 3: 6, 4: 4, 5: 4 };

export type RoundRow = {
  round: number;
  entered: boolean;
  /** Points / BB at round start (after income), just before the showdown, and after the round resolved. */
  startPoints: number; startBB: number; preShowdownBB: number; endPoints: number; endBB: number;
  ownedCount: number;
  buys: { rank: number; price: number; via: "shop" | "draft" }[];
  sells: { rank: number }[];
  rerolls: number;
};

export type PlayerRow = {
  game: number; seed: number; playerId: string; seat: number; policy: PolicyName;
  r1: { w: number; d: number; l: number } | null;
  /** Competition rank by Points after R1 (1 = best; ties share). */
  r1Rank: number;
  /** 1-based position in the R2 / R4 open draft pick order, null when the round was not reached. */
  draftOrder: { r2: number | null; r4: number | null };
  rounds: RoundRow[];
  eliminatedRound: number | null;
  placement: number; rankPoints: number;
  points: number; handScore: number; stackScore: number; total: number;
  finalHand: HandCategory | null; finalBB: number;
  finalRanks: number[];
};

export type MatchRoundStats = {
  round: number; matches: number; splits: number; suddenDeaths: number; highCardDraws: number; forfeits: number;
  categories: Partial<Record<HandCategory, number>>;
};

export type GameRow = {
  auction?: { overtime: boolean; raises: number; tied: boolean; icm: boolean; reversal: boolean;
    seats: { playerId: string; entryBB: number; endBB: number; spent: number; wins: number; blocks: number; handScore: number; total: number; handGain: number }[];
    prices: { rank: number; amount: number; raises: number }[] };
  game: number; seed: number; ok: boolean; error?: string; failedAt?: string;
  aliveAfter: number[]; matchStats: MatchRoundStats[]; ms: number;
};

export type GameOutcome = { game: GameRow; players: PlayerRow[] };
