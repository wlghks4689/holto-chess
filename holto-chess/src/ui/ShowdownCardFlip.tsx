import { useEffect, useRef, type CSSProperties } from "react";
import { CARD_FLIP_MS, EQUITY_DELAY_MS, RIVER_FLIP_MS } from "./streetEquity";
import type { Card } from "../core/poker/cards";
import { CardBack, CardView } from "./CardView";

type Props = {
  card: Card;
  open: boolean;
  glow?: boolean;
  dimmed?: boolean;
  className?: string;
  style?: CSSProperties;
  onEquityReady?: () => void;
};

/**
 * Persistent two-faced showdown card. Both faces stay mounted for the whole scene; only the
 * rotateY state changes, so a reveal never replaces a card node or changes the slot geometry.
 */
export function ShowdownCardFlip({ card, open: requestedOpen, glow = false, dimmed = false, className = "", style, onEquityReady }: Props) {
  const open = requestedOpen && !card.hidden;
  const callback = useRef(onEquityReady);
  useEffect(() => { callback.current = onEquityReady; }, [onEquityReady]);
  const observesReveal = !!onEquityReady;
  const duration = className.includes("cinema-river") ? RIVER_FLIP_MS : CARD_FLIP_MS;
  useEffect(() => {
    if (!open || !observesReveal) return;
    // Also protects late network packets/reconnects: the scheduled frame alone is insufficient.
    const timer = window.setTimeout(() => callback.current?.(), duration + EQUITY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open, card.id, duration, observesReveal]);
  return <div className={`cinema-flip-slot ${className} ${open ? "is-open" : ""}`.trim()} style={style} data-card-id={card.id} data-open={open}>
    <div className="cinema-flip-inner">
      <div className="cinema-flip-face cinema-flip-back" aria-hidden={open || undefined}><CardBack compact /></div>
      <div className="cinema-flip-face cinema-flip-front" aria-hidden={!open || undefined}><CardView card={card} compact glow={glow} dimmed={dimmed} /></div>
    </div>
  </div>;
}
