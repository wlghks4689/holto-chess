import type { Card } from "../core/poker/cards";
import { rankWord, withParticle } from "./rankWord";
import { CATEGORY_RANK, type HandCategory } from "../core/poker/evaluate";
import type { MatchView, RevealedHand } from "../shared/protocol";

export type HandExplanation = {
  /** Why this hand is what it is, read from the cards actually on screen. */
  headline: string;
  /** Cards the text is talking about, so highlight and wording can never disagree. */
  highlightCardIds: string[];
  /** Cards the player holds that the comparison ignores. */
  unused?: string;
  /** The first thing that separated the two hands, or why they are level. */
  comparison?: string;
  /** Result wording, only ever derived from the engine's own placing. */
  outcome?: string;
  detail: string[];
};

const STREET_CARDS = { PRE_FLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 } as const;
export type Street = keyof typeof STREET_CARDS;

function higher(a: HandCategory, b: HandCategory): boolean { return CATEGORY_RANK[a] > CATEGORY_RANK[b]; }
function ranks(values: readonly number[]): string { return values.map(rankWord).join("-"); }

function straightText(high: number, usedCards: readonly Card[], wheel: boolean): string {
  if (wheel && high === 5) return "A-2-3-4-5로";
  const values = usedCards.length === 5 ? usedCards.map((card) => card.rank).sort((a, b) => a - b) : [high - 4, high - 3, high - 2, high - 1, high];
  return `${ranks(values)}로`;
}

/** Reads the made hand out of the real kickers; never assumes a shape the evaluator did not report. */
export function categoryReason(category: HandCategory, kickers: readonly number[], usedCards: readonly Card[]): string {
  const [first = 0, second = 0] = kickers;
  switch (category) {
    case "HIGH_CARD": return `짝도 연결도 없어서 가장 높은 ${rankWord(first)} 한 장으로 겨룹니다.`;
    case "PAIR": return `${rankWord(first)} 두 장이 모여 원페어가 되었어요.`;
    case "TWO_PAIR": return `${rankWord(first)} 두 장과 ${rankWord(second)} 두 장, 두 쌍이 모여 투페어예요.`;
    case "TRIPS": return `${rankWord(first)} 세 장이 모여 트립스가 되었어요.`;
    case "STRAIGHT": return `${straightText(first, usedCards, true)} 다섯 숫자가 이어져 스트레이트예요.`;
    case "FLUSH": return `같은 무늬 다섯 장이 모여 플러시예요. 그중 가장 높은 카드는 ${rankWord(first)}입니다.`;
    case "FULL_HOUSE": return `${rankWord(first)} 세 장과 ${rankWord(second)} 두 장이 함께 있어 풀하우스예요.`;
    case "QUADS": return `${rankWord(first)} 네 장이 모두 모여 포카드예요.`;
    case "STRAIGHT_FLUSH": return `${straightText(first, usedCards, true)} 다섯 숫자가 같은 무늬로 이어져 스트레이트 플러시예요.`;
    case "ROYAL_FLUSH": return "10부터 A까지 같은 무늬로 이어진 로열 플러시예요.";
  }
}

const KICKER_LABEL: Partial<Record<HandCategory, string[]>> = {
  PAIR: ["페어의 숫자", "남은 카드 중 가장 높은 카드", "그다음 카드", "마지막 카드"],
  TWO_PAIR: ["높은 쪽 페어", "낮은 쪽 페어", "남은 한 장"],
  TRIPS: ["세 장의 숫자", "남은 카드 중 높은 카드", "마지막 카드"],
  STRAIGHT: ["스트레이트의 가장 높은 숫자"],
  STRAIGHT_FLUSH: ["가장 높은 숫자"],
  FULL_HOUSE: ["세 장 부분", "두 장 부분"],
  QUADS: ["네 장의 숫자", "남은 한 장"],
};

function kickerLabel(category: HandCategory, index: number): string {
  return KICKER_LABEL[category]?.[index] ?? `${index + 1}번째로 높은 카드`;
}

/**
 * The first thing that actually separated the two hands, walked in the same order the evaluator
 * compares them, so the wording can never disagree with the placing.
 */
export function decisiveComparison(mine: RevealedHand, theirs: RevealedHand, theirName: string): string {
  if (mine.category !== theirs.category) {
    const winner = higher(mine.category, theirs.category) ? mine.displayName : theirs.displayName;
    return `내 ${withParticle(mine.displayName, "과", "와")} ${theirName}의 ${withParticle(theirs.displayName, "은", "는")} 족보 자체가 다릅니다. ${withParticle(winner, "이", "가")} 더 높습니다.`;
  }
  const length = Math.max(mine.kickers.length, theirs.kickers.length);
  for (let index = 0; index < length; index += 1) {
    const a = mine.kickers[index] ?? 0;
    const b = theirs.kickers[index] ?? 0;
    if (a === b) continue;
    const label = kickerLabel(mine.category, index);
    if (index === 0) return `둘 다 ${mine.displayName}입니다. ${label}가 ${rankWord(a)} 대 ${rankWord(b)}로 갈렸어요.`;
    return `둘 다 ${mine.displayName}이고 ${kickerLabel(mine.category, 0)}까지 같습니다. 그래서 남은 카드를 높은 쪽부터 비교했고, ${label}가 ${rankWord(a)} 대 ${rankWord(b)}로 처음 차이가 났어요.`;
  }
  return "가장 좋은 다섯 장의 가치가 완전히 같습니다. 카드 무늬만으로는 승자를 정하지 않기 때문에 무승부예요.";
}

function unusedNote(cards: readonly Card[], usedCardIds: readonly string[]): string | undefined {
  const unused = cards.filter((card) => !usedCardIds.includes(card.id));
  if (!unused.length) return undefined;
  return `내 ${unused.map((card) => rankWord(card.rank)).join(", ")}는 이번 다섯 장에 들어가지 않아 비교에서 빠졌어요. 포커는 언제나 가장 좋은 다섯 장만으로 겨룹니다.`;
}

function holeCards(match: MatchView, playerId: string, boardIndex: number): Card[] {
  return match.runCards?.[playerId]?.[boardIndex] ?? match.revealedCards[playerId] ?? [];
}

function snapshot(match: MatchView, boardIndex: number, street: Street, playerId: string): RevealedHand | undefined {
  const streets = match.streetSnapshots?.[boardIndex] ?? [];
  return streets.find((entry) => entry.street === street)?.results.find((entry) => entry.playerId === playerId);
}

/**
 * What the player holds right now, using only the cards already face up. Nothing about a street that
 * has not been dealt is read, so a hidden turn or river can never leak into the text.
 */
export function explainStreet(match: MatchView, viewerId: string, boardIndex: number, street: Street): HandExplanation | null {
  const result = snapshot(match, boardIndex, street, viewerId);
  if (!result) return null;
  const visibleBoard = (match.boards[boardIndex] ?? []).slice(0, STREET_CARDS[street]);
  const cards = [...holeCards(match, viewerId, boardIndex), ...visibleBoard];
  const used = cards.filter((card) => result.usedCardIds.includes(card.id));
  const previousStreet = street === "FLOP" ? "PRE_FLOP" : street === "TURN" ? "FLOP" : street === "RIVER" ? "TURN" : undefined;
  const previous = previousStreet ? snapshot(match, boardIndex, previousStreet, viewerId) : undefined;
  const unchanged = !!previous && previous.category === result.category && previous.kickers[0] === result.kickers[0];
  const opened = visibleBoard.slice(street === "FLOP" ? 0 : STREET_CARDS[street] - 1).filter((card) => result.usedCardIds.includes(card.id));
  return {
    headline: unchanged ? `아직 ${withParticle(result.displayName, "을", "를")} 그대로 유지하고 있어요.` : categoryReason(result.category, result.kickers, used),
    highlightCardIds: [...result.usedCardIds],
    detail: [
      ...(opened.length && !unchanged ? [`새로 열린 ${opened.map((card) => rankWord(card.rank)).join(", ")} 덕분에 지금의 조합이 만들어졌어요.`] : []),
      "지금 보이는 카드만으로 읽은 결과예요. 아직 열리지 않은 카드는 아무도 알 수 없습니다.",
    ],
  };
}

/** The finished board: the made hand, the decisive comparison, and the engine's own outcome. */
export function explainResult(match: MatchView, viewerId: string, boardIndex: number): HandExplanation | null {
  const board = match.boardResults[boardIndex] ?? [];
  const results = board.length ? board : match.results;
  const mine = results.find((entry) => entry.playerId === viewerId);
  if (!mine) return null;
  const hole = holeCards(match, viewerId, boardIndex);
  const boardCards = match.boards[boardIndex] ?? [];
  const used = [...hole, ...boardCards].filter((card) => mine.usedCardIds.includes(card.id));
  const best = results.filter((entry) => entry.playerId !== viewerId).sort((a, b) => a.place - b.place)[0];
  const winners = match.boardWinnerIds[boardIndex] ?? match.winnerIds;
  const drew = winners.length > 1 && winners.includes(viewerId);
  const won = winners.includes(viewerId) && !drew;
  return {
    headline: categoryReason(mine.category, mine.kickers, used),
    highlightCardIds: [...mine.usedCardIds],
    unused: unusedNote(hole, mine.usedCardIds),
    comparison: best ? decisiveComparison(mine, best, "상대") : undefined,
    outcome: won ? "그래서 이번 승부는 내가 가져갔어요." : drew ? "그래서 이번 승부는 무승부예요." : "그래서 이번 승부는 상대가 가져갔어요.",
    detail: [
      ...(boardCards.length ? [`이번 다섯 장은 내 카드 ${hole.filter((card) => mine.usedCardIds.includes(card.id)).length}장 + 보드 ${boardCards.filter((card) => mine.usedCardIds.includes(card.id)).length}장으로 만들어졌어요.`] : []),
      "같은 값의 최고 조합이 여러 개일 수 있어요. 그럴 때는 그중 하나를 보여 줍니다.",
    ],
  };
}
