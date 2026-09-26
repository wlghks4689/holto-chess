import type { CSSProperties } from "react";
import type { Card } from "../core/poker/cards";
import { cardLabel } from "../core/poker/cards";
import { CardView } from "./CardView";
import { useTranslation } from "../i18n";

/** Leaving `onLock` out hides the lock control entirely, for screens that do not offer locking. */
export function ShopCard({ card, price, locked = false, disabled = false, dealIndex = 0, onBuy, onLock }: {
  card: Card; price: number; locked?: boolean; disabled?: boolean; dealIndex?: number; onBuy: () => void; onLock?: () => void;
}) {
  const { t } = useTranslation();
  return <div className={`shop-card-slot ${locked ? "is-locked" : ""}`} style={{ "--deal-index": dealIndex } as CSSProperties}>
    <div className="shop-card-reveal" aria-label={t("shop.cardAria", { card: cardLabel(card) })}>
      <CardView card={card} />
      <button type="button" className="card-purchase" disabled={disabled} onClick={onBuy}>{t("shop.buyPrice", { price })}</button>
    </div>
    {onLock ? <button type="button" className="card-lock" aria-label={t(locked ? "shop.unlockCardAria" : "shop.lockCardAria", { card: cardLabel(card) })} aria-pressed={locked} disabled={disabled} onClick={onLock}>{t(locked ? "shop.unlockShort" : "shop.lockPrice")}</button> : null}
  </div>;
}
