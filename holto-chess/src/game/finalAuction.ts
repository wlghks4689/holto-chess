import { combinations, compareHands, evaluateFive } from "../core/poker/evaluate";
import { assertPoolIntegrity } from "./cardPool";
import { cardPrice, FINAL_AUCTION_DURATION_MS, FINAL_AUCTION_HARD_CAP_MS, FINAL_AUCTION_SNIPE_WINDOW_MS, FINAL_AUCTION_MIN_RAISE_BB, FINAL_AUCTION_MAX_WINS, AUCTION_REVEAL_MS, FINAL_LOADOUT_SIZE, FINAL_LOADOUT_TIMEOUT_MS, FINAL_BOT_REACTION_MS, R3_AUCTION, isAuctionRound } from "./config";
import type { FinalAuctionState, PorenaGameState } from "./types";
import type { Card } from "../core/poker/cards";
import { combinationScore } from "./auctionCardValue";

/** The most cards one seat may lead on, and win. */
export const auctionMaxWins = (auction: Pick<FinalAuctionState, "maxWins">) => auction.maxWins ?? FINAL_AUCTION_MAX_WINS;
/** Smallest raise over the current highest bid. */
export const auctionMinRaise = (auction: Pick<FinalAuctionState, "minRaiseBB">) => auction.minRaiseBB ?? FINAL_AUCTION_MIN_RAISE_BB;

export function auctionBudget(state: PorenaGameState, playerId: string) {
  const player = state.players.find(p => p.id === playerId)!;
  const bids = Object.values(state.finalAuction?.bids ?? {}).filter(bid => bid.playerId === playerId);
  const reservedBB = bids.reduce((sum, bid) => sum + bid.amount, 0);
  return { stackBB: player.stackBB, reservedBB, availableBidBB: player.stackBB - reservedBB, leadingCount: bids.length };
}

export function beginFinalAuction(source: PorenaGameState, now: number): PorenaGameState {
  const state = structuredClone(source);
  if (state.round !== 5 || state.finalAuction) throw new Error("AUCTION_CLOSED");
  for (const entry of state.ownershipCardPool) if (entry.state === "RESERVED_IN_SHOP") {
    entry.state = "AVAILABLE"; delete entry.reservedPlayerId;
  }
  for (const p of state.players) { p.shopCardIds = []; p.lockedShopCardIds = []; p.shopLocked = false; }
  const alive = state.players.filter(p => !p.eliminated);
  const cardIds = state.ownershipCardPool.filter(e => e.state === "AVAILABLE").map(e => e.card.id);
  state.finalAuction = { cardIds, startedAt: now, endsAt: now + FINAL_AUCTION_DURATION_MS,
    hardEndsAt: now + FINAL_AUCTION_HARD_CAP_MS, bids: {}, bidSequence: 0, settledAt: null, results: null,
    originalCardIds: Object.fromEntries(alive.map(p => [p.id, [...p.ownedCardIds]])),
    botNextAt: Object.fromEntries(alive.map((p, i) => [p.id, now + 2_000 + i * 2_700])), outbid: {}, raises: {},
    ...(alive.length !== 4 || alive.some(p => p.ownedCardIds.length !== 5) || cardIds.length !== 32
      ? { poolWarning: `R5 pool: ${alive.length} survivors / ${alive.reduce((n, p) => n + p.ownedCardIds.length, 0)} owned / ${cardIds.length} available` } : {}) };
  state.phase = "FINAL_AUCTION";
  assertPoolIntegrity(state); return state;
}

/**
 * Six-round R3 auction over the given cards. A short rules intro comes first: every seat sees the
 * cards, and bidding opens for everyone at the same server time.
 */
export function beginCardAuction(source: PorenaGameState, now: number, cardIds: string[]): PorenaGameState {
  const state = structuredClone(source);
  if (!isAuctionRound(state.round, state) || state.finalAuction) throw new Error("AUCTION_CLOSED");
  for (const p of state.players) { p.shopCardIds = []; p.lockedShopCardIds = []; p.shopLocked = false; }
  const alive = state.players.filter(p => !p.eliminated);
  const opensAt = now + R3_AUCTION.introMs;
  state.finalAuction = { cardIds, startedAt: opensAt, endsAt: opensAt + FINAL_AUCTION_DURATION_MS,
    hardEndsAt: opensAt + FINAL_AUCTION_HARD_CAP_MS, bids: {}, bidSequence: 0, settledAt: null, results: null,
    originalCardIds: Object.fromEntries(alive.map(p => [p.id, [...p.ownedCardIds]])),
    botNextAt: Object.fromEntries(alive.map((p, i) => [p.id, opensAt + 2_000 + i * 2_700])), outbid: {}, raises: {},
    maxWins: R3_AUCTION.maxWins, minRaiseBB: R3_AUCTION.minRaiseBB,
    // Scored once while the rules intro is up: hands do not change during the auction.
    cardValues: Object.fromEntries(alive.map(p => [p.id, Object.fromEntries(cardIds.map(id => {
      const card = (cardId: string) => state.ownershipCardPool.find(e => e.card.id === cardId)!.card;
      return [id, combinationScore(p.ownedCardIds.map(card), card(id)).value];
    }))])),
    ...(cardIds.length !== R3_AUCTION.cardCount ? { poolWarning: `R3 pool: ${alive.length} players / ${cardIds.length} auction cards` } : {}) };
  state.phase = "FINAL_AUCTION";
  assertPoolIntegrity(state); return state;
}

/** A copy with every bid the seat leads removed; those cards go back to no bid. */
function releaseBids(source: PorenaGameState, playerId: string): PorenaGameState {
  const state = structuredClone(source), auction = state.finalAuction!;
  for (const [cardId, bid] of Object.entries(auction.bids)) if (bid.playerId === playerId) delete auction.bids[cardId];
  return state;
}

export type AuctionBid = { cardId: string; expectedHighestAmount: number | null; amount?: number };
export function bidFinalAuction(source: PorenaGameState, playerId: string, bid: AuctionBid, now: number): PorenaGameState {
  const a = source.finalAuction;
  const player = source.players.find(p => p.id === playerId);
  if (source.phase !== "FINAL_AUCTION" || !a || a.settledAt !== null || now >= a.endsAt || now < a.startedAt) throw new Error("AUCTION_CLOSED");
  if (!player || player.eliminated) throw new Error("NOT_AUCTION_PARTICIPANT");
  const entry = source.ownershipCardPool.find(e => e.card.id === bid.cardId);
  if (!a.cardIds.includes(bid.cardId) || !entry || entry.state !== "AVAILABLE") throw new Error("NOT_AUCTION_CARD");
  const current = a.bids[bid.cardId];
  if ((current?.amount ?? null) !== bid.expectedHighestAmount) throw new Error("STALE_PRICE");
  if (current?.playerId === playerId) throw new Error("ALREADY_LEADING");
  // The six-round R3 auction lets a seat at its limit move its bid: the card it was leading
  // returns to no bid at its opening price, so a seat still wins at most maxWins cards.
  const moving = isAuctionRound(source.round, source) && auctionBudget(source, playerId).leadingCount >= auctionMaxWins(a);
  const base = moving ? releaseBids(source, playerId) : source;
  const budget = auctionBudget(base, playerId);
  if (budget.leadingCount >= auctionMaxWins(a)) throw new Error("MAX_LEADING_REACHED");
  const amount = bid.amount ?? (current ? NaN : cardPrice(entry.card.rank));
  if (!Number.isSafeInteger(amount) || amount < 0 || (!current && amount !== cardPrice(entry.card.rank))) throw new Error("INVALID_AMOUNT");
  if (current && amount < current.amount + auctionMinRaise(a)) throw new Error("BELOW_MIN_RAISE");
  if (amount > budget.availableBidBB) throw new Error("INSUFFICIENT_BB");
  const state = moving ? base : structuredClone(source), auction = state.finalAuction!;
  const sequence = ++auction.bidSequence;
  auction.bids[bid.cardId] = { amount, playerId, sequence };
  if (current) {
    auction.outbid[current.playerId] = { cardId: bid.cardId, amount: current.amount, sequence };
    auction.raises[bid.cardId] = (auction.raises[bid.cardId] ?? 0) + 1;
    // A bot cannot retaliate in the same tick, even if its old deadline was overdue.
    auction.botNextAt[current.playerId] = now + botReaction(sequence);
  }
  if (auction.endsAt - now <= FINAL_AUCTION_SNIPE_WINDOW_MS) auction.endsAt = Math.min(now + FINAL_AUCTION_SNIPE_WINDOW_MS, auction.hardEndsAt);
  return state;
}

export function bestFinalLoadout(cards: readonly Card[], originalIds: readonly string[]): string[] {
  if (cards.length <= FINAL_LOADOUT_SIZE) return cards.map(c => c.id);
  const choices = combinations([...cards].sort((a, b) => a.id.localeCompare(b.id)), FINAL_LOADOUT_SIZE);
  const originalCount = (hand: Card[]) => hand.filter(c => originalIds.includes(c.id)).length;
  choices.sort((a, b) => compareHands(evaluateFive(b), evaluateFive(a)) || originalCount(b) - originalCount(a));
  return choices[0]!.map(c => c.id);
}

export function settleFinalAuction(source: PorenaGameState, now: number): PorenaGameState {
  const a = source.finalAuction;
  if (!a) throw new Error("AUCTION_CLOSED");
  if (a.settledAt !== null) return source;
  if (source.phase !== "FINAL_AUCTION" || now < a.endsAt) throw new Error("AUCTION_NOT_ENDED");
  // Validate all ledgers before performing any mutation.
  for (const p of source.players) {
    const b = auctionBudget(source, p.id);
    if (b.reservedBB > p.stackBB || b.leadingCount > auctionMaxWins(a)) throw new Error("INVALID_ESCROW");
  }
  for (const id of Object.keys(a.bids)) if (source.ownershipCardPool.find(e => e.card.id === id)?.state !== "AVAILABLE") throw new Error("INVALID_AUCTION_POOL");
  const state = structuredClone(source), auction = state.finalAuction!;
  auction.results = Object.entries(auction.bids).map(([cardId, bid]) => ({ cardId, playerId: bid.playerId, amount: bid.amount }));
  for (const result of auction.results) {
    const p = state.players.find(p => p.id === result.playerId)!;
    p.stackBB -= result.amount; p.ownedCardIds.push(result.cardId);
    const entry = state.ownershipCardPool.find(e => e.card.id === result.cardId)!;
    entry.state = "OWNED"; entry.ownerPlayerId = p.id;
  }
  auction.settledAt = now;
  auction.loadoutStartsAt = now + (auction.results.length ? AUCTION_REVEAL_MS : 0);
  // R3 has no loadout: the phase holds on the result reveal until the buyback (finishCardAuctionReveal).
  if (isAuctionRound(state.round, state)) { assertPoolIntegrity(state); return state; }
  auction.loadoutEndsAt = auction.loadoutStartsAt + FINAL_LOADOUT_TIMEOUT_MS;
  for (const p of state.players.filter(p => !p.eliminated)) {
    const cards = p.ownedCardIds.map(id => state.ownershipCardPool.find(e => e.card.id === id)!.card);
    p.finalLoadoutCardIds = bestFinalLoadout(cards, auction.originalCardIds[p.id] ?? []);
    p.finalLoadoutLocked = cards.length <= FINAL_LOADOUT_SIZE;
  }
  state.phase = "FINAL_LOADOUT"; assertPoolIntegrity(state); return state;
}

export function setFinalLoadout(source: PorenaGameState, playerId: string, ids: string[], now: number, lock = false): PorenaGameState {
  const a = source.finalAuction, p = source.players.find(p => p.id === playerId);
  if (source.phase !== "FINAL_LOADOUT" || !a || now < a.loadoutStartsAt! || now >= a.loadoutEndsAt!) throw new Error("LOADOUT_CLOSED");
  if (!p || p.eliminated || p.finalLoadoutLocked) throw new Error("LOADOUT_LOCKED");
  if (ids.length !== FINAL_LOADOUT_SIZE || new Set(ids).size !== ids.length || ids.some(id => !p.ownedCardIds.includes(id))) throw new Error("INVALID_LOADOUT");
  const state = structuredClone(source), player = state.players.find(p => p.id === playerId)!;
  player.finalLoadoutCardIds = [...ids]; player.finalLoadoutLocked = lock; return state;
}

export function botReaction(sequence: number): number {
  return FINAL_BOT_REACTION_MS.min + ((sequence * 7919) % (FINAL_BOT_REACTION_MS.max - FINAL_BOT_REACTION_MS.min + 1));
}
