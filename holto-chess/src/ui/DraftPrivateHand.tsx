import type { Card } from "../core/poker/cards";
import { useTranslation } from "../i18n";
import { CardView } from "./CardView";

export function DraftPrivateHand({ cards }: { cards: Card[] }) {
  const { t } = useTranslation();
  return <div className="draft-private-hand" aria-label={t("draft.myCards")}>
    <div className="draft-private-copy"><b>{t("draft.myCards")}</b></div>
    <div className="draft-private-cards">{cards.map((card) => <CardView key={card.id} card={card} compact />)}</div>
  </div>;
}
