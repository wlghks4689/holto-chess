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
  shopLocked: boolean;
  lockedShopCardIds?: string[];
  augments: Augment[];
  points: number;
  winStreak: number;
  loseStreak: number;
  eliminated: boolean;
  eliminatedRound?: Round;
};

export type PlayerShowdown = { playerId: string; hand: HandValue; place: number; usedCardIds: string[] };
export type MatchResult = {
  id: string;
  stage: "primary" | "secondary" | "final";
  playerIds: string[];
  winnerIds: string[];
  boards: Card[][];
  boardResults: PlayerShowdown[][];
  boardWinnerIds: string[][];
  runoutCount: number;
  results: PlayerShowdown[];
  suddenDeathCount: number;
  revealedCardIds: Record<string, string[]>;
};

export type GameLog = { id: number; tone: "info" | "win" | "danger" | "economy"; message: string };

export type HoltoChessGameState = {
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
