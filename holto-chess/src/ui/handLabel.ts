import { cardLabel, rankDisplay, type Card } from "../core/poker/cards";
import type { HandCategory } from "../core/poker/evaluate";
import { t, type TranslationKey } from "../i18n";

export function compactHandName(name: string, translate: typeof t = t): string {
  const labels: Record<string, TranslationKey> = {
    "몰수패": "hand.forfeit", "하이카드": "hand.highCard", "원페어": "hand.pair", "투페어": "hand.twoPair",
    "트립스": "hand.trips", "스트레이트": "hand.straight", "플러시": "hand.flush", "풀하우스": "hand.fullHouse",
    "포카드": "hand.quads", "스트레이트 플러시": "hand.straightFlush", "로열 플러시": "hand.royalFlush",
    "로열 스트레이트 플러시": "hand.royalFlush",
  };
  return labels[name] ? translate(labels[name]!) : name;
}

export type DetailedHandLabel = { title: string; kicker?: string };

const ranks = (values: readonly number[]) => values.map(rankDisplay).join(", ");
const rankPluralKeys: Record<number, TranslationKey> = {
  2: "rank.twoPlural", 3: "rank.threePlural", 4: "rank.fourPlural", 5: "rank.fivePlural", 6: "rank.sixPlural",
  7: "rank.sevenPlural", 8: "rank.eightPlural", 9: "rank.ninePlural", 10: "rank.tenPlural", 11: "rank.jackPlural",
  12: "rank.queenPlural", 13: "rank.kingPlural", 14: "rank.acePlural",
};

export function detailedHandLabel(category: HandCategory, kickers: readonly number[], playerCards: readonly Card[], usedCardIds: readonly string[], translate: typeof t = t): DetailedHandLabel {
  const [made = 0, second = 0, ...rest] = kickers;
  const playerKickers = [...new Set(playerCards
    .filter((card) => usedCardIds.includes(card.id) && card.rank !== made)
    .map((card) => card.rank))].sort((a, b) => b - a);
  const withKicker = (title: string, values: readonly number[]): DetailedHandLabel => values.length
    ? { title, kicker: translate("hand.kicker", { ranks: ranks(values) }) }
    : { title };
  const rankWord = (value: number) => translate(rankPluralKeys[value] ?? "rank.acePlural");
  const madeCards = playerCards
    .filter((card) => usedCardIds.includes(card.id))
    .sort((a, b) => b.rank - a.rank);
  const straightFlushCards = madeCards.length === 5 && made === 5
    ? [14, 2, 3, 4, 5].map((rank) => madeCards.find((card) => card.rank === rank)).filter((card): card is Card => !!card)
    : madeCards;

  switch (category) {
    case "HIGH_CARD": return withKicker(translate("hand.highRank", { rank: rankDisplay(made) }), [second, ...rest].filter(Boolean));
    case "PAIR": return withKicker(translate("hand.pairOf", { rank: rankWord(made) }), playerKickers.length ? playerKickers : [second, ...rest].filter(Boolean));
    case "TWO_PAIR": return withKicker(translate("hand.twoPairOf", { high: rankWord(made), low: rankWord(second) }), rest.filter(Boolean));
    case "TRIPS": return withKicker(translate("hand.tripsOf", { rank: rankWord(made) }), [second, ...rest].filter(Boolean));
    case "STRAIGHT": return { title: `${translate("hand.highRank", { rank: rankDisplay(made) })} ${translate("hand.straight")}` };
    case "FLUSH": return withKicker(translate("hand.flushHigh", { rank: rankDisplay(made) }), [second, ...rest].filter(Boolean));
    case "FULL_HOUSE": return {
      title: translate("hand.fullHouseOf", { trips: rankWord(made), pair: rankWord(second) }),
      kicker: [made, made, made, second, second].map(rankDisplay).join("-"),
    };
    case "QUADS": return withKicker(translate("hand.quadsOf", { rank: rankWord(made) }), [second].filter(Boolean));
    case "STRAIGHT_FLUSH": return straightFlushCards.length === 5
      ? { title: translate("hand.straightFlushHigh", { rank: rankDisplay(made) }), kicker: straightFlushCards.map(cardLabel).join(" ") }
      : { title: translate("hand.straightFlushHigh", { rank: rankDisplay(made) }) };
    case "ROYAL_FLUSH": return madeCards.length === 5
      ? { title: translate("hand.royalFlush"), kicker: madeCards.map(cardLabel).join(" ") }
      : { title: translate("hand.royalFlush") };
  }
}
