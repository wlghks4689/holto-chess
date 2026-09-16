import { makeDeck, shuffle, type Card } from "../core/poker/cards";

/**
 * Creates an encounter-local deck. Only cards OWNED by this encounter's
 * participants are excluded; reservations and cards owned in other matches
 * deliberately remain eligible.
 */
export function createShowdownDeck(
  participantOwnedCards: readonly Card[],
  rng: () => number = Math.random,
): Card[] {
  const excludedIds = new Set(participantOwnedCards.map((card) => card.id));
  return shuffle(
    makeDeck().filter((card) => !excludedIds.has(card.id)),
    rng,
  );
}

/** Draws all runouts from one deck, so cards cannot repeat between boards. */
export function drawCommunityBoards(
  showdownDeck: readonly Card[],
  boardCount: number,
  cardsPerBoard = 5,
): Card[][] {
  if (!Number.isInteger(boardCount) || boardCount < 0) {
    throw new Error("Board count must be a non-negative integer");
  }
  const required = boardCount * cardsPerBoard;
  if (showdownDeck.length < required) {
    throw new Error(`Showdown deck needs ${required} cards`);
  }
  return Array.from({ length: boardCount }, (_, index) =>
    showdownDeck.slice(index * cardsPerBoard, (index + 1) * cardsPerBoard),
  );
}
