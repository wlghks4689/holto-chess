import type { Card } from "../core/poker/cards";
import { evaluateFive } from "../core/poker/evaluate";
import { BALANCE, cardPrice, FINAL_AUCTION_MIN_RAISE_BB, isAuctionRound, R3_AUCTION } from "./config";
import { scoreBotPlan } from "./botStrategy";
import { auctionBudget, auctionMaxWins, bestFinalLoadout, bidFinalAuction, botReaction } from "./finalAuction";
import { omahaPreflopStrength } from "./preflopStrength";
import type { PorenaGameState } from "./types";

/** Deliberately cannot accept game state, bidder IDs, or future boards. */
export type AuctionBotInput = {
  owned: Card[]; originalIds: string[]; leadingCards: Card[]; opponents: Card[][];
  offers: { card: Card; highestAmount: number | null; isMine: boolean }[];
  availableBB: number; stackBB: number; leadingCount: number;
};
export function chooseAuctionBotBid(input: AuctionBotInput) {
  if (input.leadingCount >= 2) return null;
  const known = [...input.owned, ...input.leadingCards], allPublic = [...known, ...input.opponents.flat()];
  const loadout = (cards: Card[]) => bestFinalLoadout(cards, input.originalIds).map(id => cards.find(c => c.id === id)!);
  const base = loadout(known);
  const seed = allPublic.map(c => c.id).sort().join(",");
  // R4 already evaluates five owned + five board; reuse its public-information model.
  const baseline = scoreBotPlan(4, base, input.stackBB, seed, { sharedKnown: allPublic, fastUnrestricted: true });
  const candidates = input.offers.filter(o => !o.isMine).map(offer => {
    const amount = offer.highestAmount === null ? cardPrice(offer.card.rank) : offer.highestAmount + FINAL_AUCTION_MIN_RAISE_BB;
    const selected = loadout([...known, offer.card]);
    const score = scoreBotPlan(4, selected, input.stackBB - amount, seed, { sharedKnown: [...allPublic, offer.card], fastUnrestricted: true });
    const madeGain = selected.length === 5 && base.length === 5 ? BALANCE.handScores[evaluateFive(selected).category] - BALANCE.handScores[evaluateFive(base).category] : 0;
    const block = Math.min(2, input.opponents.filter(hand => hand.filter(c => c.rank === offer.card.rank).length >= 2 || hand.filter(c => c.suit === offer.card.suit).length >= 4).length);
    const gain = score.expectedHandScore - baseline.expectedHandScore + (score.equity - baseline.equity) * 12 + Math.max(0, madeGain) * 0.3;
    const maxWillingBid = Math.max(0, Math.floor(Math.max(0, gain) * BALANCE.stackScoreUnitBB + block * 2 + cardPrice(offer.card.rank) * 0.25));
    return { cardId: offer.card.id, expectedHighestAmount: offer.highestAmount, amount, utility: maxWillingBid - amount };
  }).filter(c => c.amount <= input.availableBB && c.utility >= 0).sort((a, b) => b.utility - a.utility || a.cardId.localeCompare(b.cardId));
  const choice = candidates[0];
  return choice ? { cardId: choice.cardId, expectedHighestAmount: choice.expectedHighestAmount, amount: choice.amount } : null;
}

/** BB a bot pays per point of Omaha preflop strength (0-100) over the typical card on offer. */
const R3_STRENGTH_BB = 0.8;

/**
 * Six-round R3: a seat holding three cards adds one for its four-card Omaha hand. Losing the auction
 * means buying a typical leftover at double price, so a card is worth that cost plus the strength it
 * adds over the typical offer (less, when it is weaker than typical).
 */
export function chooseCardAuctionBotBid(input: Omit<AuctionBotInput, "originalIds"> & { maxWins: number; minRaiseBB: number }) {
  if (input.leadingCount >= input.maxWins || input.owned.length !== 3) return null;
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const strength = (card: Card) => omahaPreflopStrength([...input.owned, card]).score;
  const typical = median(input.offers.map(offer => strength(offer.card)));
  const fallbackCost = R3_AUCTION.buybackMultiplier * median(input.offers.map(offer => cardPrice(offer.card.rank)));
  const candidates = input.offers.filter(o => !o.isMine).map(offer => {
    const amount = offer.highestAmount === null ? cardPrice(offer.card.rank) : offer.highestAmount + input.minRaiseBB;
    const maxWillingBid = Math.floor(fallbackCost + (strength(offer.card) - typical) * R3_STRENGTH_BB);
    return { cardId: offer.card.id, expectedHighestAmount: offer.highestAmount, amount, utility: maxWillingBid - amount };
  }).filter(c => c.amount <= input.availableBB && c.utility >= 0).sort((a, b) => b.utility - a.utility || a.cardId.localeCompare(b.cardId));
  const choice = candidates[0];
  return choice ? { cardId: choice.cardId, expectedHighestAmount: choice.expectedHighestAmount, amount: choice.amount } : null;
}

export function tickAuctionBots(source: PorenaGameState, humanIds: readonly string[], now: number): PorenaGameState {
  if (source.phase !== "FINAL_AUCTION" || !source.finalAuction || source.finalAuction.settledAt !== null || now >= source.finalAuction.endsAt || now < source.finalAuction.startedAt) return source;
  if (!source.players.some(p => !p.eliminated && !humanIds.includes(p.id) && now >= (source.finalAuction!.botNextAt[p.id] ?? Infinity))) return source;
  let state = structuredClone(source);
  for (const playerId of state.players.filter(p => !p.eliminated && !humanIds.includes(p.id)).map(p => p.id)) {
    const a = state.finalAuction!, player = state.players.find(p => p.id === playerId)!;
    if (now < (a.botNextAt[player.id] ?? Infinity)) continue;
    const card = (id: string) => state.ownershipCardPool.find(e => e.card.id === id)!.card;
    const budget = auctionBudget(state, player.id);
    const input = { owned: player.ownedCardIds.map(card), originalIds: a.originalCardIds[player.id] ?? [],
      leadingCards: Object.entries(a.bids).filter(([, bid]) => bid.playerId === player.id).map(([id]) => card(id)),
      opponents: state.players.filter(p => !p.eliminated && p.id !== player.id).map(p => p.ownedCardIds.map(card)),
      offers: a.cardIds.map(id => ({ card: card(id), highestAmount: a.bids[id]?.amount ?? null, isMine: a.bids[id]?.playerId === player.id })),
      availableBB: budget.availableBidBB, stackBB: player.stackBB, leadingCount: budget.leadingCount };
    const choice = isAuctionRound(state.round, state)
      ? chooseCardAuctionBotBid({ ...input, maxWins: auctionMaxWins(a), minRaiseBB: a.minRaiseBB ?? R3_AUCTION.minRaiseBB })
      : chooseAuctionBotBid(input);
    if (choice) state = bidFinalAuction(state, player.id, choice, now);
    state.finalAuction!.botNextAt[player.id] = now + 2_000 + botReaction(state.finalAuction!.bidSequence + state.players.findIndex(p => p.id === player.id));
  }
  return state;
}
