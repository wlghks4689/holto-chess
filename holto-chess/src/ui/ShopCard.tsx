import type { CSSProperties } from "react";
import type { Card } from "../core/poker/cards";
import { cardLabel } from "../core/poker/cards";
import { CardView } from "./CardView";

export function ShopCard({ card, price, locked, disabled = false, dealIndex = 0, onBuy, onLock }: {
  card: Card; price: number; locked: boolean; disabled?: boolean; dealIndex?: number; onBuy: () => void; onLock: () => void;
}) {
  return <div className={`shop-card-slot ${locked ? "is-locked" : ""}`} style={{ "--deal-index": dealIndex } as CSSProperties}>
    <div className="shop-card-reveal" aria-label={`${cardLabel(card)} 상점 카드`}>
      <CardView card={card} />
      <button type="button" className="card-purchase" disabled={disabled} onClick={onBuy}>구매 · {price} BB</button>
    </div>
    <button type="button" className="card-lock" aria-label={`${cardLabel(card)} ${locked ? "잠금 해제" : "잠금 3BB"}`} aria-pressed={locked} disabled={disabled} onClick={onLock}>{locked ? "🔒 해제" : "잠금 3BB"}</button>
  </div>;
}
