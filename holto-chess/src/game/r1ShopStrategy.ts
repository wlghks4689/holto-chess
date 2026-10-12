import { makeDeck, type Card } from '../core/poker/cards';
import { abilityLockCost, abilityPrice, abilityRerollCost, abilityRerollLimit, abilitySellRate, abilityShopSize } from './abilities';
import { scoreBotPlan } from './botStrategy';
import { r1HandKey } from './r1Preflop';
import { cardPrice, purchaseLimitFor, type RuleContext } from './config';
import type { PlayerState } from './types';

type BuyPlan = { cards: Card[]; price: number; utility: number };
export type R1ShopDecision = { buyCards: Card[]; reroll: boolean; lockCardIds: string[]; currentUtility: number; expectedUtility?: number };
const REROLL_SAMPLES = 128;
const IMPROVEMENT_MARGIN = 1.25;
const SPEND_WEIGHT = .35;

function bestBuy(player: PlayerState, owned: readonly Card[], shop: readonly Card[], stack: number, cache: Map<string, number>): BuyPlan | null {
  const missing = 2 - owned.length;
  const purchasesLeft = purchaseLimitFor(1) - player.purchasesThisRound;
  if (purchasesLeft <= 0 || purchasesLeft < missing) return null;
  if (missing === 0) {
    const baseline = scoreBotPlan(1, owned, stack, 'r1-upgrade', { player }).utility;
    let utility = baseline;
    for (const sold of owned) for (const offered of shop) {
      const after = stack + Math.floor(cardPrice(sold.rank) * abilitySellRate(player)) - abilityPrice(player, offered.rank);
      if (after < 0) continue;
      const hand = owned.filter(card => card.id !== sold.id).concat(offered);
      const key = `${r1HandKey(hand)}:${after}:${hand.some(card => card.id === player.firstCardId)}`;
      const value = cache.get(key) ?? scoreBotPlan(1, hand, after, 'r1-upgrade', { player }).utility;
      cache.set(key, value);
      // Match the engine's legal one-purchase exchange threshold. Actual swaps stay in the engine.
      if (value > baseline + 2.25) utility = Math.max(utility, value);
    }
    return { cards: [], price: 0, utility };
  }
  let best: BuyPlan | null = null;
  const sets = missing === 1 ? shop.map(card => [card])
    : shop.flatMap((card, index) => shop.slice(index + 1).map(other => [card, other]));
  for (const cards of sets) {
    const price = cards.reduce((sum, card) => sum + abilityPrice(player, card.rank), 0);
    if (price > stack) continue;
    const hand = [...owned, ...cards];
    // Rank/suit-equivalent hands share value; first-card reward eligibility must stay distinct.
    const key = `${r1HandKey(hand)}:${stack - price}:${hand.some(card => card.id === player.firstCardId)}`;
    const utility = cache.get(key) ?? scoreBotPlan(1, hand, stack - price, 'r1-shop', { player }).utility;
    cache.set(key, utility);
    if (!best || utility > best.utility || (utility === best.utility && price < best.price)) best = { cards, price, utility };
  }
  return best;
}

/** Compare staying with full/one-card-preserving rerolls. Never reads the live pool or game RNG. */
export function planR1Shop(player: PlayerState, owned: readonly Card[], shop: readonly Card[], rules: RuleContext): R1ShopDecision {
  const cache = new Map<string, number>();
  const current = bestBuy(player, owned, shop, player.stackBB, cache);
  const stay: R1ShopDecision = { buyCards: current?.cards ?? [], reroll: false, lockCardIds: [], currentUtility: current?.utility ?? -100 };
  if (player.purchasesThisRound >= purchaseLimitFor(1, rules)
    || (player.rerollsUsed ?? 0) >= abilityRerollLimit(player, 1, rules)) return stay;
  // A pocket 88+ already meets the requested premium-hand target; extra/free rerolls are optional.
  const hand = owned.length === 2 ? owned : [...owned, ...(current?.cards ?? [])];
  if (hand.length === 2 && hand[0]!.rank === hand[1]!.rank && hand[0]!.rank >= 8) return stay;
  const locked = shop.filter(card => player.lockedShopCardIds?.includes(card.id));
  const target = abilityShopSize(player, 1, rules);
  const cost = abilityRerollCost(player);
  const keeps = [locked, ...shop.filter(card => !locked.includes(card)).map(card => [...locked, card])];
  let best = stay;
  for (const keep of keeps) {
    const slots = target - keep.length;
    const newlyLocked = keep.filter(card => !locked.includes(card));
    const spend = cost + newlyLocked.length * abilityLockCost(player);
    const stack = player.stackBB - spend;
    if (slots <= 0 || stack < (2 - owned.length) * abilityPrice(player, 2)) continue;
    const known = new Set([...owned, ...keep].map(card => card.id));
    // Unlocked shop cards return to the unknown pool and may appear again, just as in the engine.
    const unseen = makeDeck().filter(card => !known.has(card.id));
    let seed = 2166136261;
    const key = [...owned.map(c => c.id).sort(), '/', ...shop.map(c => c.id).sort(), '/', ...keep.map(c => c.id).sort(), player.stackBB, player.rerollsUsed ?? 0].join(':');
    for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let total = 0;
    for (let sample = 0; sample < REROLL_SAMPLES; sample++) {
      const pool = [...unseen];
      for (let i = 0; i < slots; i++) { const j = i + Math.floor(random() * (pool.length - i)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
      total += bestBuy(player, owned, [...keep, ...pool.slice(0, slots)], stack, cache)?.utility ?? -100;
    }
    const expected = total / REROLL_SAMPLES - spend * SPEND_WEIGHT;
    if (expected > (best.expectedUtility ?? stay.currentUtility) + (best.reroll ? 0 : IMPROVEMENT_MARGIN)) {
      best = { ...stay, reroll: true, lockCardIds: newlyLocked.map(c => c.id), expectedUtility: expected };
    }
  }
  return best;
}
