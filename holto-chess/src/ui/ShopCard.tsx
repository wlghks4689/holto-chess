import type { Card } from "../core/poker/cards";
import { cardLabel } from "../core/poker/cards";
import { CardView } from "./CardView";

export function ShopCard({ card, price, locked, disabled = false, onBuy, onLock }: {
  card: Card; price: number; locked: boolean; disabled?: boolean; onBuy: () => void; onLock: () => void;
}) {
  return <div className={`shop-card-slot ${locked ? "is-locked" : ""}`}>
    <CardView card={card} footer={`${price} BB`} onClick={disabled ? undefined : onBuy} />
    <button type="button" className="card-lock" aria-label={`${cardLabel(card)} ${locked ? "잠금 해제" : "잠금 3BB"}`} aria-pressed={locked} disabled={disabled} onClick={onLock}>{locked ? "🔒 해제" : "잠금 3BB"}</button>
  </div>;
}
