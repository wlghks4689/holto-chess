import { makeDeck, type Card } from "../core/poker/cards";
import { compareHands, findBestFive, findBestOmaha, type HandCategory, type HandValue } from "../core/poker/evaluate";
import { BALANCE, handLimitFor, rerollLimitFor, TRIPLE_RUN, type RuleContext } from "./config";
import type { PlayerState, Round } from "./types";
import { omahaPreflopStrength, strategicCardValue, type PreflopStrength } from "./preflopStrength";
import { scoreSeven, scoreUnrestricted } from "./showdownEquity";

type PricedCard = { card: Card; price: number };
export type BotPlanScore = {
  equity: number;
  expectedHandScore: number;
  potential: number;
  currentRoundStrength?: PreflopStrength;
  futureAssetValue: number;
  poolDenialValue: number;
  utility: number;
};
export type BotPlanOptions = {
  /** R5 auction uses R4 sampling with rank-only evaluation to avoid blocking live bids. */
  fastUnrestricted?: boolean;
  /** Version 2 plays R2 as [anchor, run-1 secondary] and [anchor, run-2 secondary]. */
  rulesVersion?: 1 | 2;
  /** Six rounds: R5 plays three two-card RUNs, R6 plays a chosen five on one community board. */
  sixRounds?: boolean;
  /**
   * Common-random baseline. Every candidate in one comparison must draw its boards
   * and opponents from the SAME deck, or sampling noise buries the synergy edges
   * this planner exists to measure.
   */
  sharedKnown?: readonly Card[];
  /** R2 only: score this exact [anchor, run-1, run-2] order instead of the heuristic one. */
  runOrder?: readonly Card[];
};

// Common-random sampling keeps seven bots responsive. Cheap rounds afford more
// universes; R4 evaluates ten cards per player, so it stays lean.
const SAMPLES: Record<Round, number> = { 1: 24, 2: 48, 3: 24, 4: 24, 5: 24, 6: 24 };

/**
 * How a round's hand is played: by its own round number through R4, "triple" for the six-round
 * R5 (three pairs, each on its own board), "lineup" for the six-round R6 (the strongest five of up
 * to seven on one community board), "final" for the five-round boardless best five.
 */
type PlanMode = 1 | 2 | 3 | 4 | "triple" | "lineup" | "final";
function planMode(round: Round, sixRounds = false): PlanMode {
  if (round === 5) return sixRounds ? "triple" : "final";
  if (round === 6) return "lineup";
  return round;
}
/** R6 plays the five that already make the strongest hand; extra cards are burned. */
const lineupFive = (cards: readonly Card[]): Card[] => cards.length <= 5 ? [...cards] : findBestFive(cards).bestFive;
const UNRESTRICTED_CATEGORIES: HandCategory[] = ["HIGH_CARD", "PAIR", "TWO_PAIR", "TRIPS", "STRAIGHT", "FLUSH", "FULL_HOUSE", "QUADS", "STRAIGHT_FLUSH"];

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


/** Low card of every straight window; the wheel counts an ace as one. */
const STRAIGHT_LOWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** How much of a draw survives, indexed by board cards it still needs. */
const COMPLETION = [0, 0.62, 0.3, 0.1] as const;

/**
 * Utility points per point of reachable hand score. The one dial on how much the
 * planner pays for synergy, so tune here and nowhere else.
 *
 * Equity enters utility at x100, and a live diamond draw is worth roughly 1.5-3
 * potential beside two matching suited cards. At 1.5 that is enough to settle
 * near-ties — 8d over 8s next to 7d6d — while a genuine equity edge still wins:
 * in R2 an ace leads a suited connector by ~5 equity points, or ~5.5 utility,
 * which no realistic potential gap overturns. Raising this past ~4 inverts that
 * and the bots start chasing any two suited cards over aces.
 */
const POTENTIAL_WEIGHT = 1.5;

function coveredInWindow(cards: readonly Card[], low: number): number {
  const hit = new Set<number>();
  for (const card of cards) {
    const rank = card.rank === 14 && low === 1 ? 1 : card.rank;
    if (rank >= low && rank <= low + 4) hit.add(rank);
  }
  return hit.size;
}

/**
 * Value of the strongest hand this hole group can still *reach* once the board
 * arrives, so a card is judged by what it builds with the cards already held and
 * not by its own rank. 7d6d plus 8d keeps a straight-flush window alive; As does
 * not, even though the ace is the pricier card.
 *
 * Made hands are excluded (a draw needs at least one board card): the sampled
 * evaluation already measures everything the hole cards have completed.
 */
function drawPotential(cards: readonly Card[], boardCards: number): number {
  if (boardCards <= 0) return 0;
  const bySuit = new Map<string, Card[]>();
  for (const card of cards) bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card]);
  let best = 0;
  const consider = (category: HandCategory, need: number): void => {
    if (need < 1 || need >= COMPLETION.length || need > boardCards) return;
    best = Math.max(best, BALANCE.handScores[category] * COMPLETION[need]!);
  };
  for (const suited of bySuit.values()) {
    if (suited.length < 2) continue;
    consider("FLUSH", 5 - Math.min(suited.length, 5));
    for (const low of STRAIGHT_LOWS) {
      const covered = coveredInWindow(suited, low);
      if (covered >= 2) consider("STRAIGHT_FLUSH", 5 - covered);
    }
  }
  for (const low of STRAIGHT_LOWS) {
    const covered = coveredInWindow(cards, low);
    if (covered >= 2) consider("STRAIGHT", 5 - covered);
  }
  return best;
}

/**
 * R2 deals each run its own board, so the anchor — the one card both runs play —
 * is the only placement that moves EV. Ordering the secondaries is cosmetic, but
 * the stronger pairing leads so the reveal reads in descending strength.
 */
function runOrders(cards: readonly Card[]): Card[][] {
  return cards.map((anchor, index) => [anchor, ...cards.filter((_, other) => other !== index)
    .sort((left, right) => pairScore([anchor, right]) - pairScore([anchor, left]))]);
}

/** Cheap anchor pick used inside sampling, where a nested search would be too slow. */
function heuristicRunOrder(cards: readonly Card[]): Card[] {
  if (cards.length !== 3) return [...cards];
  return runOrders(cards).sort((left, right) =>
    (pairScore([right[0]!, right[1]!]) + pairScore([right[0]!, right[2]!]))
    - (pairScore([left[0]!, left[1]!]) + pairScore([left[0]!, left[2]!])))[0]!;
}

/** Every way to split cards into unordered pairs; six cards give fifteen splits. */
function pairings(cards: readonly Card[]): Card[][][] {
  if (cards.length < 2) return [[]];
  const [first, ...rest] = cards;
  return rest.flatMap((partner, index) => pairings(rest.filter((_, other) => other !== index)).map((others) => [[first!, partner], ...others]));
}

/** Cheap in-sample R5 split: the pairs with the best summed pair score, strongest first. */
function heuristicTripleSplit(cards: readonly Card[]): Card[][] {
  if (cards.length !== TRIPLE_RUN.runs * 2) return Array.from({ length: TRIPLE_RUN.runs }, (_, run) => cards.slice(run * 2, run * 2 + 2));
  let best: Card[][] = []; let bestScore = -Infinity;
  for (const split of pairings(cards)) {
    const score = split.reduce((sum, pair) => sum + pairScore(pair), 0);
    if (score > bestScore) { best = split; bestScore = score; }
  }
  return [...best].sort((left, right) => pairScore(right) - pairScore(left));
}

/** Hole groups the round actually plays, and the board cards that join each one. */
function potentialFor(round: Round, cards: readonly Card[], rulesVersion: 1 | 2, runOrder?: readonly Card[], sixRounds = false): number {
  const mode = planMode(round, sixRounds);
  if (mode === "final") return 0; // No board: the made seven-card hand is already fully measured.
  if (mode === "lineup") return drawPotential(lineupFive(cards), 5);
  if (mode === "triple") {
    if (cards.length !== TRIPLE_RUN.runs * 2) return drawPotential(cards, 5) / TRIPLE_RUN.runs;
    return heuristicTripleSplit(cards).reduce((sum, pair) => sum + drawPotential(pair, 5), 0) / TRIPLE_RUN.runs;
  }
  if (round === 3) {
    if (cards.length !== 4) return drawPotential(cards, 3);
    // Omaha plays exactly two hole cards with exactly three board cards.
    return Math.max(...cards.flatMap((card, i) => cards.slice(i + 1).map((other) => [card, other])).map((pair) => drawPotential(pair, 3)));
  }
  if (round === 2) {
    if (cards.length !== 3) return drawPotential(cards, 5);
    if (rulesVersion !== 2) return drawPotential(bestPair(cards), 5);
    const [anchor, ...secondaries] = runOrder ?? heuristicRunOrder(cards);
    return secondaries.reduce((sum, secondary) => sum + drawPotential([anchor!, secondary], 5), 0) / 2;
  }
  return drawPotential(cards, 5);
}

function compare(hero: HandValue, opponent: HandValue): number {
  const result = compareHands(hero, opponent);
  return result > 0 ? 1 : result === 0 ? 0.5 : 0;
}

function scoreHeadsUp(
  round: Round,
  heroCards: readonly Card[],
  opponentCards: readonly Card[],
  deck: readonly Card[],
  rulesVersion: 1 | 2,
  runOrder?: readonly Card[],
  fastUnrestricted = false,
  sixRounds = false,
): { result: number; handScore: number } {
  const mode = planMode(round, sixRounds);
  if (mode === "triple") {
    // Three RUNs on three boards, each pairing one hero pair with one opponent pair.
    const hero = heuristicTripleSplit(heroCards); const opponent = heuristicTripleSplit(opponentCards);
    let result = 0; let handScore = 0;
    for (let run = 0; run < TRIPLE_RUN.runs; run += 1) {
      const board = deck.slice(run * 5, run * 5 + 5);
      const heroHand = findBestFive([...hero[run]!, ...board]);
      result += compare(heroHand, findBestFive([...opponent[run]!, ...board])); handScore += BALANCE.handScores[heroHand.category];
    }
    return { result: result / TRIPLE_RUN.runs, handScore: handScore / TRIPLE_RUN.runs };
  }
  if (round === 4 && fastUnrestricted) {
    const board = deck.slice(0, 5);
    const hero = scoreUnrestricted([...heroCards, ...board]);
    const opponent = scoreUnrestricted([...opponentCards, ...board]);
    const category = hero >= 8 * 16 ** 5 + 14 * 16 ** 4 ? "ROYAL_FLUSH" : UNRESTRICTED_CATEGORIES[Math.floor(hero / 16 ** 5)]!;
    return { result: hero > opponent ? 1 : hero === opponent ? 0.5 : 0, handScore: BALANCE.handScores[category] };
  }
  if (mode === "final") {
    const hero = findBestFive(heroCards); const opponent = findBestFive(opponentCards);
    return { result: compare(hero, opponent), handScore: BALANCE.handScores[hero.category] };
  }
  if (mode === "lineup") {
    const board = deck.slice(0, 5);
    const hero = findBestFive([...lineupFive(heroCards), ...board]); const opponent = findBestFive([...lineupFive(opponentCards), ...board]);
    return { result: compare(hero, opponent), handScore: BALANCE.handScores[hero.category] };
  }
  if (round === 2) {
    // Version 1 played one chosen pair twice.
    if (rulesVersion !== 2) {
      const heroPair = bestPair(heroCards); const opponentPair = bestPair(opponentCards);
      let result = 0; let handScore = 0;
      for (let run = 0; run < 2; run += 1) {
        const board = deck.slice(run * 5, run * 5 + 5);
        const hero = findBestFive([...heroPair, ...board]); const opponent = findBestFive([...opponentPair, ...board]);
        result += compare(hero, opponent); handScore += BALANCE.handScores[hero.category];
      }
      return { result: result / 2, handScore: handScore / 2 };
    }
    // Version 2 fields [anchor, run-N secondary] against a board of that run's own.
    // Which secondary draws which board is decided by nothing the player controls,
    // so every secondary is scored on every board: same expectation as one fixed
    // assignment, far less sampling noise between two candidate cards.
    const heroPlan = runOrder ?? heuristicRunOrder(heroCards);
    const opponentPlan = heuristicRunOrder(opponentCards);
    let result = 0; let handScore = 0;
    for (let run = 0; run < 2; run += 1) {
      const board = deck.slice(run * 5, run * 5 + 5);
      for (let secondary = 1; secondary <= 2; secondary += 1) {
        const hero = findBestFive([heroPlan[0]!, heroPlan[secondary]!, ...board]);
        const opponent = findBestFive([opponentPlan[0]!, opponentPlan[secondary]!, ...board]);
        result += compare(hero, opponent); handScore += BALANCE.handScores[hero.category];
      }
    }
    return { result: result / 4, handScore: handScore / 4 };
  }
  if (round === 3) {
    let result = 0; let handScore = 0;
    for (let game = 0; game < 2; game += 1) {
      const board = deck.slice(game * 5, game * 5 + 5);
      const hero = findBestOmaha(heroCards, board); const opponent = findBestOmaha(opponentCards, board);
      result += compare(hero, opponent); handScore += BALANCE.handScores[hero.category];
    }
    return { result: result / 2, handScore: handScore / 2 };
  }
  const board = deck.slice(0, 5);
  const hero = findBestFive([...heroCards, ...board]); const opponent = findBestFive([...opponentCards, ...board]);
  return { result: compare(hero, opponent), handScore: BALANCE.handScores[hero.category] };
}

/** Hidden opponent cards are never inspected: the bot samples legal unknown universes instead. */
export function scoreBotPlan(round: Round, cards: readonly Card[], stackAfter: number, seedKey: string, options: BotPlanOptions = {}): BotPlanScore {
  const rulesVersion = options.rulesVersion ?? 2;
  const sixRounds = !!options.sixRounds;
  const limit = handLimitFor(round, { rulesVersion, sixRounds });
  if (cards.length > limit) throw new Error("Bot plan exceeds the round hand limit");
  const final = ["final", "lineup"].includes(String(planMode(round, sixRounds)));
  // Deriving the deck from the shared baseline rather than from `cards` is what
  // makes candidates comparable: identical boards and opponents every sample, so
  // the score gap between two cards is the cards, never the shuffle.
  const known = new Set([...(options.sharedKnown ?? cards), ...cards].map((card) => card.id));
  const unseen = makeDeck().filter((card) => !known.has(card.id));
  const samples = SAMPLES[round];
  let equity = 0; let expectedHandScore = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    const random = randomFrom(hash(`${seedKey}:${round}:${sample}`));
    const deck = shuffled(unseen, random); let cursor = 0;
    const completedHero = [...cards, ...deck.slice(cursor, cursor += limit - cards.length)];
    const opponent = deck.slice(cursor, cursor += limit);
    const outcome = scoreHeadsUp(round, completedHero, opponent, deck.slice(cursor), rulesVersion, cards.length === limit ? options.runOrder : undefined, options.fastUnrestricted, sixRounds);
    equity += outcome.result; expectedHandScore += outcome.handScore;
  }
  equity /= samples; expectedHandScore /= samples;
  const potential = potentialFor(round, cards, rulesVersion, options.runOrder, sixRounds);
  const strategic = strategicCardValue(round, cards);
  const stackValue = Math.floor(Math.max(0, stackAfter) / BALANCE.stackScoreUnitBB);
  // Equity remains the primary signal (x100). Preflop and persistent-card value
  // are bounded tie-break features, deliberately not substitutes for simulation.
  const utility = equity * 100 + expectedHandScore * (final ? 1.8 : 0.45) + potential * POTENTIAL_WEIGHT
    + stackValue * (final ? 1.4 : 0.35)
    + (strategic.currentRoundStrength?.score ?? 0) * 0.02
    + strategic.futureAssetValue * 0.015
    + strategic.poolDenialValue * 0.01;
  return { equity, expectedHandScore, potential, ...strategic, utility };
}

export function rankBotPurchases(round: Round, player: PlayerState, ownedCards: readonly Card[], options: readonly PricedCard[], context: BotPlanOptions = {}): (PricedCard & { plan: BotPlanScore })[] {
  const seedKey = `${player.id}:${player.points}:${player.stackBB}`;
  const sharedKnown = [...ownedCards, ...options.map((option) => option.card)];
  return options.map((option) => ({ ...option, plan: scoreBotPlan(round, [...ownedCards, option.card], player.stackBB - option.price, seedKey, { ...context, sharedKnown }) }))
    .sort((a, b) => b.plan.utility - a.plan.utility || a.price - b.price || b.card.rank - a.card.rank);
}

/**
 * Best affordable two-card buys, scored as one hand. Scoring one card at a time cannot see a pocket
 * pair or a suited combo, which matters most for the empty R1 hand.
 */
export function rankBotPairs(round: Round, player: PlayerState, ownedCards: readonly Card[], options: readonly PricedCard[], context: BotPlanOptions = {}): { cards: [PricedCard, PricedCard]; price: number; plan: BotPlanScore }[] {
  const seedKey = `${player.id}:${player.points}:${player.stackBB}:pair`;
  const sharedKnown = [...ownedCards, ...options.map((option) => option.card)];
  const pairs: { cards: [PricedCard, PricedCard]; price: number; plan: BotPlanScore }[] = [];
  options.forEach((first, i) => options.slice(i + 1).forEach((second) => {
    const price = first.price + second.price;
    if (price > player.stackBB) return;
    pairs.push({ cards: [first, second], price, plan: scoreBotPlan(round, [...ownedCards, first.card, second.card], player.stackBB - price, seedKey, { ...context, sharedKnown }) });
  }));
  return pairs.sort((a, b) => b.plan.utility - a.plan.utility || a.price - b.price);
}

/**
 * Orders R2's three cards as [anchor, run-1, run-2]. The anchor plays both runs,
 * so each candidate anchor is scored over full head-to-head samples rather than
 * by the in-sample heuristic.
 */
export function bestRunLoadout(player: PlayerState, cards: readonly Card[]): string[] {
  if (cards.length !== 3) throw new Error("R2 RUN loadout needs exactly three cards");
  const seedKey = `${player.id}:${player.points}:${player.stackBB}:run`;
  const ranked = runOrders(cards).map((order) => ({
    order,
    plan: scoreBotPlan(2, cards, player.stackBB, seedKey, { rulesVersion: 2, sharedKnown: cards, runOrder: order }),
  })).sort((a, b) => b.plan.utility - a.plan.utility || b.order[0]!.rank - a.order[0]!.rank);
  return ranked[0]!.order.map((card) => card.id);
}

/**
 * R5's six cards as RUN 1, RUN 1, RUN 2, RUN 2, RUN 3, RUN 3. Each candidate pair is sampled against
 * random opponent pairs on random boards (common random numbers), then every split is scored by its
 * expected RUN points including the 3:0 bonus. The strongest pair plays RUN 1, which a tiebreak uses first.
 */
export function bestTripleRunLoadout(player: Pick<PlayerState, "id">, cards: readonly Card[]): string[] {
  if (cards.length !== TRIPLE_RUN.runs * 2) throw new Error("R5 RUN loadout needs exactly six cards");
  const known = new Set(cards.map((card) => card.id));
  const unseen = makeDeck().filter((card) => !known.has(card.id));
  const candidates = cards.flatMap((card, index) => cards.slice(index + 1).map((other) => [card, other]));
  const key = (pair: readonly Card[]) => pair.map((card) => card.id).sort().join(",");
  const tally = new Map(candidates.map((pair) => [key(pair), { win: 0, split: 0 }]));
  const samples = 120;
  for (let sample = 0; sample < samples; sample += 1) {
    const deck = shuffled(unseen, randomFrom(hash(`${player.id}:${[...known].sort().join(",")}:triple:${sample}`)));
    const opponent = scoreSeven(deck.slice(0, 7));
    const board = deck.slice(2, 7);
    for (const pair of candidates) {
      const hero = scoreSeven([...pair, ...board]);
      const entry = tally.get(key(pair))!;
      if (hero > opponent) entry.win += 1; else if (hero === opponent) entry.split += 1;
    }
  }
  const odds = (pair: readonly Card[]) => { const entry = tally.get(key(pair))!; return { win: entry.win / samples, split: entry.split / samples }; };
  let best: Card[][] = []; let bestValue = -Infinity;
  for (const split of pairings(cards)) {
    const chances = split.map(odds);
    const value = chances.reduce((sum, chance) => sum + chance.win * TRIPLE_RUN.win + chance.split * TRIPLE_RUN.split, 0)
      + chances.reduce((product, chance) => product * chance.win, 1) * TRIPLE_RUN.sweepBonus;
    if (value > bestValue + 1e-9) { best = split; bestValue = value; }
  }
  return [...best].sort((left, right) => odds(right).win - odds(left).win || pairScore(right) - pairScore(left)).flat().map((card) => card.id);
}

export function shouldBotReroll(round: Round, player: PlayerState, best: { price: number; plan: BotPlanScore } | undefined, rerollCost: number, rules: RuleContext = { rulesVersion: 2 }): boolean {
  if ((player.rerollsUsed ?? 0) >= rerollLimitFor(round, rules) || player.stackBB < rerollCost + 5) return false;
  if (!best) return true;
  const targetEquity: Record<Round, number> = { 1: 0.56, 2: 0.53, 3: 0.52, 4: 0.51, 5: 0.5, 6: 0.5 };
  const behind = player.points < 8 * (round - 1) || player.stackBB < 35;
  return best.plan.equity < targetEquity[round] - (behind ? 0.025 : 0) && best.price >= 10;
}

export function bestBotSelection(round: Round, cards: readonly Card[]): string[] {
  if (round === 2) return (cards.length < 2 ? cards : bestPair(cards)).map((card) => card.id);
  if (round === 3) return cards.map((card) => card.id);
  return [];
}

/**
 * Six-round R3 buyback: the Omaha preflop strength each leftover card completes, less a bounded
 * price term so a doubled ace is not taken over a nearly as strong cheap card.
 */
export function rankBuybackOptions(ownedCards: readonly Card[], options: readonly PricedCard[]): PricedCard[] {
  const strength = (card: Card) => ownedCards.length === 3 ? omahaPreflopStrength([...ownedCards, card]).score : card.rank;
  return [...options].sort((a, b) => strength(b.card) - b.price * 0.4 - (strength(a.card) - a.price * 0.4) || a.price - b.price || b.card.rank - a.card.rank);
}
