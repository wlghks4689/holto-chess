import type { Card } from "../core/poker/cards";
import type { HandValue } from "../core/poker/evaluate";
import type { AbilityDraft, AbilityEvent, AbilityId, AbilityTotals } from "./abilities";

/** Five-round games end at R5; six-round games add the R6 final. */
export type Round = 1 | 2 | 3 | 4 | 5 | 6;
export type Phase = "FINAL_AUCTION" | "FINAL_LOADOUT" | "OPPONENT_SELECT" | "ABILITY_DEAL" | "ABILITY_REVEAL" | "DRAFT_ORDER" | "OPEN_DRAFT" | "RUN_LOADOUT" | "SURVIVAL_READY" | "SHOP" | "DECK_SELECT" | "SHOWDOWN_PRIMARY" | "GROUP_ASSIGNMENT" | "SHOWDOWN_SECONDARY" | "ROUND_RESULT" | "NEXT_ROUND" | "GAME_RESULT";
export type OpenDraft = { cardIds: string[]; order: { playerId: string; points: number; stackBB: number }[]; picks: { playerId: string; cardId: string | null; price: number }[];
  /** Six-round R3 buyback: unsold auction cards at this multiple of the base price, never discounted. */
  priceMultiplier?: number };
/** Six-round R5: the standings leader picks an opponent; the other two seats play each other. */
/** cardsAtPairing: every survivor's cards when the pairing was shown (public then); later trades never change it. */
export type OpponentSelect = { order: string[]; chooserId: string; opponentId?: string; cardsAtPairing?: Record<string, string[]> };
export type PoolCardState = "AVAILABLE" | "RESERVED_IN_SHOP" | "OWNED";

export type PoolCard = {
  card: Card;
  state: PoolCardState;
  ownerPlayerId?: string;
  reservedPlayerId?: string;
};

export type PlayerState = {
  finalLoadoutCardIds?: string[];
  finalLoadoutLocked?: boolean;
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
  /** R2/R5 RUN number, or a legacy Omaha game. */
  gameNumber?: 1 | 2 | 3;
};

/** `message` stays for rooms persisted before localization and older clients. */
export type GameLog = { id: number; tone: "info" | "win" | "danger" | "economy"; message: string;
  event?: string; params?: Record<string, string | number>; playerId?: string };

export type PorenaGameState = {
  /** Absent in a saved legacy R5: that round retains its seven-card/no-board rules. */
  finalAuction?: FinalAuctionState;
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
  /** Six-round format (R3 auction, R5 RUN IT THREE TIMES, R6 final). Missing in five-round games. */
  sixRounds?: true;
  opponentSelect?: OpponentSelect;
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

/**
 * Server-only. Projections must explicitly allowlist fields. Five-round games run it as the R5 final
 * auction. Six-round games run it in R3 with their own limits; bidding opens at startedAt, and
 * loadoutStartsAt there marks the end of the result reveal.
 */
export type FinalAuctionState = {
  /** Six-round R3 only; missing means the R5 constants. */
  maxWins?: number; minRaiseBB?: number;
  cardIds: string[]; startedAt: number; endsAt: number; hardEndsAt: number;
  bids: Record<string, { amount: number; playerId: string; sequence: number }>;
  bidSequence: number; settledAt: number | null;
  results: { cardId: string; playerId: string; amount: number }[] | null;
  originalCardIds: Record<string, string[]>;
  loadoutStartsAt?: number; loadoutEndsAt?: number; loadoutsRevealed?: boolean;
  equities?: Record<string, number>;
  botNextAt: Record<string, number>;
  outbid: Record<string, { cardId: string; amount: number; sequence: number }>;
  raises: Record<string, number>;
  poolWarning?: string;
  /** Six-round R3: each seat's 1-20 combination score per auction card, set when the auction opens. */
  cardValues?: Record<string, Record<string, number>>;
};
