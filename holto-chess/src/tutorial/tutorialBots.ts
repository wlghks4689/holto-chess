import type { BotShopAction, BotShopInput } from "../game/engine";

/**
 * Practice opponents. They shop by a fixed, readable priority instead of the regular expected-value
 * search, so a first-time player is not out-scaled while reading. They never get extra BB or free
 * purchases: every action still passes the engine's own rule checks.
 */
export function tutorialBotPolicy(input: BotShopInput): BotShopAction {
  const { ownedCards, shopCards, stackBB, handLimit, purchasesLeft, rerollsLeft, rerollCost } = input;
  if (ownedCards.length >= handLimit || purchasesLeft <= 0) return { type: "DONE" };
  const affordable = shopCards.filter((entry) => entry.price <= stackBB);
  if (affordable.length) {
    const best = [...affordable].sort((a, b) =>
      fit(b.card, ownedCards) - fit(a.card, ownedCards) || b.card.rank - a.card.rank || (a.card.id < b.card.id ? -1 : 1))[0]!;
    return { type: "BUY", cardId: best.card.id };
  }
  // Rerolls only when nothing on offer can be bought at all: no speculative shop churn.
  if (rerollsLeft > 0 && stackBB >= rerollCost + 5) return { type: "REROLL" };
  return { type: "DONE" };
}

/** Pair an owned rank first, then follow an owned suit, then take the highest legal card. */
function fit(card: { rank: number; suit: string }, owned: readonly { rank: number; suit: string }[]): number {
  if (owned.some((entry) => entry.rank === card.rank)) return 2;
  if (owned.some((entry) => entry.suit === card.suit)) return 1;
  return 0;
}
