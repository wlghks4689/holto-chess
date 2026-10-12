import { describe, expect, it } from 'vitest';
import { makeDeck, type Card } from '../core/poker/cards';
import { abilityPrice, abilityRerollLimit } from './abilities';
import { assertPoolIntegrity } from './cardPool';
import { purchaseLimitFor } from './config';
import { createGame, getCard, prepareShowdown, rerollShop } from './engine';
import { rankBotPairs, scoreBotPlan, shouldBotReroll } from './botStrategy';
import { R1_PREFLOP_STATS } from './r1PreflopData';
import { r1PreflopStats } from './r1Preflop';
import { planR1Shop } from './r1ShopStrategy';
import type { PlayerState, Round } from './types';

const deck = makeDeck();
const cards = (ids: string[]) => ids.map(id => deck.find(card => card.id === id)!);
const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({ ...createGame(1).players[1]!, ...overrides });
const rules = { rulesVersion: 2, sixRounds: true } as const;

function fixture(ids: string[], overrides: Partial<PlayerState> = {}) {
  const state = createGame(910025);
  for (const entry of state.ownershipCardPool) { entry.state = 'AVAILABLE'; delete entry.reservedPlayerId; delete entry.ownerPlayerId; }
  for (const p of state.players) { p.shopCardIds = []; p.ownedCardIds = []; }
  const bot = state.players[1]!;
  Object.assign(bot, overrides); bot.shopCardIds = ids;
  for (const id of bot.ownedCardIds) { const entry = state.ownershipCardPool.find(e => e.card.id === id)!; entry.state = 'OWNED'; entry.ownerPlayerId = bot.id; }
  for (const id of ids) { const entry = state.ownershipCardPool.find(e => e.card.id === id)!; entry.state = 'RESERVED_IN_SHOP'; entry.reservedPlayerId = bot.id; }
  for (const human of state.players.filter(p => p !== bot)) {
    for (const entry of state.ownershipCardPool.filter(e => e.state === 'AVAILABLE').slice(0, 2)) {
      entry.state = 'OWNED'; entry.ownerPlayerId = human.id; human.ownedCardIds.push(entry.card.id);
    }
  }
  assertPoolIntegrity(state);
  return state;
}
const prepare = (state: ReturnType<typeof fixture>) => prepareShowdown(state, state.players.filter(p => p.id !== 'p2').map(p => p.id));

describe('stable R1 hand evaluation', () => {
  it('covers all 169 legal classes with normalized outcomes and plausible premium equity', () => {
    expect(Object.keys(R1_PREFLOP_STATS)).toHaveLength(169);
    for (const stat of Object.values(R1_PREFLOP_STATS)) {
      expect(stat.categories.reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1, 4);
      expect(stat.win).toBeLessThanOrEqual(stat.equity);
      expect(stat.winWithHigh).toBeLessThanOrEqual(stat.win);
      expect(stat.winWithLow).toBeLessThanOrEqual(stat.win);
    }
    expect(R1_PREFLOP_STATS.AA!.equity).toBeGreaterThan(.84);
    expect(R1_PREFLOP_STATS['62o']!.equity).toBeLessThan(.4);
  });

  it('is invariant to seed, player seat, card order and suit renaming', () => {
    const a = scoreBotPlan(1, cards(['6c', '6d']), 38, 'p2:seed1');
    const b = scoreBotPlan(1, cards(['6s', '6h']).reverse(), 38, 'p8:seed2');
    expect(a).toEqual(b);
    expect(a.equity).toBeGreaterThan(.62);
  });

  it('chooses 66 over 62s and QTo over 42s in the reported regressions', () => {
    for (const [shop, expected] of [
      [['5c', '2d', '3h', '6c', '6d'], ['6c', '6d']],
      [['Th', '2c', '4d', '2d', 'Qc'], ['Th', 'Qc']],
    ]) {
      const ranked = rankBotPairs(1, player({ abilityId: 'golden-hand' }), [], cards(shop!).map(card => ({ card, price: abilityPrice(player(), card.rank) })), rules);
      expect(new Set(ranked[0]!.cards.map(c => c.card.id))).toEqual(new Set(expected));
    }
  });
});

describe('R1 purchase versus reroll expectation', () => {
  it.each(['golden-hand', 'trader', undefined] as const)('keeps 88+ without spending an optional reroll (%s)', abilityId => {
    for (const rank of ['8', 'T', 'A']) {
      const shop = cards([`${rank}c`, `${rank}d`, '2h', '3s']);
      const decision = planR1Shop(player({ abilityId, rerollsUsed: abilityId === 'trader' ? 1 : 0 }), [], shop, rules);
      expect(decision.reroll).toBe(false);
      expect(decision.buyCards.map(c => c.rank)).toEqual([shop[0]!.rank, shop[0]!.rank]);
    }
  });

  it('rerolls a cheap weak hand instead of treating sub-10BB as a reason to stop', () => {
    const decision = planR1Shop(player(), [], cards(['2c', '3d', '4h', '5s']), rules);
    expect(decision.reroll).toBe(true);
    expect(decision.expectedUtility).toBeGreaterThan(decision.currentUtility);
  });

  it('preserves a queen and buys the best remaining partner when rerolls are exhausted', () => {
    const bot = player();
    expect(planR1Shop(bot, [], cards(['Qc', '2d', '3h', '7s']), rules).lockCardIds).toEqual(['Qc']);
    const after = planR1Shop({ ...bot, stackBB: 42, rerollsUsed: 1, lockedShopCardIds: ['Qc'] }, [], cards(['Qc', '2d', '7h', '3s']), rules);
    expect(after.reroll).toBe(false);
    expect(new Set(after.buyCards.map(c => c.id))).toEqual(new Set(['Qc', '7h']));
  });

  it('can spend a second free reroll when useful, but keeps a good pair after the first', () => {
    const trader = player({ abilityId: 'trader', rerollsUsed: 1 });
    expect(abilityRerollLimit(trader, 1, rules)).toBe(2);
    expect(planR1Shop(trader, [], cards(['2c', '3d', '4h', '5s']), rules).reroll).toBe(true);
    expect(planR1Shop(trader, [], cards(['8c', '8d', '4h', '5s']), rules).reroll).toBe(false);
  });

  it('protects purchase funds and does not pay to lock an already locked card', () => {
    expect(planR1Shop(player({ stackBB: 8 }), [], cards(['2c', '3d', '4h', '5s']), rules).reroll).toBe(false);
    const decision = planR1Shop(player({ lockedShopCardIds: ['Qc'] }), [], cards(['Qc', '2d', '3h', '7s']), rules);
    expect(decision.reroll).toBe(true);
    expect(decision.lockCardIds).not.toContain('Qc');
  });

  it('uses the free starting card without buying too many cards', () => {
    const bot = player({ abilityId: 'royal-blood', ownedCardIds: ['Ac'], rerollsUsed: 1 });
    const decision = planR1Shop(bot, cards(['Ac']), cards(['Ad', 'Qc', '2d', '3s']), rules);
    expect(decision.buyCards.map(c => c.id)).toEqual(['Ad']);
  });
});

describe('engine integration and purchase budget', () => {
  it('locks before rerolling, preserves the card, pays costs and maintains pool integrity', () => {
    const state = fixture(['Qc', '2d', '3h', '7s']);
    const after = prepare(state); const bot = after.players[1]!;
    expect(bot.rerollsUsed).toBe(1);
    expect(bot.ownedCardIds).toContain('Qc');
    const purchaseCost = bot.ownedCardIds.map(id => abilityPrice(bot, getCard(after, id).rank)).reduce((sum, n) => sum + n, 0);
    expect(bot.stackBB).toBe(50 - 3 - 5 - purchaseCost);
    expect(bot.purchasesThisRound).toBe(2);
    expect(assertPoolIntegrity(after)).toBe(true);
    expect(state.players[1]!.stackBB).toBe(50);
  });

  it('keeps offered 88 in the real engine, including free rerolls', () => {
    const after = prepare(fixture(['8c', '8d', '2h', '3s'], { abilityId: 'trader' }));
    expect(new Set(after.players[1]!.ownedCardIds)).toEqual(new Set(['8c', '8d']));
    expect(after.players[1]!.rerollsUsed).toBe(0);
  });

  it.each([1, 3, 4, 5, 6] as Round[])('rejects human and AI rerolls after the R%s purchase cap', round => {
    const state = createGame(20); state.round = round;
    const limit = purchaseLimitFor(round, state);
    const bot = state.players[1]!; bot.purchasesThisRound = limit;
    expect(() => rerollShop(state, bot.id)).toThrow(/구매 횟수/);
    expect(shouldBotReroll(round, bot, undefined, 0, state)).toBe(false);
    if (round === 1) {
      expect(planR1Shop(bot, [], bot.shopCardIds.map(id => getCard(state, id)), state).reroll).toBe(false);
      const after = prepareShowdown(state, [], () => ({ type: 'REROLL' }));
      expect(after.players[1]!.rerollsUsed).toBe(0);
      expect(after.players[1]!.stackBB).toBe(50);
    }
  });

  it('counts the sniper reward when comparing a spare-purchase upgrade', () => {
    const after = prepare(fixture(['As', 'Kd', '2c', '3d'], {
      ownedCardIds: ['Td'], abilityId: 'target-sniper', firstCardId: 'Td', rerollsUsed: 1,
    }));
    expect(new Set(after.players[1]!.ownedCardIds)).toEqual(new Set(['Td', 'As']));
    expect(after.players[1]!.purchasesThisRound).toBe(1);
    expect(assertPoolIntegrity(after)).toBe(true);
  });

  it.each(['Qc', 'Kc'])('compares reroll EV against current exchanges before spending the spare purchase (%s)', high => {
    const state = fixture(['2h', '3h', '3d', '2s'], {
      ownedCardIds: [high, '2d'], abilityId: 'target-sniper', firstCardId: '2d', purchasesThisRound: 1,
    });
    const bot = state.players[1]!;
    expect(planR1Shop(bot, bot.ownedCardIds.map(id => getCard(state, id)),
      bot.shopCardIds.map(id => getCard(state, id)), rules).reroll).toBe(true);
    const after = prepare(state);
    expect(after.players[1]!.rerollsUsed).toBe(1);
    expect(after.players[1]!.purchasesThisRound).toBe(2);
    expect(assertPoolIntegrity(after)).toBe(true);
  });

  it('does not reroll a full hand after spending both purchases', () => {
    const after = prepare(fixture(['2c', '3d', '4h', '5s'], { rerollsUsed: 1 }));
    expect(after.players[1]!.rerollsUsed).toBe(1);
    expect(after.players[1]!.purchasesThisRound).toBe(2);
  });
});

describe('initial ability reward preferences', () => {
  it('values architect full houses, sniper first-card wins and capitalism retained cash', () => {
    const hand: Card[] = cards(['Qc', 'Qd']);
    const base = scoreBotPlan(1, hand, 20, 'ability');
    const architect = scoreBotPlan(1, hand, 20, 'ability', { player: player({ abilityId: 'architect' }) });
    const sniper = scoreBotPlan(1, hand, 20, 'ability', { player: player({ abilityId: 'target-sniper', firstCardId: 'Qc' }) });
    const capitalism = scoreBotPlan(1, hand, 20, 'ability', { player: player({ abilityId: 'capitalism' }) });
    expect(architect.utility).toBeGreaterThan(base.utility);
    expect(sniper.abilityValue).toBeGreaterThan(0);
    expect(capitalism.abilityValue).toBeCloseTo(.14);
    expect(r1PreflopStats(hand).categories[6]).toBeGreaterThan(0);
  });
});
