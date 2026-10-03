import type { CSSProperties } from "react";
import type { Card } from "../core/poker/cards";
import { cardLabel } from "../core/poker/cards";
import { CardView } from "./CardView";
import { useTranslation } from "../i18n";

/** Leaving `onLock` out hides the lock control entirely, for screens that do not offer locking. */
export function ShopCard({ card, price, locked = false, disabled = false, dealIndex = 0, lockCost = 3, onBuy, onLock }: {
  card: Card; price: number; locked?: boolean; disabled?: boolean; dealIndex?: number; lockCost?: number; onBuy: () => void; onLock?: () => void;
}) {
  const { t } = useTranslation();
  return <div className={`shop-card-slot ${locked ? "is-locked" : ""}`} style={{ "--deal-index": dealIndex } as CSSProperties}>
    <div className="shop-card-reveal" aria-label={t("shop.cardAria", { card: cardLabel(card) })}>
      <CardView card={card} />
      <button type="button" className="card-purchase" aria-label={t("shop.buyPrice", { price })} disabled={disabled} onClick={onBuy}>{price} BB</button>
    </div>
    {onLock ? <button type="button" className="card-lock" aria-label={t(locked ? "shop.unlockCardAria" : "shop.lockCardAria", { card: cardLabel(card), cost: lockCost })} aria-pressed={locked} disabled={disabled} onClick={onLock}>{t(locked ? "shop.unlockShort" : "shop.lockPrice", { cost: lockCost })}</button> : null}
  </div>;
}
