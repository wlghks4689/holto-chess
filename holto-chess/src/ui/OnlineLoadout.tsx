import type { PlayerView } from "../shared/protocol";
import { normalizeSlots, toggleSlot } from "../shared/loadoutSlots";
import { CardView } from "./CardView";
import "./loadout.css";

export function OnlineLoadout({ me, disabled, onChange }: { me: PlayerView["me"]; disabled: boolean; onChange: (slots: (string | null)[]) => void }) {
  const owned = me.ownedCards.map((card) => card.id);
  const slots = normalizeSlots(me.loadoutSlots ?? me.selectedCardIds, owned);
  return <div className="loadout"><div className="loadout-games">{[1, 2].map((game) => <div className={`loadout-game game-${game}`} key={game}>
    <header><b>GAME {game}</b><small>{slots.slice((game - 1) * 2, game * 2).filter(Boolean).length} / 2</small></header>
    <div className="loadout-sockets">{[0, 1].map((offset) => {
      const index = (game - 1) * 2 + offset;
      const card = me.ownedCards.find((card) => card.id === slots[index]);
      return <div className="loadout-socket" key={index}>{card ? <CardView card={card} onClick={disabled ? undefined : () => onChange(toggleSlot(slots, owned, index))} footer="빼기" /> : <button className="playing-card loadout-empty" aria-label={`GAME ${game} 소켓 ${offset + 1} 자동 배치`} disabled={disabled || owned.every((id) => slots.includes(id))} onClick={() => onChange(toggleSlot(slots, owned, index))}><span>＋</span></button>}</div>;
    })}</div>
  </div>)}</div>{owned.some((id) => !slots.includes(id)) && <div className="loadout-hand"><header><small>미배치 카드</small></header><div className="card-row centered">{me.ownedCards.filter((card) => !slots.includes(card.id)).map((card) => <CardView key={card.id} card={card} />)}</div></div>}</div>;
}
