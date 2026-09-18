import type { CSSProperties } from "react";
import type { Card } from "../core/poker/cards";
import { CardBack, CardView } from "./CardView";

type Props = {
  card: Card;
  open: boolean;
  glow?: boolean;
  dimmed?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Persistent two-faced showdown card. Both faces stay mounted for the whole scene; only the
 * rotateY state changes, so a reveal never replaces a card node or changes the slot geometry.
 */
export function ShowdownCardFlip({ card, open, glow = false, dimmed = false, className = "", style }: Props) {
  return <div className={`cinema-flip-slot ${className} ${open ? "is-open" : ""}`.trim()} style={style} data-card-id={card.id} data-open={open}>
    <div className="cinema-flip-inner">
      <div className="cinema-flip-face cinema-flip-back" aria-hidden={open || undefined}><CardBack compact /></div>
      <div className="cinema-flip-face cinema-flip-front" aria-hidden={!open || undefined}><CardView card={card} compact glow={glow} dimmed={dimmed} /></div>
    </div>
  </div>;
}
