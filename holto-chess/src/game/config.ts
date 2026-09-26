import type { HandCategory } from "../core/poker/evaluate";
import type { Round } from "./types";

export const FINAL_ROUND_PLACEMENT_POINTS: Readonly<Record<number, number>> = { 1: 20, 2: 12, 3: 5, 4: 3 };

/** Every round-point award lives here so engine and UI never carry competing constants. */
export const ROUND_POINTS = {
  r1: { win: 3, split: 1 },
  r2Run: { win: 4, split: 2 },
  r2Primary: { win: 6, suddenDeathBonus: 0 },
  r2WinnerBracket: { win: 3 },
  r2LoserBracket: { survive: 2 },
  r3: { gameWin: 4, gameSplit: 2 },
  r4Primary: { win: 6, split: 3, groupDeciderBonus: 0 },
  r4WinnerGroup: { first: 10, second: 5, tiedSecond: 3, third: 3, tiebreakBonus: 0 },
  r4LoserGroup: { survive: 0, tiebreakBonus: 0 },
} as const;

export const BALANCE = {
  rerollLimits: { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3 },
  playerCount: 8,
  startStackBB: 50,
  baseShopSize: 2,
  maxShopSize: 2,
  rerollCostBB: 5,
  cardLockCostBB: 3,
  roundIncomeBB: 30,
  winRewardBB: 20,
  winStreakStepBB: 5,
  loseStreakStepBB: 10,
  purchaseLimits: { 1: 2, 2: 2, 3: 2, 4: 3, 5: 3 },
  sellRate: 0.6,
  stackScoreUnitBB: 10,
  handLimits: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 7 },
  rankPrices: { 14: 20, 13: 18, 12: 15, 11: 12, 10: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 },
  points: ROUND_POINTS,
  handScores: { HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 5, STRAIGHT: 8, FLUSH: 12, FULL_HOUSE: 15, QUADS: 20, STRAIGHT_FLUSH: 30, ROYAL_FLUSH: 40 } satisfies Record<HandCategory, number>,
} as const;

export function cardPrice(rank: number): number {
  return BALANCE.rankPrices[rank as keyof typeof BALANCE.rankPrices] ?? 5;
}

export function regularShopSizeFor(round: Round): number { return round === 2 ? 0 : BALANCE.baseShopSize; }
export function purchaseLimitFor(round: Round, rulesVersion: number = 2): number { return round === 4 && rulesVersion === 1 ? 3 : BALANCE.purchaseLimits[round]; }
export function rerollLimitFor(round: Round, rulesVersion: number = 2): number { return round === 4 && rulesVersion === 1 ? 2 : BALANCE.rerollLimits[round]; }
