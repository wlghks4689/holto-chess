import type { HandCategory } from "../core/poker/evaluate";

export const BALANCE = {
  playerCount: 8,
  startStackBB: 50,
  baseShopSize: 3,
  maxShopSize: 5,
  rerollCostBB: 5,
  roundIncomeBB: 30,
  winRewardBB: 20,
  winStreakStepBB: 5,
  loseStreakStepBB: 10,
  maxPurchasesPerRound: 2,
  sellRate: 0.6,
  stackScoreUnitBB: 10,
  handLimits: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 7 },
  rankPrices: { 14: 20, 13: 18, 12: 15, 11: 12, 10: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 5, 3: 5, 2: 5 },
  points: { r1Win: 1, r2PrimaryWin: 1, r2WinnerBracketWin: 2, r3Win: 2, r4PrimaryWin: 2, r4WinnerGroupFirst: 3 },
  handScores: { HIGH_CARD: 0, PAIR: 2, TWO_PAIR: 4, TRIPS: 7, STRAIGHT: 10, FLUSH: 12, FULL_HOUSE: 16, QUADS: 22, STRAIGHT_FLUSH: 30 } satisfies Record<HandCategory, number>,
} as const;

export function cardPrice(rank: number): number {
  return BALANCE.rankPrices[rank as keyof typeof BALANCE.rankPrices] ?? 5;
}
