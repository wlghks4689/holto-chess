import type { HandCategory } from "../core/poker/evaluate";
import type { Round } from "./types";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";

export const FINAL_AUCTION_DURATION_MS = 40_000;
export const FINAL_AUCTION_HARD_CAP_MS = 55_000;
export const FINAL_AUCTION_SNIPE_WINDOW_MS = 3_000;
export const FINAL_AUCTION_MIN_RAISE_BB = 5;
export const FINAL_AUCTION_MAX_WINS = 2;
export const AUCTION_REVEAL_MS = 3_000;
export const FINAL_LOADOUT_SIZE = 5;
export const FINAL_LOADOUT_TIMEOUT_MS = BARRIER_TIMEOUT_MS.DEFAULT;
export const FINAL_EQUITY_SAMPLES = 240;
export const FINAL_BOT_REACTION_MS = { min: 900, max: 2_200 } as const;

export const FINAL_ROUND_PLACEMENT_POINTS: Readonly<Record<number, number>> = { 1: 20, 2: 12, 3: 5, 4: 3 };
export const FRONT_RUNNER_POINTS: Readonly<Record<Round, number>> = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 };

/** Every round-point award lives here so engine and UI never carry competing constants. */
export const ROUND_POINTS = {
  r1: { win: 3, split: 1 },
  /** R2 plays two matches against different opponents, two RUNs each; winning both RUNs of a match adds the sweep bonus. */
  r2Run: { win: 2, split: 1, sweepBonus: 2 },
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
  /** R1 starts with an empty hand, so its shop shows more cards than the two a seat may buy. */
  r1ShopSize: 4,
  rerollCostBB: 5,
  cardLockCostBB: 3,
  roundIncomeBB: 30,
  /**
   * Match BB goes to the loser only: base + step × losses already taken this round. Wins, splits and
   * forfeits pay nothing; a win already pays in points. R2, R4 and R5 pay no match BB.
   */
  matchLossBB: { 1: { base: 10, step: 5 }, 2: { base: 0, step: 0 }, 3: { base: 10, step: 5 }, 4: { base: 0, step: 0 }, 5: { base: 0, step: 0 } },
  purchaseLimits: { 1: 2, 2: 2, 3: 2, 4: 3, 5: 3 },
  sellRate: 0.6,
  stackScoreUnitBB: 10,
  handLimits: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 7 },
  rankPrices: { 14: 20, 13: 18, 12: 15, 11: 12, 10: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 },
  points: ROUND_POINTS,
  handScores: { HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 5, STRAIGHT: 8, FLUSH: 12, FULL_HOUSE: 15, QUADS: 20, STRAIGHT_FLUSH: 35, ROYAL_FLUSH: 50 } satisfies Record<HandCategory, number>,
} as const;

export function cardPrice(rank: number): number {
  return BALANCE.rankPrices[rank as keyof typeof BALANCE.rankPrices] ?? 5;
}

export function regularShopSizeFor(round: Round): number { return round === 1 ? BALANCE.r1ShopSize : round === 2 ? 0 : BALANCE.baseShopSize; }
/** BB a regulation loss pays in this round, given the losses this seat already took in it. */
export function matchLossBB(round: Round, lossesThisRound: number): number { const rule = BALANCE.matchLossBB[round]; return rule.base + rule.step * lossesThisRound; }
export function purchaseLimitFor(round: Round, rulesVersion: number = 2): number { return round === 4 && rulesVersion === 1 ? 3 : BALANCE.purchaseLimits[round]; }
export function rerollLimitFor(round: Round, rulesVersion: number = 2): number { return round === 4 && rulesVersion === 1 ? 2 : BALANCE.rerollLimits[round]; }
