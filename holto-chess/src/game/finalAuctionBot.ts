import type { Card } from "../core/poker/cards";
import { evaluateFive } from "../core/poker/evaluate";
import { BALANCE, cardPrice, FINAL_AUCTION_MIN_RAISE_BB, isAuctionRound, R3_AUCTION } from "./config";
import { scoreBotPlan } from "./botStrategy";
import { auctionBudget, auctionMaxWins, bestFinalLoadout, bidFinalAuction, botReaction } from "./finalAuction";
import { handStructure } from "./auctionCardValue";
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

/**
 * Share of its spendable BB a bot will commit to one R3 card, by the card's 1-20 combination score.
 * Aggressive curve: 10 → about 28%, 14 → about 54%, 17 → about 76%, 20 → all of it; 4 and below
 * only at the opening price.
 */
export function auctionSpendShare(value: number): number {
  return value <= 4 ? 0 : Math.min(1, ((value - 4) / 16) ** 1.3);
}

/** What a bot knows in the R3 auction: public hands and bids, never future boards. */
export type CardAuctionBotInput = {
  offers: { card: Card; highestAmount: number | null; isMine: boolean }[];
  /** This seat's 1-20 score per auction card, and the best score any other seat has for it. */
  values: Record<string, number>; rivalValues: Record<string, number>;
  availableBB: number; leadingCount: number; maxWins: number; minRaiseBB: number;
  /** 0 when far from R3 elimination with a strong hand, 1 when at the bottom with a weak one. */
  urgency: number;
};

/**
 * Six-round R3: chase the card with the best combination score, but only up to what it is worth.
 * A card's ceiling is its opening price plus its share (by score) of the spendable BB, raised for a
 * weak hand, a seat near elimination, or a card far better than any still-unbid alternative. When the best card's price passes that ceiling the bot moves
 * to the next-best card it can still afford, preferring one nobody needs more. A seat already leading
 * stays put unless another card is clearly better (2 points) and affordable; moving its bid frees
 * the old card back to no bid.
 */
export function chooseCardAuctionBotBid(input: CardAuctionBotInput) {
  const leading = input.offers.filter((offer) => offer.isMine);
  if (input.leadingCount >= input.maxWins && input.maxWins !== 1) return null;
  // Moving the single allowed bid releases its reservation.
  const spendable = input.availableBB + leading.reduce((sum, offer) => sum + (offer.highestAmount ?? 0), 0);
  const scale = 0.85 + 0.45 * Math.min(1, Math.max(0, input.urgency));
  const candidates = input.offers.filter((offer) => !offer.isMine).map((offer) => {
    const base = cardPrice(offer.card.rank);
    const amount = offer.highestAmount === null ? base : offer.highestAmount + input.minRaiseBB;
    const value = input.values[offer.card.id] ?? 1;
    // The worse the best still-unbid alternative, the longer this card is worth fighting for.
    const fallback = Math.max(1, ...input.offers.filter((other) => other !== offer && (other.highestAmount === null || other.isMine)).map((other) => input.values[other.card.id] ?? 1));
    const share = Math.min(1, auctionSpendShare(value) * scale + 0.5 * auctionSpendShare(4 + Math.max(0, value - fallback)));
    const ceiling = Math.min(spendable, Math.floor(base + share * Math.max(0, spendable - base)));
    // A rival who needs the card more will likely outbid; paying over the opening price costs value.
    const contest = Math.max(0, (input.rivalValues[offer.card.id] ?? 0) - value) * 0.25;
    const score = value - contest - 3 * Math.max(0, amount - base) / Math.max(1, spendable);
    return { cardId: offer.card.id, expectedHighestAmount: offer.highestAmount, amount, value, score, room: ceiling - amount };
  }).filter((c) => c.room >= 0 && c.amount <= spendable)
    .sort((a, b) => b.score - a.score || b.room - a.room || a.amount - b.amount || a.cardId.localeCompare(b.cardId));
  const choice = candidates[0];
  if (!choice) return null;
  const held = leading[0] ? input.values[leading[0].card.id] ?? 1 : undefined;
  if (held !== undefined && choice.score < held + 2) return null;
  return { cardId: choice.cardId, expectedHighestAmount: choice.expectedHighestAmount, amount: choice.amount };
}

/** A seat's cached card scores, the best other seat's score per card, and how urgently it needs a card. */
function cardAuctionContext(state: PorenaGameState, playerId: string): Pick<CardAuctionBotInput, "values" | "rivalValues" | "urgency"> {
  const a = state.finalAuction!;
  const alive = state.players.filter((p) => !p.eliminated);
  const values = a.cardValues?.[playerId] ?? {};
  const rivalValues = Object.fromEntries(a.cardIds.map((id) => [id, Math.max(0, ...alive.filter((p) => p.id !== playerId).map((p) => a.cardValues?.[p.id]?.[id] ?? 0))]));
  // Elimination risk by points rank (bottom two leave after R3) and a weak three-card hand.
  const ranked = [...alive].sort((x, y) => y.points - x.points);
  const risk = alive.length > 1 ? ranked.findIndex((p) => p.id === playerId) / (alive.length - 1) : 0;
  const owned = state.players.find((p) => p.id === playerId)!.ownedCardIds.map((id) => state.ownershipCardPool.find((e) => e.card.id === id)!.card);
  const weakness = 1 - Math.min(1, handStructure(owned) / 10);
  return { values, rivalValues, urgency: 0.6 * risk + 0.4 * weakness };
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
      ? chooseCardAuctionBotBid({ offers: input.offers, availableBB: input.availableBB, leadingCount: input.leadingCount,
        maxWins: auctionMaxWins(a), minRaiseBB: a.minRaiseBB ?? R3_AUCTION.minRaiseBB, ...cardAuctionContext(state, player.id) })
      : chooseAuctionBotBid(input);
    if (choice) state = bidFinalAuction(state, player.id, choice, now);
    state.finalAuction!.botNextAt[player.id] = now + 2_000 + botReaction(state.finalAuction!.bidSequence + state.players.findIndex(p => p.id === player.id));
  }
  return state;
}
