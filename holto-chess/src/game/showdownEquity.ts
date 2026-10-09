import { makeDeck, type Card } from "../core/poker/cards";
import { compareHands, findBestFive, findBestOmaha } from "../core/poker/evaluate";
import type { Round } from "./types";
import { FINAL_EQUITY_SAMPLES } from "./config";

/** Public-input-only, independent from the game's RNG and future board. */
/**
 * The result depends only on the cards, and an online showdown re-renders it on every server view, so it is cached.
 * Callers get a copy so a caller mutating its array cannot poison the cache.
 */
const finalCache = new Map<string, number[]>();
export function finalFourWayEquity(hands: readonly (readonly Card[])[], deadCards: readonly Card[] = []): number[] {
  const keys = hands.map(hand => hand.map(card => card.id).sort().join(","));
  const cacheKey = `${keys.join("|")}#${[...new Set(deadCards.map(c => c.id))].sort().join(",")}`;
  const cached = finalCache.get(cacheKey);
  if (cached) return [...cached];
  const ordered = hands.map((hand, index) => ({ hand, key: keys[index]!, index })).sort((a, b) => a.key.localeCompare(b.key) || a.index - b.index);
  const ids = new Set([...hands.flat(), ...deadCards].map(c => c.id));
  const deck = makeDeck().filter(c => !ids.has(c.id));
  const random = seededRandom(`final:${ordered.map(p => p.key).join("|")}:${[...ids].sort().join(",")}`);
  const shares = hands.map(() => 0);
  for (let sample = 0; sample < FINAL_EQUITY_SAMPLES; sample++) {
    const pool = [...deck];
    for (let i = 0; i < 5; i++) { const j = i + Math.floor(random() * (pool.length - i)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    const scores = ordered.map(p => p.hand.length === 5 ? scoreUnrestricted([...p.hand, ...pool.slice(0, 5)]) : -1);
    const best = Math.max(...scores), winners = scores.flatMap((s, i) => s === best && s >= 0 ? [i] : []);
    for (const i of winners) shares[ordered[i]!.index]! += 100 / FINAL_EQUITY_SAMPLES / winners.length;
  }
  if (finalCache.size >= 64) finalCache.clear();
  finalCache.set(cacheKey, shares);
  return [...shares];
}

/** The existing rank evaluator supports 10 cards except the two-flush case. */
export function scoreUnrestricted(cards: readonly Card[]): number {
  const suits = (["s", "h", "d", "c"] as const).filter(s => cards.filter(c => c.suit === s).length >= 5);
  return suits.length > 1 ? Math.max(...suits.map(s => scoreSeven(cards.filter(c => c.suit === s)))) : scoreSeven(cards);
}

const REQUIRED_CARDS: Record<Round, number> = { 1: 2, 2: 2, 3: 4, 4: 5, 5: 7, 6: 7 };
// Two-card rounds sample 10k boards (95% error about +-1%p); a board costs one 7-card evaluation per hand.
const SAMPLES: Record<Round, number> = { 1: 10_000, 2: 10_000, 3: 600, 4: 240, 5: 1, 6: 1 };
/** Prep screens re-render every countdown tick; the result depends only on the cards, so reuse it. */
const cache = new Map<string, number>();
const CACHE_LIMIT = 64;
const threeWayCache = new Map<string, number[]>();

/** R4 display-only three-way pot equity. Sample one common board, split ties among its winners. */
export function r4ThreeWayEquity(hands: readonly (readonly Card[])[]): number[] | null {
  if (hands.length !== 3 || hands.some(hand => hand.length !== REQUIRED_CARDS[4])) return null;
  const shown = hands.flat();
  const ids = new Set(shown.map(card => card.id));
  if (ids.size !== shown.length || shown.some(card => card.hidden)) return null;
  const keys = hands.map(hand => hand.map(card => card.id).sort().join(","));
  const canonical = [...keys].sort();
  const seedKey = `r4-three-way:${canonical.join("|")}`;
  const cached = threeWayCache.get(seedKey);
  if (cached) return keys.map(key => cached[canonical.indexOf(key)]!);
  const ordered = canonical.map(key => hands[keys.indexOf(key)]!);
  const available = makeDeck().filter(card => !ids.has(card.id));
  const random = seededRandom(seedKey);
  const shares = [0, 0, 0];
  for (let sample = 0; sample < SAMPLES[4]; sample++) {
    const deck = [...available];
    for (let index = 0; index < 5; index++) {
      const picked = index + Math.floor(random() * (deck.length - index));
      [deck[index], deck[picked]] = [deck[picked]!, deck[index]!];
    }
    const board = deck.slice(0, 5);
    const values = ordered.map(hand => findBestFive([...hand, ...board]));
    const best = values.reduce((a, b) => compareHands(a, b) >= 0 ? a : b);
    const winners = values.map((value, index) => compareHands(value, best) === 0 ? index : -1).filter(index => index >= 0);
    for (const index of winners) shares[index]! += 1 / winners.length;
  }
  const percentages = shares.map(share => Math.floor(share * 100 / SAMPLES[4]));
  if (threeWayCache.size >= CACHE_LIMIT) threeWayCache.clear();
  threeWayCache.set(seedKey, percentages);
  return keys.map(key => percentages[canonical.indexOf(key)]!);
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Highest straight in a rank bitmask (bit r = rank r), counting the wheel as 5-high; 0 when none. */
function straightHigh(mask: number): number {
  for (let high = 14; high >= 6; high -= 1) if ((mask >> (high - 4) & 31) === 31) return high;
  return (mask & 0b100000000111100) === 0b100000000111100 ? 5 : 0;
}

/**
 * Rank-only score of the best five of seven cards, ordered exactly like compareHands on findBestFive:
 * category first, then kickers. Two-card rounds need 20k of these per preview, which the general
 * evaluator is too slow for on a phone. `showdownEquity.test.ts` checks it against findBestFive.
 */
export function scoreSeven(cards: readonly Card[]): number {
  const counts = new Array<number>(15).fill(0); const suitMasks = { s: 0, h: 0, d: 0, c: 0 }; const suitCounts = { s: 0, h: 0, d: 0, c: 0 };
  let all = 0;
  for (const card of cards) { counts[card.rank]! += 1; suitMasks[card.suit] |= 1 << card.rank; suitCounts[card.suit] += 1; all |= 1 << card.rank; }
  const score = (category: number, kickers: number[]) => kickers.slice(0, 5).reduce((sum, rank, i) => sum + rank * 16 ** (4 - i), category * 16 ** 5);
  const ranksIn = (mask: number) => { const out: number[] = []; for (let r = 14; r >= 2; r -= 1) if (mask >> r & 1) out.push(r); return out; };
  const flushSuit = (["s", "h", "d", "c"] as const).find((suit) => suitCounts[suit] >= 5);
  if (flushSuit) { const high = straightHigh(suitMasks[flushSuit]); if (high) return score(8, [high]); }
  const quads: number[] = [], trips: number[] = [], pairs: number[] = [];
  for (let r = 14; r >= 2; r -= 1) if (counts[r] === 4) quads.push(r); else if (counts[r] === 3) trips.push(r); else if (counts[r] === 2) pairs.push(r);
  const others = (...used: number[]) => ranksIn(all).filter((r) => !used.includes(r));
  if (quads.length) return score(7, [quads[0]!, others(quads[0]!)[0]!]);
  if (trips.length && (trips.length > 1 || pairs.length)) return score(6, [trips[0]!, Math.max(trips[1] ?? 0, pairs[0] ?? 0)]);
  if (flushSuit) return score(5, ranksIn(suitMasks[flushSuit]));
  const straight = straightHigh(all);
  if (straight) return score(4, [straight]);
  if (trips.length) return score(3, [trips[0]!, ...others(trips[0]!).slice(0, 2)]);
  if (pairs.length >= 2) return score(2, [pairs[0]!, pairs[1]!, others(pairs[0]!, pairs[1]!)[0]!]);
  if (pairs.length) return score(1, [pairs[0]!, ...others(pairs[0]!).slice(0, 3)]);
  return score(0, ranksIn(all));
}

/** Heads-up pre-board equity, optionally excluding other known dead cards. */
export function showdownEquity(round: Round, left: readonly Card[], right: readonly Card[], deadCards: readonly Card[] = []): [number, number] | null {
  const raw = rawShowdownEquity(round, left, right, deadCards);
  return raw === null ? null : [Math.floor(raw), Math.floor(100 - raw)];
}

/** Unrounded server eligibility value; the client display rounds this same fixed estimate. */
export function rawShowdownEquity(round: Round, left: readonly Card[], right: readonly Card[], deadCards: readonly Card[] = []): number | null {
  const required = REQUIRED_CARDS[round];
  if (left.length !== required || right.length !== required) return null;
  const shown = [...left, ...right], shownIds = new Set(shown.map((card) => card.id));
  const deadIds = new Set(deadCards.map((card) => card.id));
  if (shownIds.size !== shown.length || deadIds.size !== deadCards.length) return null;
  const ids = new Set([...shownIds, ...deadIds]);
  const evaluate = (cards: readonly Card[], board: readonly Card[]) => round === 3
    ? findBestOmaha(cards, board)
    : findBestFive([...cards, ...board]);
  // Boardless finals compare the made hands directly. A six-round R5 RUN is scored as round 2.
  if (round === 5 || round === 6) {
    const comparison = compareHands(evaluate(left, []), evaluate(right, []));
    return comparison === 0 ? 50 : comparison > 0 ? 100 : 0;
  }
  const available = makeDeck().filter((card) => !ids.has(card.id));
  // Sampling must depend on the card set, not on how cards were acquired or ordered in state.
  const canonicalCardIds = [...ids].sort();
  const canonicalHands = [left, right].map((hand) => hand.map((card) => card.id).sort().join(",")).sort();
  const seedKey = `${round}:${canonicalCardIds.join(":")}:${canonicalHands.join("|")}`;
  const cacheKey = `${seedKey}>${left.map((card) => card.id).sort().join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;
  const random = seededRandom(seedKey);
  let leftShare = 0;
  for (let sample = 0; sample < SAMPLES[round]; sample += 1) {
    const deck = [...available];
    for (let index = 0; index < 5; index += 1) {
      const picked = index + Math.floor(random() * (deck.length - index));
      [deck[index], deck[picked]] = [deck[picked]!, deck[index]!];
    }
    const board = deck.slice(0, 5);
    const comparison = required === 2 ? scoreSeven([...left, ...board]) - scoreSeven([...right, ...board])
      : compareHands(evaluate(left, board), evaluate(right, board));
    leftShare += comparison > 0 ? 1 : comparison === 0 ? 0.5 : 0;
  }
  const leftPercent = leftShare * 100 / SAMPLES[round];
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(cacheKey, leftPercent);
  return leftPercent;
}
