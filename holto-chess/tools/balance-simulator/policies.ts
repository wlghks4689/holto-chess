import type { Card } from "../../src/core/poker/cards";
import { getCard, getCardPrice } from "../../src/game/engine";
import type { PorenaGameState, PlayerState } from "../../src/game/types";
import type { PolicyName } from "./types";

const rankCounts = (cards: Card[]) => cards.reduce((map, card) => map.set(card.rank, (map.get(card.rank) ?? 0) + 1), new Map<number, number>());
const suitCounts = (cards: Card[]) => cards.reduce((map, card) => map.set(card.suit, (map.get(card.suit) ?? 0) + 1), new Map<Card["suit"], number>());

function policyScore(policy: PolicyName, candidate: Card, owned: Card[], price: number): number {
  if (policy === "HIGH_RANK") return candidate.rank * 20 - price;
  if (policy === "ECONOMY") return 500 - price * 20 + candidate.rank;
  if (policy === "PAIR_BUILDER") return (rankCounts(owned).get(candidate.rank) ?? 0) * 500 + candidate.rank * 5 - price;
  if (policy === "FLUSH_BUILDER") {
    const counts = suitCounts(owned);
    const strongest = Math.max(0, ...counts.values());
    return (counts.get(candidate.suit) === strongest ? 400 : 0) + (counts.get(candidate.suit) ?? 0) * 40 + candidate.rank - price;
  }
  const ranks = new Set<number>(owned.map((card) => card.rank));
  const links = [candidate.rank - 2, candidate.rank - 1, candidate.rank + 1, candidate.rank + 2]
    .reduce((total, rank) => total + (ranks.has(rank) ? 1 : 0), 0);
  const wheelLink = candidate.rank === 14 && [...ranks].some((rank) => rank <= 5) ? 1 : 0;
  return (links + wheelLink) * 180 + candidate.rank - price;
}

export function orderedShop(state: PorenaGameState, player: PlayerState, policy: PolicyName): string[] {
  const owned = player.ownedCardIds.map((id) => getCard(state, id));
  return [...player.shopCardIds].sort((left, right) => {
    const a = getCard(state, left); const b = getCard(state, right);
    return policyScore(policy, b, owned, getCardPrice(state, player.id, right))
      - policyScore(policy, a, owned, getCardPrice(state, player.id, left)) || left.localeCompare(right);
  });
}

export function hasStrategyCandidate(state: PorenaGameState, player: PlayerState, policy: PolicyName): boolean {
  if (policy === "HIGH_RANK") return player.shopCardIds.some((id) => getCard(state, id).rank >= 11);
  if (policy === "ECONOMY") return player.shopCardIds.some((id) => getCardPrice(state, player.id, id) <= 7);
  const owned = player.ownedCardIds.map((id) => getCard(state, id));
  if (policy === "PAIR_BUILDER") return player.shopCardIds.some((id) => owned.some((card) => card.rank === getCard(state, id).rank));
  if (policy === "FLUSH_BUILDER") {
    const suits = suitCounts(owned); const strongest = Math.max(0, ...suits.values());
    return player.shopCardIds.some((id) => suits.get(getCard(state, id).suit) === strongest);
  }
  return player.shopCardIds.some((id) => owned.some((card) => {
    const delta = Math.abs(card.rank - getCard(state, id).rank);
    return delta <= 2 || (card.rank === 14 && getCard(state, id).rank <= 5) || (getCard(state, id).rank === 14 && card.rank <= 5);
  }));
}

export function shouldReroll(state: PorenaGameState, player: PlayerState, policy: PolicyName): boolean {
  if (policy === "ECONOMY" || player.shopCardIds.length === 0) return false;
  return !hasStrategyCandidate(state, player, policy) && player.stackBB >= 15;
}

export function selectR2Cards(state: PorenaGameState, player: PlayerState, policy: PolicyName): string[] {
  const owned = player.ownedCardIds.map((id) => ({ id, card: getCard(state, id) }));
  let best = owned.slice(0, 2).map((entry) => entry.id);
  let score = Number.NEGATIVE_INFINITY;
  for (let left = 0; left < owned.length; left += 1) for (let right = left + 1; right < owned.length; right += 1) {
    const pair = [owned[left]!, owned[right]!];
    const value = policyScore(policy, pair[0].card, [pair[1].card], 0) + policyScore(policy, pair[1].card, [pair[0].card], 0);
    if (value > score) { score = value; best = pair.map((entry) => entry.id); }
  }
  return best;
}

export function assignPolicies(playerIds: string[], policies: PolicyName[], mode: "fixed" | "random", seed: number): Record<string, PolicyName> {
  let value = (seed >>> 0) || 1;
  const random = () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
  return Object.fromEntries(playerIds.map((id, index) => [id, mode === "fixed" ? policies[index % policies.length]! : policies[Math.floor(random() * policies.length)]!]));
}
