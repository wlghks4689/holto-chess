import type { Card } from "../core/poker/cards";
import type { ReactNode } from "react";
import { useTranslation } from "../i18n";
import { CardView } from "./CardView";

export function DraftPrivateHand({ cards, timer }: { cards: Card[]; timer?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="draft-private-hand" aria-label={t("draft.myCards")}>
    <div className="draft-private-copy"><b>{t("draft.myCards")}</b><details className="draft-private-help"><summary aria-label={t("draft.privacyHelpAria")}>?</summary><span role="tooltip">{t("draft.hiddenFromOthers")}</span></details></div>
    <div className="draft-private-cards">{cards.map((card) => <CardView key={card.id} card={card} compact />)}</div>
    {timer && <div className="draft-private-timer">{timer}</div>}
  </div>;
}
