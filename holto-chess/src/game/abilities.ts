import type { HandValue } from "../core/poker/evaluate";
import { BALANCE, cardPrice, isFinalRound, purchaseLimitFor, regularShopSizeFor, rerollLimitFor, type RuleContext } from "./config";
import type { PlayerState, Round } from "./types";

export const ABILITY_IDS = ["royal-blood", "target-sniper", "underdog", "first-class", "golden-hand", "trader", "predator", "architect", "capitalism", "zero-risk", "quad-core", "front-runner"] as const;
export type AbilityId = typeof ABILITY_IDS[number];
/** The dealt deck and which seat holds which card; `slot` orders the reveal grid. */
export type AbilityDraft = { deck: AbilityId[]; picks: { playerId: string; slot: number }[] };
/** `mine` during ABILITY_DEAL; every seat's ability only from ABILITY_REVEAL. */
export type AbilityDraftView = { mine?: AbilityId; abilities: { playerId: string; abilityId: AbilityId; slot: number }[] };
export type AbilityEvent = { sequence?: number; round: Round; playerId: string; abilityId: AbilityId; reason: string; subjectId?: string; bb: number; points: number; savedBB: number; matchId?: string; run?: number; originalPosition?: number };
export type AbilityTotals = { activations: number; bb: number; points: number; savedBB: number };
export type AbilityBenefitView = AbilityTotals & { draftPositions: { round: Round; originalPosition: number }[] };
/** Public cues intentionally contain no opponent payout or private action details. */
export type AbilityCue = { id: string; playerId: string; abilityId: AbilityId; run?: number; bb?: number; points?: number };
export const isRoundAbilityEvent = (event: Pick<AbilityEvent, "reason">) => event.reason === "round-interest" || event.reason === "round-leader";

/** Royal Blood's own ranks: J, Q, K and A. Its starting card is one of them; shop and draft copies cost nothing and sell for nothing. */
export const ROYAL_BLOOD_MIN_RANK = 11;
const royalCard = (player: Pick<PlayerState, "abilityId">, rank: number) => player.abilityId === "royal-blood" && rank >= ROYAL_BLOOD_MIN_RANK;
/** Shop and open-draft price. The R3 auction and its double-price buyback never use it. */
export function abilityPrice(player: Pick<PlayerState, "abilityId">, rank: number): number {
  return royalCard(player, rank) ? 0 : cardPrice(rank);
}
/** BB a sale returns: the sell rate of the base price, nothing for a Royal Blood J–A. */
export function abilitySellRefund(player: Pick<PlayerState, "abilityId">, rank: number): number {
  return royalCard(player, rank) ? 0 : Math.floor(cardPrice(rank) * abilitySellRate(player));
}
/** Trader buys one more card in every shop phase. */
export function abilityPurchaseLimit(player: Pick<PlayerState, "abilityId">, round: Round, rules: RuleContext = { rulesVersion: 2 }): number {
  const base = purchaseLimitFor(round, rules);
  return base + (base > 0 && player.abilityId === "trader" ? TRADER_EXTRA_PURCHASES : 0);
}
export function abilityShopSize(player: PlayerState, round: Round, rules: RuleContext = { rulesVersion: 2 }): number {
  const base = rules.rulesVersion === 2 ? regularShopSizeFor(round, rules) : player.shopSize;
  return base + (base > 0 && player.abilityId === "golden-hand" ? 1 : 0);
}
export function abilityRerollLimit(player: Pick<PlayerState, "abilityId">, round: Round, rules: RuleContext = { rulesVersion: 2 }): number {
  return round === 2 ? 0 : rerollLimitFor(round, rules) + (player.abilityId === "trader" ? 1 : 0);
}
export function abilityRerollCost(player: Pick<PlayerState, "abilityId">): number { return player.abilityId === "trader" ? 0 : BALANCE.rerollCostBB; }
export function abilityLockCost(player: Pick<PlayerState, "abilityId">): number { return player.abilityId === "trader" ? 0 : BALANCE.cardLockCostBB; }
export function abilitySellRate(player: Pick<PlayerState, "abilityId">): number { return player.abilityId === "golden-hand" ? 1 : BALANCE.sellRate; }

const TRIPS_OR_BETTER = new Set(["TRIPS", "STRAIGHT", "FLUSH", "FULL_HOUSE", "QUADS", "STRAIGHT_FLUSH", "ROYAL_FLUSH"]);
// 2026-10-01 user-approved rebalance: Target Sniper pays on wins, Zero Risk becomes tiered Protector,
// Quad Core accepts any Quads, Predator scales with the streak, Capitalism interest 20% → 15%.
// 2026-10-03: back to 20% because match BB now goes to losers only and stacks are smaller.
// 2026-10-15 user-approved patch (ABILITY-PATCH-002): Royal Blood J–A free, Underdog +2P per match with
// its own 2 in trips or better, Capitalism 25%, Quad Core doubles any match's points, Trader +1 buy.
export const TARGET_SNIPER_WIN_BB = 15;
export const PREDATOR_BB_PER_STREAK = 5;
export const CAPITALISM_INTEREST_PERCENT = 25;
export const UNDERDOG_POINTS = 2;
export const TRADER_EXTRA_PURCHASES = 1;
/** Protector (`zero-risk`) payout tiers by the pre-board win chance, highest first. */
export const PROTECTOR_TIERS = [{ minPercent: 80, bb: 50 }, { minPercent: 70, bb: 30 }, { minPercent: 60, bb: 20 }] as const;

/** Final round: the allocated placement award is doubled. Any Quads qualifies. */
export function quadCorePlacementBonus(player: Pick<PlayerState, "abilityId">, hand: HandValue, round: Round, placementPoints: number, rules: RuleContext = {}): number {
  return player.abilityId === "quad-core" && isFinalRound(round, rules) && hand.category === "QUADS" && placementPoints > 0 ? placementPoints : 0;
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
export function madeAbilityReward(player: Pick<PlayerState, "abilityId" | "firstCardId" | "ownedCardIds">, hand: HandValue, _round?: Round, _rules?: RuleContext): { bb: number; points: number } {
  if (player.abilityId === "architect" && hand.category === "FULL_HOUSE") return { bb: 30, points: 0 };
  // Underdog: trips or better whose BEST 5 holds one of the player's own deuces, win or lose. A board deuce does not count.
  if (player.abilityId === "underdog" && TRIPS_OR_BETTER.has(hand.category) && hand.bestFive.some(card => card.rank === 2 && player.ownedCardIds.includes(card.id)))
    return { bb: 0, points: UNDERDOG_POINTS };
  return { bb: 0, points: 0 };
}
