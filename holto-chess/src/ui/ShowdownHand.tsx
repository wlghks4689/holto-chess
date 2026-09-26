import type { Card } from "../core/poker/cards";
import type { HandCategory } from "../core/poker/evaluate";
import { CardView } from "./CardView";
import { detailedHandLabel } from "./handLabel";
import { madeTone } from "./madeTone";
import { useTranslation } from "../i18n";

/** Hold'em showdown focus, using PORENA's round-specific evaluator results. */

export function ShowdownHand({ cards, usedCardIds, winner, displayName, category, kickers }: {
  cards: Card[]; usedCardIds: readonly string[]; winner: boolean; displayName: string;
  category: HandCategory; kickers: readonly number[];
}) {
  const { t } = useTranslation();
  const label = displayName === "몰수패" ? { title: t("hand.forfeit"), kicker: t("hand.forfeitDetails") } : detailedHandLabel(category, kickers, cards, usedCardIds, t);
  const usesFiveCards = usedCardIds.length >= 5;
  return <div className={`showdown-hand ${usesFiveCards ? "uses-five-cards" : ""} made-${madeTone(displayName)}`}>
    <div className="card-row mini">{cards.map((card) => <CardView key={card.id} card={card} compact
      glow={winner && usedCardIds.includes(card.id)} dimmed={winner && !usedCardIds.includes(card.id)} />)}</div>
    <strong className="showdown-hand-name"><span>{label.title}</span>{label.kicker ? <small>({label.kicker})</small> : null}</strong>
  </div>;
}
