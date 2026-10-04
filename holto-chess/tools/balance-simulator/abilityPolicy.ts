import { makeDeck, type Card } from "../../src/core/poker/cards";
import { findBestFive, findBestOmaha } from "../../src/core/poker/evaluate";
import { CAPITALISM_INTEREST_PERCENT, type AbilityId } from "../../src/game/abilities";
import { scoreBotPlan } from "../../src/game/botStrategy";
import { BALANCE, cardPrice } from "../../src/game/config";
import type { Round } from "../../src/game/types";
import { makeRandom } from "./stats";
import type { DraftInfo, Policy, ShopInput } from "./policies";

/**
 * Seat brain that plays the game's own equity planner (`scoreBotPlan`) and, in AWARE mode, adds the expected
 * value of the seat's ability to every purchase / swap / draft decision. NEUTRAL runs the identical code with the
 * ability terms switched off, so NEUTRAL vs AWARE isolates what tailoring play to an ability is worth.
 *
 * Ability terms are in planner-utility units: 1% match equity = 1 unit, and one Point is worth about 16 units
 * (a typical match win is ~4 Points plus ~2 Points of BB for ~25% of equity swing). 1BB = 0.1 Point = 1.6 units.
 */
const UNITS_PER_POINT = 16;
const UNITS_PER_BB = UNITS_PER_POINT / 10;
/** Regulation boards per round in which a per-match ability can pay (R4: primary + a secondary for most seats). */
const MATCHES: Record<Round, number> = { 1: 3, 2: 2, 3: 3, 4: 1.5, 5: 1 };
/** Chance a finalist-to-be actually reaches R5 (8 -> 6 -> 4 -> R5 needs two cuts). */
const REACH_R5 = 0.5;
const FUTURE_NEED = [1, 0.6, 0.3, 0.1, 0.02] as const;
const SAMPLES = 24;

const window = (cards: readonly Card[], low: number): number => {
  const hit = new Set<number>();
  for (const c of cards) { const r = c.rank === 14 && low === 1 ? 1 : c.rank; if (r >= low && r <= low + 4) hit.add(r); }
  return hit.size;
};

/** Best straight-window coverage among windows containing `rank`; the wheel counts an ace low. */
function coverage(cards: readonly Card[], mustHold: (low: number) => boolean): number {
  let best = 0;
  for (let low = 1; low <= 10; low += 1) if (mustHold(low)) best = Math.max(best, window(cards, low));
  return best;
}

type Tailoring = { bonus(round: Round, cards: readonly Card[], stackAfter: number, price: number, seedKey: string): number };

function completedCategories(round: Round, cards: readonly Card[], seedKey: string, firstCardId?: string) {
  const known = new Set(cards.map((c) => c.id));
  const unseen = makeDeck().filter((c) => !known.has(c.id));
  const random = makeRandom([...seedKey].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0 || 1);
  const limit = BALANCE.handLimits[round];
  let fullHouse = 0; let strong = 0; let strongWithFirst = 0;
  const fh = (hs: ReturnType<typeof hands>) => hs.filter((h) => h.category === "FULL_HOUSE").length;
  const st = (hs: ReturnType<typeof hands>) => hs.filter((h) => h.categoryRank >= 5).length;
  const samples = round === 5 ? 1 : SAMPLES;
  for (let s = 0; s < samples; s += 1) {
    const deck = [...unseen];
    for (let i = deck.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
    // Missing hole cards are unknown: fill them from the same shuffled deck so partial hands are scored fairly.
    const partial = cards.length < limit ? [...cards, ...deck.splice(0, limit - cards.length)] : cards;
    const usedCards = partial;
    const board = deck;
    const list = (round === 5 ? [findBestFive(usedCards)]
      : round === 3 ? [findBestOmaha(usedCards, board.slice(0, 5))]
      : round === 2 && usedCards.length === 3 ? (() => {
        const opts = usedCards.map((anchor, i) => usedCards.filter((_, j) => j !== i).map((other) => findBestFive([anchor, other, ...board.slice(0, 5)])));
        return opts.reduce((a, b) => (fh(b) + st(b) > fh(a) + st(a) ? b : a));
      })()
      : [findBestFive([...usedCards, ...board.slice(0, 5)])]);
    fullHouse += fh(list) / list.length; strong += st(list) / list.length;
    if (firstCardId) strongWithFirst += list.filter((h) => h.categoryRank >= 5 && h.bestFive.some((c) => c.id === firstCardId)).length / list.length;
  }
  return { fullHouse: fullHouse / samples, strong: strong / samples, strongWithFirst: strongWithFirst / samples };
}

function tailoringFor(ability: AbilityId | null, firstCardId: string | undefined): Tailoring {
  switch (ability) {
    case "target-sniper": return {
      bonus(round, cards, _stack, _price, key) {
        const first = cards.find((c) => c.id === firstCardId);
        if (!first) return -40; // selling the first card would switch the ability off
        // Since 2026-10-01 it pays on an outright win with the first card in the BEST 5 (any hand), so hands
        // the first card makes strong are still the ones most likely to collect it.
        const { strongWithFirst } = completedCategories(round, cards, `${key}:sn`, firstCardId);
        return MATCHES[round] * strongWithFirst * 15 * UNITS_PER_BB;
      },
    };
    case "underdog": return {
      bonus(round, cards) {
        // Payout exists only in R5: a straight-or-better containing a 2. Built windows are A-2-3-4-5 and 2-3-4-5-6;
        // a 2-bearing flush or full house also pays, which this deliberately ignores (it only ever under-counts).
        const covered = coverage(cards, (low) => low === 1 || low === 2);
        if (round === 5) return covered >= 5 ? 20 * UNITS_PER_POINT : 0;
        const need = 5 - covered;
        // v1 priced the far future at full EV and dragged the seat into R3/R4 exits (R5 reach 39% vs ~50%). The chase is now a
        // tie-break before R4 and a real preference only once the final is two rounds away.
        return 20 * UNITS_PER_POINT * FUTURE_NEED[Math.min(need, 4)]! * (round >= 4 ? 0.12 : 0.05);
      },
    };
    case "architect": return {
      bonus(round, cards, _stack, _price, key) {
        const { fullHouse } = completedCategories(round, cards, `${key}:ar`);
        const now = MATCHES[round] * fullHouse * 30 * UNITS_PER_BB;
        if (round === 5) return now;
        // Later rounds: trips or two pair now is the raw material of an R5 full house.
        const counts = new Map<number, number>(); for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
        const v = [...counts.values()]; const trips = v.filter((n) => n >= 3).length; const pairs = v.filter((n) => n === 2).length;
        const progress = trips && pairs ? 1 : trips ? 0.35 : pairs >= 2 ? 0.25 : pairs ? 0.1 : 0;
        return now + REACH_R5 * progress * 30 * UNITS_PER_BB * 0.6;
      },
    };
    case "royal-blood": return {
      bonus: (_r, cards, _s, price) => {
        const last = cards[cards.length - 1]!;
        return (cardPrice(last.rank) - price) * UNITS_PER_BB * 0.5; // the discount is the point of the card
      },
    };
    case "capitalism": return {
      // Every BB left after a round earns CAPITALISM_INTEREST_PERCENT (15% since 2026-10-01) interest. v1 priced cash at 1.6 units/BB and hoarded (R5 reach 41% vs 55% for the
      // plain brain); the planner itself values a BB at 0.035, so this only leans that value up in proportion to interest rounds left.
      bonus: (round, _cards, stackAfter) => stackAfter * 0.035 * (CAPITALISM_INTEREST_PERCENT / 100) * Math.max(0, 5 - round) * 4,
    };
    default: return { bonus: () => 0 };
  }
}

const TARGET_EQUITY: Record<Round, number> = { 1: 0.56, 2: 0.53, 3: 0.52, 4: 0.51, 5: 0.5 };

export function makeAbilityPolicy(kind: "ABILITY_NEUTRAL" | "ABILITY_AWARE", ability: AbilityId | null, firstCardId: string | undefined): Policy {
  const aware = kind === "ABILITY_AWARE";
  const tailoring = aware ? tailoringFor(ability, firstCardId) : { bonus: () => 0 };
  let pendingBuy: string | null = null;

  const utility = (round: Round, cards: readonly Card[], stackAfter: number, price: number, key: string, shared: readonly Card[]) => {
    const base = scoreBotPlan(round, cards, stackAfter, key, { rulesVersion: 2, sharedKnown: shared });
    return { base, total: base.utility + tailoring.bonus(round, cards, stackAfter, price, key) };
  };

  const shop = (input: ShopInput) => {
    const { round, stackBB, ownedCards, shopCards } = input;
    if (pendingBuy) {
      const id = pendingBuy; pendingBuy = null;
      if (shopCards.some((s) => s.card.id === id)) return { type: "BUY" as const, cardId: id };
    }
    const key = `${input.playerId}:${input.points}:${stackBB}`;
    const shared = [...ownedCards, ...shopCards.map((s) => s.card)];
    const affordable = shopCards.filter((s) => s.price <= stackBB);
    const missing = input.handLimit - ownedCards.length;
    const ranked = (missing <= 0 ? [] : affordable).map((option) => {
      const u = utility(round, [...ownedCards, option.card], stackBB - option.price, option.price, key, shared);
      // Capitalism refuses to overpay: the interest bonus above already prices the cash, this breaks ties toward cheap.
      return { ...option, base: u.base, total: u.total };
    }).sort((a, b) => b.total - a.total || a.price - b.price || b.card.rank - a.card.rank);
    const best = ranked[0];
    const behind = input.points < 8 * (round - 1) || stackBB < 35;
    const freeRerolls = ability === "trader" && aware;
    const wantsReroll = (b: typeof best) => {
      if (input.rerollsLeft <= 0 || stackBB < input.rerollCost + (freeRerolls ? 0 : 5)) return false;
      if (!b) return true;
      // Free rerolls are the trader's whole edge, so it digs for a better card whenever equity is not comfortable.
      if (freeRerolls) return b.base.equity < TARGET_EQUITY[round] + 0.04;
      return b.base.equity < TARGET_EQUITY[round] - (behind ? 0.025 : 0) && b.price >= 10;
    };

    if (missing >= 2 && input.purchasesLeft >= 2) {
      // Same as the engine bot: an empty R1 hand is scored two cards at a time so pairs and suited combos count.
      const pairs = affordable.flatMap((x, i) => affordable.slice(i + 1).filter((y) => x.price + y.price <= stackBB).map((y) => {
        const u = utility(round, [...ownedCards, x.card, y.card], stackBB - x.price - y.price, x.price + y.price, `${key}:pair`, shared);
        return { first: x.card.id, second: y.card.id, price: x.price + y.price, base: u.base, total: u.total };
      })).sort((x, y) => y.total - x.total || x.price - y.price);
      const pair = pairs[0];
      if (pair) {
        if (wantsReroll(pair) && stackBB >= input.rerollCost + missing * 5) return { type: "REROLL" as const };
        pendingBuy = pair.second;
        return { type: "BUY" as const, cardId: pair.first };
      }
    }
    if (missing > 0 && input.purchasesLeft > 0) {
      if (wantsReroll(best) && stackBB >= input.rerollCost + missing * 5) return { type: "REROLL" as const };
      return best ? { type: "BUY" as const, cardId: best.card.id } : { type: "DONE" as const };
    }
    if (missing === 0 && input.purchasesLeft > 0) {
      {
        const refundRate = ability === "golden-hand" ? 1 : BALANCE.sellRate;
        const baseline = utility(round, ownedCards, stackBB, 0, `${key}:up`, ownedCards).total;
        const threshold = ability === "golden-hand" && aware ? 1 : 2.25;
        let bestSwap: { out: Card; in: Card; total: number } | null = null;
        for (const out of ownedCards) {
          if (aware && ability === "target-sniper" && out.id === firstCardId) continue;
          for (const offer of shopCards) {
            const refund = Math.floor(cardPrice(out.rank) * refundRate);
            if (stackBB + refund < offer.price) continue;
            const replacement = ownedCards.filter((c) => c.id !== out.id).concat(offer.card);
            const total = utility(round, replacement, stackBB + refund - offer.price, offer.price, `${key}:up`, ownedCards).total;
            if (total > baseline + threshold && (!bestSwap || total > bestSwap.total)) bestSwap = { out, in: offer.card, total };
          }
        }
        if (bestSwap) { pendingBuy = bestSwap.in.id; return { type: "SELL" as const, cardId: bestSwap.out.id }; }
        const equity = utility(round, ownedCards, stackBB, 0, `${key}:eq`, ownedCards).base.equity;
        if (input.rerollsLeft > 0 && stackBB >= input.rerollCost + 20 && equity < 0.58) return { type: "REROLL" as const };
      }
    }
    return { type: "DONE" as const };
  };

  const pickDraft = (options: { card: Card; price: number }[], owned: readonly Card[], info: DraftInfo): string => {
    const key = `${info.playerId}:${info.points}:${info.stackBB}`;
    const shared = [...owned, ...options.map((o) => o.card)];
    return options.map((o) => ({ o, total: utility(info.round, [...owned, o.card], info.stackBB - o.price, o.price, key, shared).total }))
      .sort((a, b) => b.total - a.total || a.o.price - b.o.price || b.o.card.rank - a.o.card.rank)[0]!.o.card.id;
  };

  return {
    name: kind, shop, pickDraft,
    // The anchor plays both runs. Sniper anchors its first card so both runs count toward the +15BB.
    loadout: null,
    abilityLoadout: (cards) => {
      if (aware && ability === "target-sniper") {
        const first = cards.find((c) => c.id === firstCardId);
        if (first) return [first, ...cards.filter((c) => c.id !== first.id)];
      }
      return null;
    },
  };
}
