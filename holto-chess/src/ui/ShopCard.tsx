import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Card } from "../core/poker/cards";
import { cardLabel } from "../core/poker/cards";
import { CardBack, CardView } from "./CardView";

export function ShopCard({ card, price, locked, disabled = false, dealIndex = 0, onBuy, onLock }: {
  card: Card; price: number; locked: boolean; disabled?: boolean; dealIndex?: number; onBuy: () => void; onLock: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const reveal = () => { if (!disabled && !revealed) setRevealed(true); };
  const revealFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); reveal();
  };
  return <div className={`shop-card-slot ${locked ? "is-locked" : ""} ${revealed ? "is-revealed" : "is-hidden"}`} style={{ "--deal-index": dealIndex } as CSSProperties}>
    <div className="shop-card-reveal" role="button" tabIndex={disabled || revealed ? -1 : 0} aria-label={revealed ? `${cardLabel(card)} 공개됨` : "상점 카드 확인"} aria-pressed={revealed} onClick={reveal} onKeyDown={revealFromKeyboard}>
      <div className="shop-card-flip-inner">
        <div className="shop-card-face shop-card-back"><CardBack /></div>
        <div className="shop-card-face shop-card-front"><CardView card={card} /></div>
      </div>
    </div>
    <button type="button" className="card-purchase" disabled={disabled || !revealed} onClick={onBuy}>{revealed ? `구매 · ${price} BB` : `확인 후 구매 · ${price} BB`}</button>
    <button type="button" className="card-lock" aria-label={`${cardLabel(card)} ${locked ? "잠금 해제" : "잠금 3BB"}`} aria-pressed={locked} disabled={disabled} onClick={onLock}>{locked ? "🔒 해제" : "잠금 3BB"}</button>
  </div>;
}
