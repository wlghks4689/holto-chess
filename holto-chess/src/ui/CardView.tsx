import type { CSSProperties } from "react";
import { rankDisplay, SUIT_SYMBOL, type Card } from "../core/poker/cards";

export function CardView({ card, selected = false, dimmed = false, glow = false, compact = false, onClick, footer }: {
  card: Card; selected?: boolean; dimmed?: boolean; glow?: boolean; compact?: boolean; onClick?: () => void; footer?: string;
}) {
  const red = card.suit === "h" || card.suit === "d";
  const style = { "--card-index": card.rank } as CSSProperties;
  return (
    <button type="button" className={`playing-card ${red ? "red" : "black"} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""} ${glow ? "glow" : ""} ${compact ? "compact" : ""} ${onClick ? "clickable" : ""}`} style={style} onClick={onClick} disabled={!onClick} aria-label={`${rankDisplay(card.rank)}${SUIT_SYMBOL[card.suit]}`}>
      <span className="card-rank">{rankDisplay(card.rank)}</span>
      <span className="card-suit">{SUIT_SYMBOL[card.suit]}</span>
      {footer ? <span className="card-footer">{footer}</span> : null}
    </button>
  );
}

export function CardBack({ compact = false }: { compact?: boolean }) {
  return <div className={`playing-card card-back ${compact ? "compact" : ""}`} aria-label="비공개 카드"><span>♞</span></div>;
}
