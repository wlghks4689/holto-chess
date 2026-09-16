import type { HandCategory } from "../../src/core/poker/evaluate";
import type { Round } from "../../src/game/types";

export const POLICY_NAMES = ["HIGH_RANK", "PAIR_BUILDER", "STRAIGHT_BUILDER", "FLUSH_BUILDER", "ECONOMY"] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];
export type PolicyAssignment = "fixed" | "random";
export type ReportHandCategory = HandCategory | "ROYAL_FLUSH";

export type SimulationConfig = {
  simulationCount: number;
  baseSeed: number;
  policies: PolicyName[];
  assignment: PolicyAssignment;
  outputPath: string;
  verbose: boolean;
  maxRerollsPerPlayerRound: number;
};

export type EconomyCounter = {
  purchases: number;
  sales: number;
  rerolls: number;
  purchaseSpend: number;
  rerollSpend: number;
};

export type PoolSnapshot = {
  round: Round;
  available: number;
  reserved: number;
  owned: number;
  shopFillFailures: number;
};

export type RoundSnapshot = {
  round: Round;
  entered: number;
  survived: number;
  stacks: number[];
};

export type TournamentCounter = {
  r2PrimaryWins: number;
  r2WinnerBracketWins: number;
  r2LoserBracketSurvivals: number;
  r2Eliminations: number;
  r4PrimaryWins: number;
  r4WinnerThreeWayFirsts: number;
  r4LoserThreeWaySurvivals: number;
  r4Eliminations: number;
};

export type PlayerTrace = {
  playerId: string;
  policy: PolicyName;
  economy: EconomyCounter;
  roundEconomy: Record<Round, EconomyCounter>;
  finalBB: number;
  finalRank: number;
  finalScore: number;
  roundPoints: number;
  handScore: number;
  stackScore: number;
  reachedR5: boolean;
  won: boolean;
  tournament: TournamentCounter;
};

export type RankCounter = {
  appearances: number;
  purchases: number;
  sales: number;
  finalOwned: number;
};

export type GameTrace = {
  seed: number;
  actionCount: number;
  players: PlayerTrace[];
  rounds: RoundSnapshot[];
  poolSnapshots: PoolSnapshot[];
  rankCounters: Record<string, RankCounter>;
  handCounts: Record<Round, Partial<Record<ReportHandCategory, number>>>;
  availableZeroEvents: number;
  rerollShortageEvents: number;
  repeatedRerollGroups: number;
  strategyCandidateMissing: Record<PolicyName, number>;
};

export type FailureRecord = { gameIndex: number; seed: number; message: string; stack?: string };

export type NumericSummary = { average: number; median: number; min: number; max: number };
export type RoundReport = {
  entered: number;
  survived: number;
  bb: NumericSummary;
  pool: {
    averageAvailable: number;
    minimumAvailable: number;
    averageReserved: number;
    averageOwned: number;
    availableZeroEvents: number;
    shopFillFailures: number;
  };
  economy: EconomyCounter;
  hands: Record<ReportHandCategory, { count: number; percentage: number }>;
};

export type PolicyReport = {
  entries: number;
  r5Rate: number;
  winRate: number;
  averageFinalRank: number;
  averageBB: number;
  averageFinalScore: number;
  economy: EconomyCounter;
  tournament: TournamentCounter;
  strategyCandidateMissing: number;
};

export type PlayerSlotReport = {
  games: number;
  policyMix: Partial<Record<PolicyName, number>>;
  averageFinalRank: number;
  averageEndingBB: number;
  economy: EconomyCounter;
};

export type SimulationResult = {
  config: Omit<SimulationConfig, "outputPath" | "verbose">;
  games: { requested: number; completed: number; failed: number; averageActions: number };
  rounds: Record<Round, RoundReport>;
  economy: EconomyCounter & {
    averagePurchasesPerPlayer: number;
    averageSalesPerPlayer: number;
    averageRerollsPerPlayer: number;
    averageEndingBB: number;
    purchaseSpendRatio: number;
    rerollSpendRatio: number;
  };
  ranks: Record<string, RankCounter & { purchaseRate: number }>;
  players: Record<string, PlayerSlotReport>;
  policies: Record<PolicyName, PolicyReport>;
  score: {
    averageFinalScore: number;
    averageRoundPoints: number;
    averageHandScore: number;
    averageStackScore: number;
  };
  depletion: {
    availableZeroEvents: number;
    shopFillFailures: number;
    rerollShortageEvents: number;
    repeatedRerollGroups: number;
  };
  failures: FailureRecord[];
  limitations: string[];
};

export const emptyEconomy = (): EconomyCounter => ({ purchases: 0, sales: 0, rerolls: 0, purchaseSpend: 0, rerollSpend: 0 });
export const emptyTournament = (): TournamentCounter => ({
  r2PrimaryWins: 0, r2WinnerBracketWins: 0, r2LoserBracketSurvivals: 0, r2Eliminations: 0,
  r4PrimaryWins: 0, r4WinnerThreeWayFirsts: 0, r4LoserThreeWaySurvivals: 0, r4Eliminations: 0,
});
