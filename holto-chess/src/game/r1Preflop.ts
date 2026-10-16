import { rankToChar, type Card } from '../core/poker/cards';
import { BALANCE } from './config';
import { CAPITALISM_INTEREST_PERCENT, TARGET_SNIPER_WIN_BB, predatorStreakReward } from './abilities';
import { R1_PREFLOP_STATS, type R1PreflopStats } from './r1PreflopData';
import { PREFLOP_POWER_ORDER } from './preflopRankData';
import type { PlayerState } from './types';

export function r1HandKey(cards: readonly Card[]): string {
  if (cards.length !== 2 || cards[0]!.id === cards[1]!.id) throw new Error('R1 needs two distinct cards');
  const [high, low] = [...cards].sort((a, b) => b.rank - a.rank);
  const key = rankToChar(high!.rank) + rankToChar(low!.rank)
    + (high!.rank === low!.rank ? '' : high!.suit === low!.suit ? 's' : 'o');
  return key;
}

/** 1 (AA) to 169 (72o): the hand's place among all starting hands. */
export function r1PowerRank(cards: readonly Card[]): number {
  return PREFLOP_POWER_ORDER.indexOf(r1HandKey(cards)) + 1;
}

export function r1PreflopStats(cards: readonly Card[]): R1PreflopStats {
  return R1_PREFLOP_STATS[r1HandKey(cards)]!;
}

export function r1ExpectedHandScore(stats: R1PreflopStats): number {
  const scores = [BALANCE.handScores.HIGH_CARD, BALANCE.handScores.PAIR, BALANCE.handScores.TWO_PAIR,
    BALANCE.handScores.TRIPS, BALANCE.handScores.STRAIGHT, BALANCE.handScores.FLUSH,
    BALANCE.handScores.FULL_HOUSE, BALANCE.handScores.QUADS, BALANCE.handScores.STRAIGHT_FLUSH, BALANCE.handScores.ROYAL_FLUSH];
  return stats.categories.reduce((sum, probability, index) => sum + probability * scores[index]!, 0);
}

/** Stage one: bounded R1 rewards, using only this seat's known cards and public ability rules. */
export function r1AbilityValue(cards: readonly Card[], stackAfter: number, stats: R1PreflopStats,
  player?: Pick<PlayerState, 'abilityId' | 'firstCardId' | 'winStreak'>): number {
  const cashValue = .035;
  switch (player?.abilityId) {
    case 'architect': return stats.categories[6]! * 30 * 3 * cashValue;
    case 'target-sniper': {
      const first = cards.find(card => card.id === player.firstCardId);
      if (!first) return 0;
      const [high, low] = [...cards].sort((a, b) => b.rank - a.rank);
      const qualifyingWin = high!.rank === low!.rank ? (stats.winWithHigh + stats.winWithLow) / 2
        : first.id === high!.id ? stats.winWithHigh : stats.winWithLow;
      return qualifyingWin * TARGET_SNIPER_WIN_BB * 3 * cashValue;
    }
    case 'capitalism': return Math.max(0, stackAfter) * CAPITALISM_INTEREST_PERCENT / 100 * cashValue;
    case 'predator': {
      // Three R1 matches; streak expectation resets on every non-win.
      let paths = new Map<number, number>([[player.winStreak, 1]]), reward = 0;
      for (let match = 0; match < 3; match++) {
        const next = new Map<number, number>();
        for (const [streak, chance] of paths) {
          reward += chance * stats.win * predatorStreakReward(streak + 1);
          next.set(streak + 1, (next.get(streak + 1) ?? 0) + chance * stats.win);
          next.set(0, (next.get(0) ?? 0) + chance * (1 - stats.win));
        }
        paths = next;
      }
      return reward * cashValue;
    }
    default: return 0;
  }
}
