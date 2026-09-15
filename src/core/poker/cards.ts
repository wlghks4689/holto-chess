/** Card model and deck rules adapted from holdem-game/src/holdem/cards.ts. */
export type Suit = "s" | "h" | "d" | "c";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Card = { id: string; rank: Rank; suit: Suit };

export const SUITS: Suit[] = ["c", "d", "h", "s"];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const SUIT_SYMBOL: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const RANK_NAMES = "23456789TJQKA";

export function rankToChar(rank: number): string {
  return rank >= 2 && rank <= 14 ? (RANK_NAMES[rank - 2] ?? "?") : "?";
}

export function cardId(rank: Rank, suit: Suit): string {
  return `${rankToChar(rank)}${suit}`;
}

export function cardLabel(card: Card): string {
  return `${rankToChar(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

export function makeDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: cardId(rank, suit), rank, suit })));
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
