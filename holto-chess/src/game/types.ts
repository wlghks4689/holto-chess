import type { Card } from "../core/poker/cards";
import type { HandValue } from "../core/poker/evaluate";
import type { AbilityDraft, AbilityEvent, AbilityId, AbilityTotals } from "./abilities";

export type Round = 1 | 2 | 3 | 4 | 5;
export type Phase = "ABILITY_ORDER" | "ABILITY_PICK" | "ABILITY_REVEAL" | "DRAFT_ORDER" | "OPEN_DRAFT" | "RUN_LOADOUT" | "SURVIVAL_READY" | "SHOP" | "DECK_SELECT" | "SHOWDOWN_PRIMARY" | "GROUP_ASSIGNMENT" | "SHOWDOWN_SECONDARY" | "ROUND_RESULT" | "NEXT_ROUND" | "GAME_RESULT";
export type OpenDraft = { cardIds: string[]; order: { playerId: string; points: number; stackBB: number }[]; picks: { playerId: string; cardId: string | null; price: number }[] };
export type PoolCardState = "AVAILABLE" | "RESERVED_IN_SHOP" | "OWNED";

export type PoolCard = {
  card: Card;
  state: PoolCardState;
  ownerPlayerId?: string;
  reservedPlayerId?: string;
};

export type PlayerState = {
  abilityId?: AbilityId;
  firstCardId?: string;
  abilityWinStreak?: number;
  abilityTotals?: AbilityTotals;
  id: string;
  name: string;
  stackBB: number;
  ownedCardIds: string[];
  shopCardIds: string[];
  selectedCardIds: string[];
  shopSize: number;
  purchasesThisRound: number;
  rerollsUsed?: number; // Missing only in older persisted snapshots; interpreted as zero.
  shopLocked: boolean;
  lockedShopCardIds?: string[];
  points: number;
  winStreak: number;
  loseStreak: number;
  eliminated: boolean;
  eliminatedRound?: Round;
  eliminationSnapshot?: {
    round: Round;
    stackBB: number;
    points: number;
    hand: HandValue;
  };
};

export type PlayerShowdown = { playerId: string; hand: HandValue; place: number; usedCardIds: string[] };
export type ShowdownStreet = "PRE_FLOP" | "FLOP" | "TURN" | "RIVER";
export type StreetSnapshot = { street: ShowdownStreet; results: PlayerShowdown[] };
export type MatchReward = {
  playerId: string;
  beforeBB: number; afterBB: number; deltaBB: number;
  beforePoints: number; afterPoints: number; deltaPoints: number;
  outcome: "WINNER_GROUP" | "LOSER_GROUP" | "SURVIVED" | "ELIMINATED" | "FINAL";
  detail?: string;
};
export type TiebreakKind = "GROUP_DECIDER" | "WINNER_TIEBREAK" | "SURVIVAL_TIEBREAK";
export type HighCardDraw = { draws: { playerId: string; rank: number }[]; winnerId: string; survivorIds?: string[]; surviveCount?: number };
export type MatchResult = {
  equities?: Record<string, { rawPercent: number; insuranceEligible: boolean }>;
  runCards?: Record<string, string[][]>;
  runRewards?: MatchReward[][];
  standingsBefore?: Record<string, number>;
  standingsAfterRuns?: Record<string, number>[];
  matchday?: number;
  swissBefore?: Record<string, import("./swiss").SwissRecord>;
  swissAfter?: Record<string, import("./swiss").SwissRecord>;
  id: string;
  stage: "primary" | "secondary" | "final";
  playerIds: string[];
  winnerIds: string[];
  boards: Card[][];
  boardResults: PlayerShowdown[][];
  streetSnapshots?: StreetSnapshot[][];
  boardWinnerIds: string[][];
  runoutCount: number;
  results: PlayerShowdown[];
  suddenDeathCount: number;
  highCardDraw?: HighCardDraw;
  tiebreakKind?: TiebreakKind;
  tiebreakStartIndex?: number;
  regulationWinnerIds?: string[];
  pointAwards?: Record<string, number>;
  pointAwardDetails?: Record<string, string>;
  revealedCardIds: Record<string, string[]>;
  // Optional for persisted v1 games created before cinematic snapshots existed.
  rewards?: MatchReward[];
  group?: "winner" | "loser";
  gameNumber?: 1 | 2;
};

/** `message` stays for rooms persisted before localization and older clients. */
export type GameLog = { id: number; tone: "info" | "win" | "danger" | "economy"; message: string;
  event?: string; params?: Record<string, string | number>; playerId?: string };

export type PorenaGameState = {
  abilityDraft?: AbilityDraft;
  abilityEvents?: AbilityEvent[];
  abilityEventSequence?: number;
  abilityInterestRounds?: Round[];
  /** Persists even when no front-runner qualifies, so retries cannot re-rank. */
  abilityLeaderRounds?: Round[];
  /** Frozen when a showdown prep phase begins so the VS preview and resolution use the same seats. */
  primaryOrderIds?: string[];
  primaryPairings?: string[][];
  r3Seeds?: string[];
  /** Missing in persisted pre-draft games: keep their original rules. */
  rulesVersion?: 1 | 2;
  draft?: OpenDraft;
  survival?: { playerIds: string[]; eliminateCount: number };
  round: Round;
  phase: Phase;
  players: PlayerState[];
  ownershipCardPool: PoolCard[];
  matches: MatchResult[];
  winnerGroup: string[];
  loserGroup: string[];
  roundResults: MatchResult[];
  encounterSequence: number;
  seed: number;
  randomMode: "seeded" | "secure";
  logSequence: number;
  logs: GameLog[];
};
