import type { Card } from "../core/poker/cards";

/**
 * How much one auction card adds to a three-card R3 hand for Omaha, as a 1-20 combination score.
 * The score is about the new four-card structure, not the card's rank alone:
 *
 *   1-2 unrelated · 3-5 weak help · 6-8 one clear route · 9-11 two or more routes
 *   12-14 strong Omaha structure · 15-17 premium · 18-20 near-ideal, several strong routes
 *
 * Points are summed from pair structure, suit structure, connectivity and nut potential, less
 * redundancy (trips, a third card of one suit), then mapped through a saturating curve so 19-20
 * needs an exceptional total and stays rare.
 */
export type CombinationScore = { value: number; raw: number; pair: number; suit: number; connect: number; nut: number; penalty: number };

/** A rank's place from deuce (0) to ace (1). */
const rankWeight = (rank: number) => (rank - 2) / 12;

/** Straight potential: every five-rank window, with the ace both low and high. */
function connectivity(cards: readonly Card[]): number {
  const ranks = new Set(cards.flatMap((card) => card.rank === 14 ? [14, 1] : [card.rank]));
  let total = 0;
  for (let low = 1; low <= 10; low += 1) {
    let count = 0;
    for (let rank = low; rank < low + 5; rank += 1) if (ranks.has(rank)) count += 1;
    const window = count >= 4 ? 3 : count === 3 ? 0.6 : 0;
    // Broadway straights are the nut straights.
    total += low === 10 ? window * 1.3 : window;
  }
  return total;
}

/** Points the three owned cards already make on their own, for a weakness read (not a 1-20 value). */
export function handStructure(owned: readonly Card[]): number {
  const byRank = new Map<number, number>();
  const bySuit = new Map<string, Card[]>();
  for (const card of owned) {
    byRank.set(card.rank, (byRank.get(card.rank) ?? 0) + 1);
    bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card]);
  }
  let points = connectivity(owned);
  for (const [rank, count] of byRank) if (count === 2) points += 2.5 + 5 * rankWeight(rank);
  for (const cards of bySuit.values()) if (cards.length === 2) points += 1 + (Math.max(...cards.map((card) => card.rank)) === 14 ? 2 : 0.8);
  return points;
}

export function combinationScore(owned: readonly Card[], card: Card): CombinationScore {
  const sameRank = owned.filter((other) => other.rank === card.rank).length;
  const ownedPairs = [...new Set(owned.map((other) => other.rank))].filter((rank) => rank !== card.rank && owned.filter((other) => other.rank === rank).length >= 2);
  const suited = owned.filter((other) => other.suit === card.suit);
  const otherSuitedPair = ["c", "d", "h", "s"].some((suit) => suit !== card.suit && owned.filter((other) => other.suit === suit).length >= 2);

  let pair = 0, suit = 0, nut = 0, penalty = 0;
  // Pair structure: a new pocket pair (aces far above deuces), a second pair for set and
  // full-house routes; trips and quads waste a card.
  const pairWeight = rankWeight(card.rank) ** 1.5;
  if (sameRank === 1) pair = ownedPairs.length ? 3 + 4 * pairWeight : 1.5 + 4 * pairWeight;
  else if (sameRank === 2) penalty -= 4;
  else if (sameRank >= 3) penalty -= 6;

  // Suit structure: a suited two-card combo (better with a high top card), double suited with
  // another suited pair; a third or fourth card of one suit only blocks its own flush outs.
  const topInSuit = Math.max(card.rank, ...suited.map((other) => other.rank));
  const quality = topInSuit === 14 ? 2 : topInSuit === 13 ? 1.2 : topInSuit >= 11 ? 0.8 : 0.4;
  if (suited.length === 1) suit = 0.6 + quality + (otherSuitedPair ? 2 : 0);
  // The ace joining two suited cards still turns their flush into the nut flush.
  else if (suited.length === 2) { suit = card.rank === 14 ? 2.5 : 0; penalty -= card.rank === 14 ? 1 : 1.5; }
  else if (suited.length >= 3) penalty -= 2.5;

  // Connectivity: how many more straight windows the card opens or fills.
  const connect = sameRank ? 0 : Math.max(0, connectivity([...owned, card]) - connectivity(owned));

  // Nut potential: the ace that pairs; a high card that joins a straight.
  if (card.rank === 14 && sameRank === 1) nut += 1;
  if (card.rank >= 10 && connect > 0) nut += 0.5;

  // Two or more real routes at once are worth more than their parts, and completing an already
  // strong three-card structure that way is what makes a premium or near-ideal card.
  const strongRoutes = Number(pair >= 3) + Number(suit >= 2) + Number(connect >= 1.5);
  const synergy = strongRoutes >= 2 ? 1.2 * (strongRoutes - 1) + 0.3 * handStructure(owned) : 0;

  // An isolated card (no pair, suit or straight help) adds nothing, whatever its rank.
  const raw = Math.max(0, pair + suit + connect + nut + synergy + penalty);
  const value = Math.min(20, Math.max(1, Math.round(1 + 19 * (1 - Math.exp(-raw / 8)))));
  return { value, raw, pair, suit, connect, nut, penalty };
}
