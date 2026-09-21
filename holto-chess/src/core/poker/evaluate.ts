import type { Card } from "./cards";

export type HandCategory = "HIGH_CARD" | "PAIR" | "TWO_PAIR" | "TRIPS" | "STRAIGHT" | "FLUSH" | "FULL_HOUSE" | "QUADS" | "STRAIGHT_FLUSH" | "ROYAL_FLUSH";
export type HandValue = { category: HandCategory; categoryRank: number; kickers: number[]; bestFive: Card[]; displayName: string };

const CATEGORY_RANK: Record<HandCategory, number> = {
  HIGH_CARD: 1, PAIR: 2, TWO_PAIR: 3, TRIPS: 4, STRAIGHT: 5,
  FLUSH: 6, FULL_HOUSE: 7, QUADS: 8, STRAIGHT_FLUSH: 9, ROYAL_FLUSH: 10,
};

const CATEGORY_NAME: Record<HandCategory, string> = {
  HIGH_CARD: "하이카드", PAIR: "원페어", TWO_PAIR: "투페어", TRIPS: "트립스",
  STRAIGHT: "스트레이트", FLUSH: "플러시", FULL_HOUSE: "풀하우스",
  QUADS: "포카드", STRAIGHT_FLUSH: "스트레이트 플러시", ROYAL_FLUSH: "로열 플러시",
};

function value(category: HandCategory, kickers: number[], cards: Card[]): HandValue {
  return { category, categoryRank: CATEGORY_RANK[category], kickers, bestFive: cards, displayName: CATEGORY_NAME[category] };
}

/** Five-card evaluator derived from the verified holdem-game evaluator. */
export function evaluateFive(cards: Card[]): HandValue {
  if (cards.length !== 5) throw new Error("evaluateFive requires exactly five cards");
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0]!.suit);
  const counts = [...ranks.reduce((map, rank) => map.set(rank, (map.get(rank) ?? 0) + 1), new Map<number, number>()).entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const unique: number[] = [...new Set<number>(ranks)].sort((a, b) => b - a);
  const wheel = [14, 5, 4, 3, 2].every((rank) => unique.includes(rank));
  let straightHigh = wheel ? 5 : 0;
  for (let i = 0; !straightHigh && i <= unique.length - 5; i += 1) {
    if (unique[i]! - unique[i + 4]! === 4) straightHigh = unique[i]!;
  }
  if (straightHigh && flush) return value(straightHigh === 14 ? "ROYAL_FLUSH" : "STRAIGHT_FLUSH", [straightHigh], cards);
  if (counts[0]?.[1] === 4) return value("QUADS", [counts[0][0], counts[1]![0]], cards);
  if (counts[0]?.[1] === 3 && counts[1]?.[1] === 2) return value("FULL_HOUSE", [counts[0][0], counts[1][0]], cards);
  if (flush) return value("FLUSH", ranks, cards);
  if (straightHigh) return value("STRAIGHT", [straightHigh], cards);
  if (counts[0]?.[1] === 3) return value("TRIPS", [counts[0][0], ...ranks.filter((rank) => rank !== counts[0]![0]).slice(0, 2)], cards);
  if (counts[0]?.[1] === 2 && counts[1]?.[1] === 2) {
    const high = Math.max(counts[0][0], counts[1][0]);
    const low = Math.min(counts[0][0], counts[1][0]);
    return value("TWO_PAIR", [high, low, ranks.find((rank) => rank !== high && rank !== low)!], cards);
  }
  if (counts[0]?.[1] === 2) return value("PAIR", [counts[0][0], ...ranks.filter((rank) => rank !== counts[0]![0]).slice(0, 3)], cards);
  return value("HIGH_CARD", ranks, cards);
}

/** Current made hand before five cards exist. Used for pre-board street labels only. */
export function evaluatePartial(cards: readonly Card[]): HandValue {
  if (cards.length < 1 || cards.length > 4) throw new Error("Partial hand requires between one and four cards");
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const counts = [...ranks.reduce((map, rank) => map.set(rank, (map.get(rank) ?? 0) + 1), new Map<number, number>()).entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (counts[0]?.[1] === 4) return value("QUADS", [counts[0][0]], [...cards]);
  if (counts[0]?.[1] === 3) return value("TRIPS", [counts[0][0], ...ranks.filter((rank) => rank !== counts[0]![0])], [...cards]);
  if (counts[0]?.[1] === 2 && counts[1]?.[1] === 2) return value("TWO_PAIR", [Math.max(counts[0][0], counts[1][0]), Math.min(counts[0][0], counts[1][0])], [...cards]);
  if (counts[0]?.[1] === 2) return value("PAIR", [counts[0][0], ...ranks.filter((rank) => rank !== counts[0]![0])], [...cards]);
  return value("HIGH_CARD", ranks, [...cards]);
}

/** Compares category and rank kickers only. Suits never break an exact poker tie. */
export function compareHands(a: Pick<HandValue, "categoryRank" | "kickers">, b: Pick<HandValue, "categoryRank" | "kickers">): number {
  if (a.categoryRank !== b.categoryRank) return a.categoryRank - b.categoryRank;
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i += 1) {
    const delta = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
    if (delta) return delta;
  }
  return 0;
}

export function combinations<T>(items: readonly T[], choose: number): T[][] {
  const output: T[][] = [];
  const visit = (start: number, picked: T[]) => {
    if (picked.length === choose) { output.push([...picked]); return; }
    for (let i = start; i <= items.length - (choose - picked.length); i += 1) {
      picked.push(items[i]!); visit(i + 1, picked); picked.pop();
    }
  };
  visit(0, []);
  return output;
}

/** Generalized 5–10 card BEST 5. Deterministic ties use card ids only to choose presentation cards, never player rank. */
export function findBestFive(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 10) throw new Error("BEST 5 requires between 5 and 10 cards");
  let best: HandValue | null = null;
  for (const five of combinations(cards, 5)) {
    const candidate = evaluateFive(five);
    const comparison = best ? compareHands(candidate, best) : 1;
    if (comparison > 0 || (comparison === 0 && five.map((card) => card.id).sort().join("") > best!.bestFive.map((card) => card.id).sort().join(""))) best = candidate;
  }
  return best!;
}

/** Pre-board display only: Omaha can use two hole cards, never trips/quads from four holes. */
export function evaluateOmahaPreflop(holes: readonly Card[]): HandValue {
  if (holes.length !== 4) throw new Error("Omaha preflop requires four hole cards");
  let best: HandValue | null = null;
  for (const pair of combinations(holes, 2)) {
    const candidate = evaluatePartial(pair);
    if (!best || compareHands(candidate, best) > 0) best = candidate;
  }
  return best!;
}

/** Omaha: exactly two owned cards and exactly three board cards. */
export function findBestOmaha(holes: readonly Card[], board: readonly Card[]): HandValue {
  if (holes.length < 2 || board.length < 3) throw new Error("Omaha requires at least two hole and three board cards");
  let best: HandValue | null = null;
  for (const holeTwo of combinations(holes, 2)) for (const boardThree of combinations(board, 3)) {
    const candidate = evaluateFive([...holeTwo, ...boardThree]);
    if (!best || compareHands(candidate, best) > 0) best = candidate;
  }
  return best!;
}

export function rankPlayers(entries: { playerId: string; hand: HandValue }[]): string[][] {
  const sorted = [...entries].sort((a, b) => compareHands(b.hand, a.hand));
  const groups: string[][] = [];
  for (const entry of sorted) {
    const previous = sorted.find((item) => item.playerId === groups.at(-1)?.[0]);
    if (previous && compareHands(previous.hand, entry.hand) === 0) groups.at(-1)!.push(entry.playerId);
    else groups.push([entry.playerId]);
  }
  return groups;
}

/** Competition ranking: a two-player tie for first makes the next place third. */
export function placeInRanking(ranking: readonly string[][], playerId: string): number {
  let playersAhead = 0;
  for (const group of ranking) {
    if (group.includes(playerId)) return playersAhead + 1;
    playersAhead += group.length;
  }
  throw new Error(`Player ${playerId} is missing from ranking`);
}
