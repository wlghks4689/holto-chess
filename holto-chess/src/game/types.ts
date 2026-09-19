import type { Card, Suit } from "../core/poker/cards";
import type { HandCategory, HandValue } from "../core/poker/evaluate";

export type Round = 1 | 2 | 3 | 4 | 5;
export type Phase = "SHOP" | "DECK_SELECT" | "SHOWDOWN_PRIMARY" | "GROUP_ASSIGNMENT" | "SHOWDOWN_SECONDARY" | "ROUND_RESULT" | "AUGMENT" | "NEXT_ROUND" | "GAME_RESULT";
export type PoolCardState = "AVAILABLE" | "RESERVED_IN_SHOP" | "OWNED";

export type PoolCard = {
  card: Card;
  state: PoolCardState;
  ownerPlayerId?: string;
  reservedPlayerId?: string;
};

export type AugmentId = "suit_discount" | "reroll_discount" | "sell_bonus" | "win_bonus" | "pair_points" | "shop_plus_one" | "shop_plus_two" | "rank_discount" | "r5_hand_bonus";
export type Augment = { id: AugmentId; name: string; description: string; suit?: Suit; category?: HandCategory };

export type PlayerState = {
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
  augments: Augment[];
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
export type MatchResult = {
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

export type GameLog = { id: number; tone: "info" | "win" | "danger" | "economy"; message: string };

export type PorenaGameState = {
  round: Round;
  phase: Phase;
  players: PlayerState[];
  ownershipCardPool: PoolCard[];
  matches: MatchResult[];
  winnerGroup: string[];
  loserGroup: string[];
  roundResults: MatchResult[];
  augmentChoices: Augment[];
  encounterSequence: number;
  seed: number;
  randomMode: "seeded" | "secure";
  logSequence: number;
  logs: GameLog[];
};
