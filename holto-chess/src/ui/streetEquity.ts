import { makeDeck, type Card } from "../core/poker/cards";
import { compareHands, findBestOmaha } from "../core/poker/evaluate";
import { finalFourWayEquity, r4ThreeWayEquity, scoreUnrestricted, showdownEquity } from "../game/showdownEquity";
import type { MatchView } from "../shared/protocol";
import type { CinematicFrame } from "./cinematicTimeline";

export const EQUITY_DELAY_MS = 300;
export const CARD_FLIP_MS = 420;
export const RIVER_FLIP_MS = 600;

/** Presentation clock only: never select a street merely because its data arrived. */
export function equityBoardCount(frames: readonly CinematicFrame[], boardIndex: number, elapsed: number): number {
  let count = 0;
  for (const frame of frames) {
    if (frame.boardIndex !== boardIndex) continue;
    const cards = frame.phase === "FLOP_3" ? 3 : frame.phase === "TURN" ? 4 : frame.phase === "RIVER" ? 5 : 0;
    if (cards && elapsed >= frame.at + (cards === 5 ? RIVER_FLIP_MS : CARD_FLIP_MS) + EQUITY_DELAY_MS) count = cards;
  }
  return count;
}

const cache = new Map<string, number[]>();

/** Inputs are exclusively visible hands, the released board prefix and public dead cards. */
export function visibleStreetEquity(hands: readonly (readonly Card[])[], board: readonly Card[], omaha: boolean, dead: readonly Card[] = []): number[] | null {
  if (hands.length < 2 || hands.some(h => h.length < (omaha ? 4 : 2)) || [...hands.flat(), ...board].some(c => c.hidden)) return null;
  const cards = [...hands.flat(), ...board];
  if (new Set(cards.map(c => c.id)).size !== cards.length || ![3, 4, 5].includes(board.length)) return null;
  const key = JSON.stringify([hands.map(h => h.map(c => c.id).sort()), board.map(c => c.id).sort(), omaha, dead.map(c => c.id).sort()]);
  const saved = cache.get(key);
  if (saved) return saved;
  const excluded = new Set([...cards, ...dead.filter(c => !c.hidden)].map(c => c.id));
  const deck = makeDeck().filter(c => !excluded.has(c.id));
  const shares = hands.map(() => 0);
  let n = 0;
  const score = (community: readonly Card[]) => {
    const values = omaha ? hands.map(h => findBestOmaha(h, community)) : [];
    const ranks = omaha ? [] : hands.map(h => scoreUnrestricted([...h, ...community]));
    let best = 0;
    const compare = (a: number, b: number) => omaha ? compareHands(values[a]!, values[b]!) : ranks[a]! - ranks[b]!;
    for (let i = 1; i < hands.length; i++) if (compare(i, best) > 0) best = i;
    const winners = hands.map((_, i) => i).filter(i => compare(i, best) === 0);
    winners.forEach(i => { shares[i]! += 1 / winners.length; }); n++;
  };
  // Exact enumeration: at most 990 turn/river combinations, no game RNG or future board access.
  if (board.length === 5) score(board);
  else for (let i = 0; i < deck.length; i++) {
    if (board.length === 4) score([...board, deck[i]!]);
    else for (let j = i + 1; j < deck.length; j++) score([...board, deck[i]!, deck[j]!]);
  }
  const result = shares.map(s => Math.round(s * 100 / n));
  if (cache.size >= 128) cache.clear();
  cache.set(key, result);
  return result;
}

export function matchStreetEquity(match: MatchView, run: number, count: number): number[] | null {
  if (!match.boards.length) return null; // Private, boardless legacy finals have no street equity.
  const hands = match.participantIds.map(id => match.runCards?.[id]?.[run] ?? match.revealedCards[id] ?? []);
  if (hands.some(h => !h.length || h.some(c => c.hidden))) return null;
  const dead = [...Object.values(match.revealedCards).flat(), ...Object.values(match.blockCards ?? {}).flat()].filter(c => !c.hidden);
  if (count) return visibleStreetEquity(hands, (match.boards[run] ?? []).slice(0, count), match.round === 3, dead);
  if (match.final && match.round === 6) return finalFourWayEquity(hands, dead).map(Math.round);
  if (hands.length === 3 && match.round === 4) return r4ThreeWayEquity(hands);
  if (hands.length !== 2) return null;
  return showdownEquity(match.runCards ? 2 : match.round, hands[0]!, hands[1]!, match.runCards ? dead : []);
}
