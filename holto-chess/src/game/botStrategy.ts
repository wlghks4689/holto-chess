import { makeDeck, type Card } from "../core/poker/cards";
import { compareHands, findBestFive, findBestOmaha, type HandValue } from "../core/poker/evaluate";
import { BALANCE } from "./config";
import type { Augment, PlayerState, Round } from "./types";

type PricedCard = { card: Card; price: number };
export type BotPlanScore = { equity: number; expectedHandScore: number; utility: number };

// Common-random 24-universe sampling keeps seven bots responsive while preserving stable candidate ordering.
const SAMPLES = 24;

function hash(value: string): number {
  let output = 2166136261;
  for (const char of value) { output ^= char.charCodeAt(0); output = Math.imul(output, 16777619); }
  return output >>> 0;
}

function randomFrom(seed: number): () => number {
  let value = seed || 1;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function pairScore([left, right]: readonly Card[]): number {
  const high = Math.max(left.rank, right.rank); const low = Math.min(left.rank, right.rank);
  const gap = Math.max(0, high - low - 1);
  return high + low + (left.rank === right.rank ? 30 + high * 1.4 : 0)
    + (left.suit === right.suit ? 5 : 0) + (gap === 0 ? 6 : gap === 1 ? 3 : gap === 2 ? 1 : -gap)
    + (high === 14 ? 4 : 0);
}

function bestPair(cards: readonly Card[]): Card[] {
  let best: Card[] = [cards[0]!, cards[1]!]; let bestScore = -Infinity;
  for (let left = 0; left < cards.length; left += 1) for (let right = left + 1; right < cards.length; right += 1) {
    const pair = [cards[left]!, cards[right]!]; const score = pairScore(pair);
    if (score > bestScore) { best = pair; bestScore = score; }
  }
  return best;
}

function bestOmahaSplit(cards: readonly Card[]): [Card[], Card[]] {
  const partitions: [Card[], Card[]][] = [
    [[cards[0]!, cards[1]!], [cards[2]!, cards[3]!]],
    [[cards[0]!, cards[2]!], [cards[1]!, cards[3]!]],
    [[cards[0]!, cards[3]!], [cards[1]!, cards[2]!]],
  ];
  return partitions.sort((a, b) => {
    const score = (partition: [Card[], Card[]]) => {
      const values = partition.map(pairScore);
      return values[0]! + values[1]! + Math.min(...values) * 0.45;
    };
    return score(b) - score(a);
  })[0]!;
}

function compare(hero: HandValue, opponent: HandValue): number {
  const result = compareHands(hero, opponent);
  return result > 0 ? 1 : result === 0 ? 0.5 : 0;
}

function scoreHeadsUp(round: Round, heroCards: readonly Card[], opponentCards: readonly Card[], deck: readonly Card[]): { result: number; handScore: number } {
  if (round === 5) {
    const hero = findBestFive(heroCards); const opponent = findBestFive(opponentCards);
    return { result: compare(hero, opponent), handScore: BALANCE.handScores[hero.category] };
  }
  if (round === 2) {
    const heroPair = bestPair(heroCards); const opponentPair = bestPair(opponentCards);
    let result = 0; let handScore = 0;
    for (let run = 0; run < 2; run += 1) {
      const board = deck.slice(run * 5, run * 5 + 5);
      const hero = findBestFive([...heroPair, ...board]); const opponent = findBestFive([...opponentPair, ...board]);
      result += compare(hero, opponent); handScore += BALANCE.handScores[hero.category];
    }
    return { result: result / 2, handScore: handScore / 2 };
  }
  if (round === 3) {
    const heroSplit = bestOmahaSplit(heroCards); const opponentSplit = bestOmahaSplit(opponentCards);
    let result = 0; let handScore = 0;
    for (let game = 0; game < 2; game += 1) {
      const board = deck.slice(game * 5, game * 5 + 5);
      const hero = findBestOmaha(heroSplit[game]!, board); const opponent = findBestOmaha(opponentSplit[game]!, board);
      result += compare(hero, opponent); handScore += BALANCE.handScores[hero.category];
    }
    return { result: result / 2, handScore: handScore / 2 };
  }
  const board = deck.slice(0, 5);
  const hero = findBestFive([...heroCards, ...board]); const opponent = findBestFive([...opponentCards, ...board]);
  return { result: compare(hero, opponent), handScore: BALANCE.handScores[hero.category] };
}

/** Hidden opponent cards are never inspected: the bot samples legal unknown universes instead. */
export function scoreBotPlan(round: Round, cards: readonly Card[], stackAfter: number, seedKey: string): BotPlanScore {
  const limit = BALANCE.handLimits[round];
  if (cards.length > limit) throw new Error("Bot plan exceeds the round hand limit");
  const known = new Set(cards.map((card) => card.id));
  const unseen = makeDeck().filter((card) => !known.has(card.id));
  let equity = 0; let expectedHandScore = 0;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const random = randomFrom(hash(`${seedKey}:${round}:${sample}`));
    const deck = shuffled(unseen, random); let cursor = 0;
    const completedHero = [...cards, ...deck.slice(cursor, cursor += limit - cards.length)];
    const opponent = deck.slice(cursor, cursor += limit);
    const outcome = scoreHeadsUp(round, completedHero, opponent, deck.slice(cursor));
    equity += outcome.result; expectedHandScore += outcome.handScore;
  }
  equity /= SAMPLES; expectedHandScore /= SAMPLES;
  const stackValue = Math.floor(Math.max(0, stackAfter) / BALANCE.stackScoreUnitBB);
  const utility = equity * 100 + expectedHandScore * (round === 5 ? 1.8 : 0.45) + stackValue * (round === 5 ? 1.4 : 0.35);
  return { equity, expectedHandScore, utility };
}

export function rankBotPurchases(round: Round, player: PlayerState, ownedCards: readonly Card[], options: readonly PricedCard[]): (PricedCard & { plan: BotPlanScore })[] {
  const seedKey = `${player.id}:${player.points}:${player.stackBB}`;
  return options.map((option) => ({ ...option, plan: scoreBotPlan(round, [...ownedCards, option.card], player.stackBB - option.price, seedKey) }))
    .sort((a, b) => b.plan.utility - a.plan.utility || a.price - b.price || b.card.rank - a.card.rank);
}

export function shouldBotReroll(round: Round, player: PlayerState, best: (PricedCard & { plan: BotPlanScore }) | undefined, rerollCost: number): boolean {
  if ((player.rerollsUsed ?? 0) >= BALANCE.rerollLimits[round] || player.stackBB < rerollCost + 5) return false;
  if (!best) return true;
  const targetEquity: Record<Round, number> = { 1: 0.56, 2: 0.53, 3: 0.52, 4: 0.51, 5: 0.5 };
  const behind = player.points < 8 * (round - 1) || player.stackBB < 35;
  return best.plan.equity < targetEquity[round] - (behind ? 0.025 : 0) && best.price >= 10;
}

export function bestBotSelection(round: Round, cards: readonly Card[]): string[] {
  if (round === 2) return bestPair(cards).map((card) => card.id);
  if (round === 3) return bestOmahaSplit(cards).flat().map((card) => card.id);
  return [];
}

export function pickBotAugment(player: PlayerState, choices: readonly Augment[], round: Round, ownedCards: readonly Card[]): Augment {
  if (!choices.length) throw new Error("Bot needs at least one augment choice");
  const roundsLeft = 5 - round;
  const suitCounts = ownedCards.reduce((counts, card) => counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1), new Map<string, number>());
  const rankCounts = ownedCards.reduce((counts, card) => counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1), new Map<number, number>());
  const score = (augment: Augment): number => {
    switch (augment.id) {
      case "r5_hand_bonus": return 35;
      case "win_bonus": return 18 + roundsLeft * 4 + player.winStreak * 2;
      case "pair_points": return 9 + Math.max(0, ...rankCounts.values()) * 5;
      case "shop_plus_two": return 12 + roundsLeft * 6 - Math.max(0, player.shopSize - 3) * 4;
      case "shop_plus_one": return 9 + roundsLeft * 4 - Math.max(0, player.shopSize - 3) * 4;
      case "reroll_discount": return 10 + roundsLeft * 4;
      case "sell_bonus": return 8 + roundsLeft * 3;
      case "rank_discount": return 8 + ownedCards.filter((card) => card.rank <= 9).length * 3 + roundsLeft * 2;
      case "suit_discount": return 7 + (augment.suit ? suitCounts.get(augment.suit) ?? 0 : 0) * 4 + roundsLeft * 2;
    }
  };
  return [...choices].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0]!;
}
