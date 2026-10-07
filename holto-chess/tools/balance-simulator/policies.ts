import type { Card } from "../../src/core/poker/cards";
import type { AbilityId } from "../../src/game/abilities";
import type { BotShopPolicy } from "../../src/game/engine";
import { makeAbilityPolicy } from "./abilityPolicy";
import { makeRandom } from "./stats";
import type { PolicyName } from "./types";

type Priced = { card: Card; price: number };

/**
 * A seat policy. `ENGINE_BOT` (all nulls) hands the seat to the game's own bot brain, which is what
 * real AI seats use; the other policies are simple, legible strategies for A/B-ing rule changes.
 */
export type ShopInput = Parameters<BotShopPolicy>[0] & { points: number };
export type DraftInfo = { round: number; playerId: string; stackBB: number; points: number };
export type Policy = {
  name: PolicyName;
  shop: ((input: ShopInput) => ReturnType<BotShopPolicy>) | null;
  pickDraft: ((options: Priced[], owned: readonly Card[], info: DraftInfo) => string) | null;
  /** R2 loadout as [anchor, run-1 secondary, run-2 secondary]. */
  loadout: ((cards: readonly Card[]) => Card[]) | null;
  /** Ability policies: an ability-specific R2 order, or null to use the engine's own loadout solver. */
  abilityLoadout?: (cards: readonly Card[]) => Card[] | null;
};

const count = <K>(items: readonly K[]) => items.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<K, number>());

function linkCount(rank: number, ranks: ReadonlySet<number>): number {
  const near = [rank - 2, rank - 1, rank + 1, rank + 2].filter((r) => ranks.has(r)).length;
  const wheel = (rank === 14 && [...ranks].some((r) => r <= 5)) || (rank <= 5 && ranks.has(14)) ? 1 : 0;
  return near + wheel;
}

function scorer(name: Exclude<PolicyName, "ENGINE_BOT" | "RANDOM" | "ABILITY_NEUTRAL" | "ABILITY_AWARE">): (card: Card, owned: readonly Card[], price: number) => number {
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

export type SeatContext = { ability: AbilityId | null; firstCardId?: string; sixRounds?: boolean };

export function makePolicy(name: PolicyName, seed: number, seat: SeatContext = { ability: null }): Policy {
  if (name === "ENGINE_BOT") return { name, shop: null, pickDraft: null, loadout: null };
  if (name === "ABILITY_NEUTRAL" || name === "ABILITY_AWARE") return makeAbilityPolicy(name, seat.ability, seat.firstCardId, seat.sixRounds ?? true);
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
