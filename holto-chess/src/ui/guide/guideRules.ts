import type { HandCategory } from "../../core/poker/evaluate";
import { ABILITY_IDS, CAPITALISM_INTEREST_PERCENT, PREDATOR_BB_PER_STREAK, PROTECTOR_TIERS, TARGET_SNIPER_WIN_BB, type AbilityId } from "../../game/abilities";
import type { TranslationKey } from "../../i18n";
import { BALANCE, FINAL_ROUND_PLACEMENT_POINTS, FRONT_RUNNER_POINTS, ROUND_POINTS } from "../../game/config";

/**
 * Every number the guide prints. Values come from the game's own constants so a balance change
 * updates the guide; the few values that live as literals inside the engine are mirrored here and
 * pinned by `guideRules.test.ts` against a real engine run.
 */
export const GUIDE_RULES = {
  players: BALANCE.playerCount,
  poolSize: 52,
  startBB: BALANCE.startStackBB,
  roundIncomeBB: BALANCE.roundIncomeBB,
  rerollCostBB: BALANCE.rerollCostBB,
  lockCostBB: BALANCE.cardLockCostBB,
  sellPercent: Math.round(BALANCE.sellRate * 100),
  shopSize: BALANCE.baseShopSize,
  r1ShopSize: BALANCE.r1ShopSize,
  stackScoreUnitBB: BALANCE.stackScoreUnitBB,
  handLimits: BALANCE.handLimits,
  purchaseLimits: BALANCE.purchaseLimits,
  rerollLimits: BALANCE.rerollLimits,
  points: ROUND_POINTS,
  finalPlacement: [1, 2, 3, 4].map((place) => FINAL_ROUND_PLACEMENT_POINTS[place] ?? 0),
  /** Mirrors `finalStandings` in engine.ts; shown beside the result, never added to the final score. */
  rankPoints: [8, 4, 2, 0, -1, -2, -4, -8],
  /** Mirrors `startNextRound`: cards revealed by each open draft. */
  draftCards: { 2: 8, 4: 16 } as const,
  /** BB a regulation loss pays: base + step × losses already taken this round. Wins pay none. */
  matchBB: { r1: BALANCE.matchLossBB[1], r2: BALANCE.matchLossBB[2], r3: BALANCE.matchLossBB[3] },
  /** Mirrors `resolveSurvival` / R4 group deciders: extra boards before a random-rank draw. */
  maxSuddenDeathBoards: 2,
  alive: [8, 8, 6, 4, 4],
  timers: { shop: 60, draftPick: 20, runLoadout: 30 },
} as const;

export const CARD_PRICES = ([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const).map((rank) => ({ rank, price: BALANCE.rankPrices[rank] }));

export const HAND_LADDER: readonly HandCategory[] = ["HIGH_CARD", "PAIR", "TWO_PAIR", "TRIPS", "STRAIGHT", "FLUSH", "FULL_HOUSE", "QUADS", "STRAIGHT_FLUSH", "ROYAL_FLUSH"];
export const HAND_KEY: Record<HandCategory, TranslationKey> = {
  HIGH_CARD: "hand.highCard", PAIR: "hand.pair", TWO_PAIR: "hand.twoPair", TRIPS: "hand.trips", STRAIGHT: "hand.straight", FLUSH: "hand.flush",
  FULL_HOUSE: "hand.fullHouse", QUADS: "hand.quads", STRAIGHT_FLUSH: "hand.straightFlush", ROYAL_FLUSH: "hand.royalFlush",
};
export const handScore = (category: HandCategory) => BALANCE.handScores[category];

/** Ability values the copy quotes. Kept beside the ids so a new ability needs one entry here and one copy entry per locale. */
export const ABILITY_NUMBERS: Record<AbilityId, Record<string, number>> = {
  "royal-blood": { discountPercent: 50 },
  "target-sniper": { bb: TARGET_SNIPER_WIN_BB },
  underdog: { points: 20 },
  "first-class": {},
  "golden-hand": { extraShop: 1, refundPercent: 100 },
  trader: { extraRerolls: 1 },
  predator: { bbPerStreak: PREDATOR_BB_PER_STREAK, fromStreak: 2 },
  architect: { bb: 30 },
  capitalism: { percent: CAPITALISM_INTEREST_PERCENT },
  // Protector tiers, lowest first: equity60/bb60, equity70/bb70, equity80/bb80.
  "zero-risk": Object.fromEntries([...PROTECTOR_TIERS].reverse().flatMap((tier) => [[`equity${tier.minPercent}`, tier.minPercent], [`bb${tier.minPercent}`, tier.bb]])),
  "quad-core": { multiplier: 2 },
  "front-runner": Object.fromEntries(([1, 2, 3, 4, 5] as const).map((round) => [`r${round}`, FRONT_RUNNER_POINTS[round]])),
};

export const GUIDE_ABILITIES: readonly AbilityId[] = ABILITY_IDS;
/** The ability draft deals the whole catalog face down, so the card count follows the id list. */
export const ABILITY_DECK_SIZE = ABILITY_IDS.length;
export const abilityThumb = (ability: AbilityId) => `/assets/abilities/guide/${ability}.webp`;
