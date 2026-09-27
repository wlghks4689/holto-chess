import type { Card } from "../../src/core/poker/cards";
import type { BotShopPolicy } from "../../src/game/engine";
import { makeRandom } from "./stats";
import type { PolicyName } from "./types";

type Priced = { card: Card; price: number };

/**
 * A seat policy. `ENGINE_BOT` (all nulls) hands the seat to the game's own bot brain, which is what
 * real AI seats use; the other policies are simple, legible strategies for A/B-ing rule changes.
 */
export type Policy = {
  name: PolicyName;
  shop: BotShopPolicy | null;
  pickDraft: ((options: Priced[], owned: readonly Card[]) => string) | null;
  /** R2 loadout as [anchor, run-1 secondary, run-2 secondary]. */
  loadout: ((cards: readonly Card[]) => Card[]) | null;
};

const count = <K>(items: readonly K[]) => items.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<K, number>());

function linkCount(rank: number, ranks: ReadonlySet<number>): number {
  const near = [rank - 2, rank - 1, rank + 1, rank + 2].filter((r) => ranks.has(r)).length;
  const wheel = (rank === 14 && [...ranks].some((r) => r <= 5)) || (rank <= 5 && ranks.has(14)) ? 1 : 0;
  return near + wheel;
}

function scorer(name: Exclude<PolicyName, "ENGINE_BOT" | "RANDOM">): (card: Card, owned: readonly Card[], price: number) => number {
  return (card, owned, price) => {
    if (name === "HIGH_RANK") return card.rank * 20 - price;
    if (name === "ECONOMY") return 500 - price * 20 + card.rank;
    if (name === "PAIR_BUILDER") return (count(owned.map((c) => c.rank)).get(card.rank) ?? 0) * 500 + card.rank * 5 - price;
    if (name === "FLUSH_BUILDER") {
      const suits = count(owned.map((c) => c.suit)); const top = Math.max(0, ...suits.values()); const mine = suits.get(card.suit) ?? 0;
      return (mine && mine === top ? 400 : 0) + mine * 40 + card.rank - price;
    }
    return linkCount(card.rank, new Set(owned.map((c) => c.rank))) * 180 + card.rank - price;
  };
}

/** Does the shop hold something that fits the policy's plan? If not, a reroll is worth considering. */
function hasFit(name: PolicyName, shop: readonly Priced[], owned: readonly Card[]): boolean {
  if (name === "HIGH_RANK") return shop.some((s) => s.card.rank >= 11);
  if (name === "PAIR_BUILDER") return shop.some((s) => owned.some((c) => c.rank === s.card.rank));
  if (name === "STRAIGHT_BUILDER") return shop.some((s) => linkCount(s.card.rank, new Set(owned.map((c) => c.rank))) > 0);
  if (name === "FLUSH_BUILDER") {
    const suits = count(owned.map((c) => c.suit)); const top = Math.max(0, ...suits.values());
    return shop.some((s) => suits.get(s.card.suit) === top);
  }
  return true;
}

export function makePolicy(name: PolicyName, seed: number): Policy {
  if (name === "ENGINE_BOT") return { name, shop: null, pickDraft: null, loadout: null };
  const random = makeRandom(seed);
  const score = name === "RANDOM" ? () => 0 : scorer(name);
  const best = (options: readonly Priced[], owned: readonly Card[]) => name === "RANDOM"
    ? options[Math.floor(random() * options.length)]!
    : options.reduce((a, b) => score(b.card, owned, b.price) > score(a.card, owned, a.price) ? b : a);
  const shop: BotShopPolicy = (input) => {
    const need = input.handLimit - input.ownedCards.length;
    if (need <= 0 || input.purchasesLeft <= 0) return { type: "DONE" };
    const affordable = input.shopCards.filter((s) => s.price <= input.stackBB);
    // The driver already caps `rerollsLeft` at the configured maximum.
    const canReroll = name !== "ECONOMY" && name !== "RANDOM" && input.rerollsLeft > 0
      && input.stackBB >= input.rerollCost + need * 2;
    if (canReroll && (!affordable.length || !hasFit(name, input.shopCards, input.ownedCards))) return { type: "REROLL" };
    if (!affordable.length) return { type: "DONE" };
    return { type: "BUY", cardId: best(affordable, input.ownedCards).card.id };
  };
  return {
    name, shop,
    pickDraft: (options, owned) => best(options, owned).card.id,
    loadout: (cards) => [...cards].sort((a, b) => score(b, [], 0) - score(a, [], 0)),
  };
}
