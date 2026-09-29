import type { HandValue } from "../core/poker/evaluate";
import { BALANCE, cardPrice, regularShopSizeFor, rerollLimitFor } from "./config";
import type { PlayerState, Round } from "./types";

export const ABILITY_IDS = ["royal-blood", "target-sniper", "underdog", "first-class", "golden-hand", "trader", "predator", "architect", "capitalism", "zero-risk"] as const;
export type AbilityId = typeof ABILITY_IDS[number];
export type AbilityDraft = { order: string[]; deck: AbilityId[]; picks: { playerId: string; slot: number }[] };
export type AbilityDraftView = { order: string[]; availableSlots: number[]; currentPlayerId?: string; pickedCount: number; myPick?: { slot: number; abilityId: AbilityId }; abilities?: { playerId: string; abilityId: AbilityId; slot: number }[] };
export type AbilityEvent = { round: Round; playerId: string; abilityId: AbilityId; reason: string; subjectId?: string; bb: number; points: number; savedBB: number; matchId?: string; run?: number };
export type AbilityTotals = { activations: number; bb: number; points: number; savedBB: number };

export function abilityPrice(player: Pick<PlayerState, "abilityId">, rank: number): number {
  const price = cardPrice(rank);
  return player.abilityId === "royal-blood" && rank >= 10 ? Math.floor(price / 2) : price;
}
export function abilityShopSize(player: PlayerState, round: Round, rulesVersion = 2): number {
  const base = rulesVersion === 2 ? regularShopSizeFor(round) : player.shopSize;
  return base + (base > 0 && player.abilityId === "golden-hand" ? 1 : 0);
}
export function abilityRerollLimit(player: Pick<PlayerState, "abilityId">, round: Round, rulesVersion = 2): number {
  return round === 2 ? 0 : rerollLimitFor(round, rulesVersion) + (player.abilityId === "trader" ? 1 : 0);
}
export function abilityRerollCost(player: Pick<PlayerState, "abilityId">): number { return player.abilityId === "trader" ? 0 : BALANCE.rerollCostBB; }
export function abilityLockCost(player: Pick<PlayerState, "abilityId">): number { return player.abilityId === "trader" ? 0 : BALANCE.cardLockCostBB; }
export function abilitySellRate(player: Pick<PlayerState, "abilityId">): number { return player.abilityId === "golden-hand" ? 1 : BALANCE.sellRate; }

const STRAIGHT_OR_BETTER = new Set(["STRAIGHT", "FLUSH", "FULL_HOUSE", "QUADS", "STRAIGHT_FLUSH", "ROYAL_FLUSH"]);
export function madeAbilityReward(player: Pick<PlayerState, "abilityId" | "firstCardId" | "ownedCardIds">, hand: HandValue, round: Round): { bb: number; points: number } {
  if (player.abilityId === "architect" && hand.category === "FULL_HOUSE") return { bb: 30, points: 0 };
  if (!STRAIGHT_OR_BETTER.has(hand.category)) return { bb: 0, points: 0 };
  if (player.abilityId === "target-sniper" && player.ownedCardIds.includes(player.firstCardId ?? "") && hand.bestFive.some(card => card.id === player.firstCardId)) return { bb: 15, points: 0 };
  if (player.abilityId === "underdog" && round === 5 && hand.bestFive.some(card => card.rank === 2)) return { bb: 0, points: 20 };
  return { bb: 0, points: 0 };
}
