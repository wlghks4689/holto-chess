import { rankToChar, type Card } from "../core/poker/cards";

export type PreflopStrength = {
  score: number;
  tier: "S" | "A" | "B" | "C" | "D" | "E";
  features: string[];
};

export type StrategicCardValue = {
  currentRoundStrength?: PreflopStrength;
  futureAssetValue: number;
  poolDenialValue: number;
};

const RANKS_DESC = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function holdemCell(high: number, low: number, suited: boolean): number {
  if (high === low) return clamp(32 + (high - 2) * 5.15);
  const gap = high - low - 1;
  const broadway = Number(high >= 10) + Number(low >= 10);
  const ace = high === 14 ? 8 : 0;
  const connected = gap === 0 ? 7 : gap === 1 ? 4 : gap === 2 ? 1 : -Math.min(10, gap * 1.8);
  return clamp(5 + (high - 2) * 2.7 + (low - 2) * 1.45 + broadway * 4.5 + ace + connected + (suited ? 8 : 0));
}

/**
 * Complete 169-combination lookup. Keys use the conventional AA / AKs / AKo form.
 * It is intentionally data-only at the evaluator boundary so a supplied balance
 * matrix can replace these values without changing parsing, tiers, AI, or UI.
 */
export const HOLDEM_PREFLOP_MATRIX: Readonly<Record<string, number>> = Object.freeze(Object.fromEntries(
  RANKS_DESC.flatMap((left) => RANKS_DESC.map((right) => {
    const high = Math.max(left, right); const low = Math.min(left, right);
    const key = high === low ? `${rankToChar(high)}${rankToChar(low)}`
      : `${rankToChar(high)}${rankToChar(low)}${left > right ? "s" : "o"}`;
    return [key, holdemCell(high, low, left > right)] as const;
  })),
));

function tier(score: number, thresholds: readonly [number, PreflopStrength["tier"]][]): PreflopStrength["tier"] {
  return thresholds.find(([minimum]) => score >= minimum)?.[1] ?? "E";
}

export function holdemPreflopStrength(cards: readonly Card[]): PreflopStrength {
  if (cards.length !== 2 || cards[0]!.id === cards[1]!.id) throw new Error("Hold'em preflop strength requires two distinct cards");
  const [first, second] = cards;
  const high = Math.max(first.rank, second.rank); const low = Math.min(first.rank, second.rank);
  const pair = high === low; const suited = first.suit === second.suit;
  const key = pair ? `${rankToChar(high)}${rankToChar(low)}` : `${rankToChar(high)}${rankToChar(low)}${suited ? "s" : "o"}`;
  const score = HOLDEM_PREFLOP_MATRIX[key];
  if (score === undefined) throw new Error(`Missing Hold'em preflop matrix entry: ${key}`);
  return {
    score,
    tier: tier(score, [[88, "S"], [75, "A"], [62, "B"], [48, "C"], [34, "D"]]),
    features: [pair ? `pocket-pair:${rankToChar(high)}` : suited ? "suited" : "offsuit"],
  };
}

const combinations = (cards: readonly Card[]): [Card, Card][] => cards.flatMap((card, index) =>
  cards.slice(index + 1).map((other) => [card, other] as [Card, Card]));

export function omahaPreflopStrength(cards: readonly Card[]): PreflopStrength {
  if (cards.length !== 4 || new Set(cards.map((card) => card.id)).size !== 4) throw new Error("Omaha preflop strength requires four distinct cards");
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const counts = [...ranks.reduce((map, rank) => map.set(rank, (map.get(rank) ?? 0) + 1), new Map<number, number>())]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const pairs = counts.filter(([, count]) => count === 2).map(([rank]) => rank);
  const trips = counts.find(([, count]) => count === 3)?.[0];
  const quads = counts.find(([, count]) => count === 4)?.[0];
  const suits = [...cards.reduce((map, card) => map.set(card.suit, [...(map.get(card.suit) ?? []), card.rank]), new Map<string, number[]>()).values()];
  const suitedGroups = suits.filter((group) => group.length >= 2);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  const gaps = combinations(uniqueRanks.map((rank) => ({ rank } as Card))).map(([a, b]) => Math.abs(a.rank - b.rank) - 1);
  const adjacent = gaps.filter((gap) => gap === 0).length;
  const oneGap = gaps.filter((gap) => gap === 1).length;
  const twoGap = gaps.filter((gap) => gap === 2).length;
  const broadway = cards.filter((card) => card.rank >= 10).length;
  const features: string[] = [];
  let score = 20 + ranks.reduce((sum, rank) => sum + (rank - 2) * 0.85, 0);

  if (pairs.length) {
    const highPair = Math.max(...pairs);
    score += 10 + (highPair - 2) * 1.5;
    features.push(`pocket-pair:${rankToChar(highPair)}`);
    if (pairs.length === 2) { score += 11 + Math.min(...pairs) * 0.35; features.push("two-pair-structure"); }
  }
  if (suitedGroups.length >= 2) { score += 14; features.push("double-suited"); }
  else if (suitedGroups.length === 1) { score += 7; features.push("single-suited"); }
  if (suitedGroups.some((group) => group.includes(14))) { score += 5; features.push("nut-suit"); }
  if (adjacent) { score += Math.min(13, adjacent * 4); features.push("connected"); }
  if (oneGap) { score += Math.min(6, oneGap * 2); features.push("one-gap"); }
  if (twoGap) { score += Math.min(3, twoGap); features.push("two-gap"); }
  if (broadway >= 2) { score += broadway * 2.5; features.push(`broadway:${broadway}`); }

  const highestPair = pairs.length ? Math.max(...pairs) : undefined;
  const sideRanks = highestPair ? uniqueRanks.filter((rank) => rank !== highestPair) : uniqueRanks;
  const sideConnected = sideRanks.some((rank, index) => sideRanks.slice(index + 1).some((other) => Math.abs(rank - other) <= 2));
  if (highestPair && highestPair >= 11 && sideConnected) { score += 7; features.push("high-pair-connectivity"); }
  if (highestPair === 14 && sideRanks.some((rank) => rank >= 10) && sideConnected) { score += 8; features.push("aa-connectivity"); }

  const useful = cards.map((card) => cards.some((other) => other.id !== card.id &&
    (other.rank === card.rank || other.suit === card.suit || Math.abs(other.rank - card.rank) <= 2 || card.rank >= 10)));
  if (useful.some((value) => !value)) { score -= 8; features.push("dangler"); }
  if (highestPair && highestPair <= 6 && !sideConnected && suitedGroups.length === 0) { score -= 8; features.push("low-disconnected-pair"); }
  if (trips) { score -= 11; features.push(`trips-in-hole:${rankToChar(trips)}`); }
  if (quads) { score -= 14; features.push(`quads-in-hole:${rankToChar(quads)}`); }

  // Exactly-two-hole Omaha still gives AAxx meaningful showdown equity. Repeated
  // aces are inefficient now, but never erase their multi-round asset value.
  const aceCount = cards.filter((card) => card.rank === 14).length;
  if (aceCount >= 2) score = Math.max(score, aceCount === 2 ? 55 : aceCount === 3 ? 48 : 50);
  score = clamp(score);
  return { score, tier: tier(score, [[85, "S"], [72, "A"], [58, "B"], [44, "C"], [30, "D"]]), features };
}

export function futureAssetValue(cards: readonly Card[]): number {
  if (!cards.length) return 0;
  const counts = [...cards.reduce((map, card) => map.set(card.rank, (map.get(card.rank) ?? 0) + 1), new Map<number, number>()).entries()];
  const maxCount = Math.max(...counts.map(([, count]) => count));
  const bestRank = Math.max(...counts.filter(([, count]) => count === maxCount).map(([rank]) => rank));
  const suitMax = Math.max(...[...cards.reduce((map, card) => map.set(card.suit, (map.get(card.suit) ?? 0) + 1), new Map<string, number>()).values()]);
  const connectedPairs = combinations(cards).filter(([a, b]) => a.rank !== b.rank && Math.abs(a.rank - b.rank) <= 2).length;
  const made = maxCount === 4 ? 88 + bestRank * 0.8 : maxCount === 3 ? 60 + bestRank * 1.2 : maxCount === 2 ? 30 + bestRank * 1.5 : 12;
  return clamp(made + Math.max(0, suitMax - 1) * 4 + connectedPairs * 2 + cards.filter((card) => card.rank >= 10).length * 2);
}

export function poolDenialValue(cards: readonly Card[]): number {
  if (!cards.length) return 0;
  const counts = [...cards.reduce((map, card) => map.set(card.rank, (map.get(card.rank) ?? 0) + 1), new Map<number, number>()).entries()];
  return clamp(counts.reduce((sum, [rank, count]) => sum + count * count * (rank / 14) * 6.25, 0));
}

export function strategicCardValue(round: number, cards: readonly Card[]): StrategicCardValue {
  const currentRoundStrength = round === 1 && cards.length === 2 ? holdemPreflopStrength(cards)
    : round === 3 && cards.length === 4 ? omahaPreflopStrength(cards) : undefined;
  return { currentRoundStrength, futureAssetValue: futureAssetValue(cards), poolDenialValue: poolDenialValue(cards) };
}
