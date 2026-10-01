import type { HandValue } from "../core/poker/evaluate";
import { BALANCE, cardPrice, regularShopSizeFor, rerollLimitFor } from "./config";
import type { PlayerState, Round } from "./types";

export const ABILITY_IDS = ["royal-blood", "target-sniper", "underdog", "first-class", "golden-hand", "trader", "predator", "architect", "capitalism", "zero-risk", "quad-core", "front-runner"] as const;
export type AbilityId = typeof ABILITY_IDS[number];
export type AbilityDraft = { order: string[]; deck: AbilityId[]; picks: { playerId: string; slot: number }[] };
export type AbilityDraftView = { order: string[]; slotCount: number; availableSlots: number[]; currentPlayerId?: string; pickedCount: number; myPick?: { slot: number; abilityId: AbilityId }; abilities?: { playerId: string; abilityId: AbilityId; slot: number }[] };
export type AbilityEvent = { sequence?: number; round: Round; playerId: string; abilityId: AbilityId; reason: string; subjectId?: string; bb: number; points: number; savedBB: number; matchId?: string; run?: number; originalPosition?: number };
export type AbilityTotals = { activations: number; bb: number; points: number; savedBB: number };
export type AbilityBenefitView = AbilityTotals & { draftPositions: { round: Round; originalPosition: number }[] };
/** Public cues intentionally contain no opponent payout or private action details. */
export type AbilityCue = { id: string; playerId: string; abilityId: AbilityId; run?: number; bb?: number; points?: number };
export const isRoundAbilityEvent = (event: Pick<AbilityEvent, "reason">) => event.reason === "round-interest" || event.reason === "round-leader";

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
// 2026-10-01 user-approved rebalance: Target Sniper pays on wins, Zero Risk becomes tiered Protector,
// Quad Core accepts any Quads, Predator scales with the streak, Capitalism interest 20% → 15%.
export const TARGET_SNIPER_WIN_BB = 15;
export const PREDATOR_BB_PER_STREAK = 5;
export const CAPITALISM_INTEREST_PERCENT = 15;
/** Protector (`zero-risk`) payout tiers by the pre-board win chance, highest first. */
export const PROTECTOR_TIERS = [{ minPercent: 80, bb: 50 }, { minPercent: 70, bb: 30 }, { minPercent: 60, bb: 20 }] as const;

/** Only the player's already allocated R5 placement award is doubled. Any Quads qualifies. */
export function quadCorePlacementBonus(player: Pick<PlayerState, "abilityId">, hand: HandValue, round: Round, placementPoints: number): number {
  return player.abilityId === "quad-core" && round === 5 && hand.category === "QUADS" && placementPoints > 0 ? placementPoints : 0;
}
/** Target Sniper: an outright regular-match win whose BEST 5 holds the still-owned starting card. */
export function targetSniperWinReward(player: Pick<PlayerState, "abilityId" | "firstCardId" | "ownedCardIds">, hand: HandValue): number {
  if (player.abilityId !== "target-sniper" || !player.firstCardId || !player.ownedCardIds.includes(player.firstCardId)) return 0;
  return hand.bestFive.some(card => card.id === player.firstCardId) ? TARGET_SNIPER_WIN_BB : 0;
}
/** Predator: nothing for the first win, then 5BB × current streak (2 → 10BB, 3 → 15BB, …). */
export const predatorStreakReward = (streak: number) => streak >= 2 ? PREDATOR_BB_PER_STREAK * streak : 0;
/** Protector: BB for an outright loss, by the raw pre-board win chance. */
export const protectorLossReward = (rawPercent: number) => PROTECTOR_TIERS.find(tier => rawPercent >= tier.minPercent)?.bb ?? 0;
export function madeAbilityReward(player: Pick<PlayerState, "abilityId" | "firstCardId" | "ownedCardIds">, hand: HandValue, round: Round): { bb: number; points: number } {
  if (player.abilityId === "architect" && hand.category === "FULL_HOUSE") return { bb: 30, points: 0 };
  if (!STRAIGHT_OR_BETTER.has(hand.category)) return { bb: 0, points: 0 };
  if (player.abilityId === "underdog" && round === 5 && hand.bestFive.some(card => card.rank === 2)) return { bb: 0, points: 20 };
  return { bb: 0, points: 0 };
}
