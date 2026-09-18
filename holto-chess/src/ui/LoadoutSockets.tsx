import { useState } from "react";
import type { Card } from "../core/poker/cards";
import { CardView } from "./CardView";
import { clickLoadout, gameOfSlot, loadoutFromSelection, selectionFromLoadout, type LoadoutClick, type LoadoutState } from "./loadout";
import "./loadout.css";

function hintFor({ slots, focus }: LoadoutState): string {
  if (focus?.kind === "slot") return `GAME ${gameOfSlot(focus.index)} 소켓에 넣을 카드를 고르세요`;
  if (focus?.kind === "card") return slots.includes(focus.cardId)
    ? "옮길 소켓을 누르세요 · 채워진 소켓을 누르면 서로 자리를 바꿉니다"
    : "선택한 카드를 넣을 GAME 소켓을 누르세요";
  if (selectionFromLoadout(slots)) return "배정 완료 · 카드를 눌러 다른 소켓으로 옮길 수 있습니다";
  return "카드를 고른 뒤 넣을 소켓을 누르세요 · 소켓을 먼저 눌러도 됩니다";
}

/**
 * R3 loadout: two Game sockets of two cards each. Reports the ordered selection
 * (Game 1, Game 1, Game 2, Game 2) once every socket is filled, otherwise null.
 */
export function LoadoutSockets({ cards, selectedCardIds, disabled = false, onChange }: {
  cards: Card[]; selectedCardIds: readonly string[]; disabled?: boolean; onChange: (selection: string[] | null) => void;
}) {
  const [state, setState] = useState<LoadoutState>(() => ({ slots: loadoutFromSelection(selectedCardIds, cards.map((card) => card.id)), focus: null }));
  const { slots, focus } = state;
  const cardById = (id: string) => cards.find((card) => card.id === id)!;
  const click = (target: LoadoutClick) => {
    if (disabled) return;
    const next = clickLoadout(state, target);
    setState(next);
    if (next.slots.some((id, index) => id !== slots[index])) onChange(selectionFromLoadout(next.slots));
  };
  const hand = cards.filter((card) => !slots.includes(card.id));
  const holdingSlotted = focus?.kind === "card" && slots.includes(focus.cardId);
  const targeting = focus?.kind === "card";

  return <div className={`loadout ${disabled ? "is-disabled" : ""}`}>
    <div className="loadout-games">{([1, 2] as const).map((game) => <div className={`loadout-game game-${game}`} key={game}>
      <header><b>GAME {game}</b><small>{slots.slice((game - 1) * 2, game * 2).filter(Boolean).length} / 2</small></header>
      <div className="loadout-sockets">{[0, 1].map((offset) => {
        const index = (game - 1) * 2 + offset;
        const occupant = slots[index];
        const armed = focus?.kind === "slot" && focus.index === index;
        return <div className={`loadout-socket ${occupant ? "is-filled" : ""} ${armed ? "is-armed" : ""} ${targeting ? "is-target" : ""}`} key={index}>
          {occupant
            ? <CardView card={cardById(occupant)} selected={focus?.kind === "card" && focus.cardId === occupant} onClick={() => click({ kind: "slot", index })} />
            : <button type="button" className="playing-card loadout-empty" aria-label={`GAME ${game} 소켓 ${offset + 1}`} aria-pressed={armed}
              disabled={disabled} onClick={() => click({ kind: "slot", index })}><span>+</span></button>}
        </div>;
      })}</div>
    </div>)}</div>
    <div className="loadout-hand">
      <header><small>보유 카드</small>{holdingSlotted && <button type="button" className="secondary loadout-return" onClick={() => click({ kind: "hand" })}>보유 카드로 되돌리기</button>}</header>
      <div className="card-row centered">{hand.length
        ? hand.map((card) => <CardView key={card.id} card={card} selected={focus?.kind === "card" && focus.cardId === card.id} onClick={disabled ? undefined : () => click({ kind: "card", cardId: card.id })} />)
        : <p className="loadout-hand-empty">모든 카드가 배정되었습니다</p>}</div>
    </div>
    <p className="loadout-hint" aria-live="polite">{hintFor(state)}</p>
  </div>;
}
