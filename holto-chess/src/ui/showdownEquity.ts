import { makeDeck, type Card } from "../core/poker/cards";
import { compareHands, findBestFive, findBestOmaha } from "../core/poker/evaluate";
import type { Round } from "../game/types";

const REQUIRED_CARDS: Record<Round, number> = { 1: 2, 2: 2, 3: 4, 4: 5, 5: 7 };
const SAMPLES: Record<Round, number> = { 1: 1200, 2: 1200, 3: 600, 4: 240, 5: 1 };

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Heads-up pre-board equity, optionally excluding other known dead cards. */
export function showdownEquity(round: Round, left: readonly Card[], right: readonly Card[], deadCards: readonly Card[] = []): [number, number] | null {
  const required = REQUIRED_CARDS[round];
  if (left.length !== required || right.length !== required) return null;
  const shown = [...left, ...right], shownIds = new Set(shown.map((card) => card.id));
  const deadIds = new Set(deadCards.map((card) => card.id));
  if (shownIds.size !== shown.length || deadIds.size !== deadCards.length) return null;
  const ids = new Set([...shownIds, ...deadIds]);
  const evaluate = (cards: readonly Card[], board: readonly Card[]) => round === 3
    ? findBestOmaha(cards, board)
    : findBestFive([...cards, ...board]);
  if (round === 5) {
    const comparison = compareHands(evaluate(left, []), evaluate(right, []));
    return comparison === 0 ? [50, 50] : comparison > 0 ? [100, 0] : [0, 100];
  }
  const available = makeDeck().filter((card) => !ids.has(card.id));
  // Sampling must depend on the card set, not on how cards were acquired or ordered in state.
  const canonicalCardIds = [...ids].sort();
  const canonicalHands = [left, right].map((hand) => hand.map((card) => card.id).sort().join(",")).sort();
  const random = seededRandom(`${round}:${canonicalCardIds.join(":")}:${canonicalHands.join("|")}`);
  let leftShare = 0;
  for (let sample = 0; sample < SAMPLES[round]; sample += 1) {
    const deck = [...available];
    for (let index = 0; index < 5; index += 1) {
      const picked = index + Math.floor(random() * (deck.length - index));
      [deck[index], deck[picked]] = [deck[picked]!, deck[index]!];
    }
    const board = deck.slice(0, 5);
    const comparison = compareHands(evaluate(left, board), evaluate(right, board));
    leftShare += comparison > 0 ? 1 : comparison === 0 ? 0.5 : 0;
  }
  const leftPercent = Math.round(leftShare * 100 / SAMPLES[round]);
  return [leftPercent, 100 - leftPercent];
}
