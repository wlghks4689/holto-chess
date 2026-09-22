import { cardLabel, rankToChar, type Card } from "../core/poker/cards";
import type { HandCategory } from "../core/poker/evaluate";

export function compactHandName(name: string): string {
  return name === "로열 스트레이트 플러시" ? "로열 플러시" : name;
}

export type DetailedHandLabel = { title: string; kicker?: string };

const ranks = (values: readonly number[]) => values.map(rankToChar).join(", ");

export function detailedHandLabel(category: HandCategory, kickers: readonly number[], playerCards: readonly Card[], usedCardIds: readonly string[]): DetailedHandLabel {
  const [made = 0, second = 0, ...rest] = kickers;
  const playerKickers = [...new Set(playerCards
    .filter((card) => usedCardIds.includes(card.id) && card.rank !== made)
    .map((card) => card.rank))].sort((a, b) => b - a);
  const withKicker = (title: string, values: readonly number[]): DetailedHandLabel => values.length
    ? { title, kicker: `KICKER ${ranks(values)}` }
    : { title };
  const royalCards = playerCards
    .filter((card) => usedCardIds.includes(card.id))
    .sort((a, b) => b.rank - a.rank);

  switch (category) {
    case "HIGH_CARD": return withKicker(`${rankToChar(made)} 하이`, [second, ...rest].filter(Boolean));
    case "PAIR": return withKicker(`${rankToChar(made)} 원페어`, playerKickers.length ? playerKickers : [second, ...rest].filter(Boolean));
    case "TWO_PAIR": return withKicker(`${rankToChar(made)} · ${rankToChar(second)} 투페어`, rest.filter(Boolean));
    case "TRIPS": return withKicker(`${rankToChar(made)} 트립스`, [second, ...rest].filter(Boolean));
    case "STRAIGHT": return { title: `${rankToChar(made)} 하이 스트레이트` };
    case "FLUSH": return withKicker(`${rankToChar(made)} 하이 플러시`, [second, ...rest].filter(Boolean));
    case "FULL_HOUSE": return {
      title: `${rankToChar(made)} · ${rankToChar(second)} 풀하우스`,
      kicker: [made, made, made, second, second].map(rankToChar).join("-"),
    };
    case "QUADS": return withKicker(`${rankToChar(made)} 포카드`, [second].filter(Boolean));
    case "STRAIGHT_FLUSH": return { title: `${rankToChar(made)} 하이 스트레이트 플러시` };
    case "ROYAL_FLUSH": return royalCards.length === 5
      ? { title: "로열 플러시", kicker: royalCards.map(cardLabel).join(" ") }
      : { title: "로열 플러시" };
  }
}
