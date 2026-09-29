import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PlayerView } from "../shared/protocol";
import type { GameAction } from "../shared/protocol";
import { ABILITY_CARDS } from "./abilityCatalog";
import { AbilityCard } from "./AbilityCard";
import { PhaseTimer } from "./PhaseTimer";
import { useTranslation } from "../i18n";
import "./abilitySelection.css";

export function AbilitySelectionPanel({ view, send, seconds = 0, disabled = false }: { view: PlayerView; send: (action: GameAction) => void; seconds?: number; disabled?: boolean }) {
  const { t } = useTranslation();
  const draft = view.abilityDraft;
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const ownAbility = draft?.myPick?.abilityId;
  // A turn update must not dismiss or replace the card being inspected.
  useEffect(() => {
    if (ownAbility) dialog.current?.showModal();
  }, [ownAbility]);
  useEffect(() => {
    const element = dialog.current;
    return () => { element?.close(); };
  }, []);
  if (!draft) return null;
  const phase = view.phase;
  const orderNames = new Map(view.players.map(player => [player.playerId, player.name]));
  const selected = draft.abilities?.find(pick => pick.playerId === (selectedPlayer ?? view.me.playerId));
  const inspect = (playerId: string) => { setSelectedPlayer(playerId); dialog.current?.showModal(); };
  const cardGrid = <div className="ability-back-grid">{Array.from({ length: 10 }, (_, slot) => {
    const pick = draft.abilities?.find(pick => pick.slot === slot);
    if (pick) return <button key={slot} type="button" className={`ability-card-back ability-card-thumbnail${pick.playerId === view.me.playerId ? " is-viewer" : ""}`} aria-label={`${orderNames.get(pick.playerId)} · ${t(`ability.card.${pick.abilityId}.name`)} · ${t("ability.viewCard")}`} onClick={() => inspect(pick.playerId)}>
      <img src={`/assets/abilities/${ABILITY_CARDS[pick.abilityId]}`} alt="" draggable={false} />
      <b>{t(`ability.card.${pick.abilityId}.name`)}</b><small>{pick.playerId === view.me.playerId ? t("round.you") : orderNames.get(pick.playerId)}</small>
    </button>;
    return <button key={slot} type="button" className="ability-card-back" disabled={disabled || phase !== "ABILITY_PICK" || !draft.availableSlots.includes(slot) || draft.currentPlayerId !== view.me.playerId} aria-label={t("ability.selection.card", { number: slot + 1 })} onClick={() => send({ type: "ABILITY_PICK", slot })}><span>?</span></button>;
  })}</div>;
  return <section className={`ability-selection is-${phase.toLowerCase()}`}>
    {phase === "ABILITY_ORDER" ? <>
      <p className="ability-selection-kicker">PORENA · ABILITY DRAFT</p>
      <h2>{t("ability.selection.order")}</h2>
      <div className="ability-order-die" aria-label={t("ability.selection.orderDie")}>{String(draft.order.indexOf(view.me.playerId) + 1).padStart(2, "0")}</div>
      <ol className="ability-order-list">{draft.order.map((id, index) => <li key={id} className={id === view.me.playerId ? "is-viewer" : ""}><b>{String(index + 1).padStart(2, "0")}</b><span>{orderNames.get(id) ?? id}</span>{id === view.me.playerId && <small>{t("round.you")}</small>}</li>)}</ol>
    </> : phase === "ABILITY_PICK" ? <>
      <header className="ability-selection-heading"><div><p className="ability-selection-kicker">PORENA · ABILITY DRAFT</p>
      <h2>{t(draft.currentPlayerId === view.me.playerId ? "ability.selection.choose" : "ability.selection.waiting")}</h2></div>
      <PhaseTimer className="ability-selection-timer" seconds={seconds} ariaLabel={`${t("shop.timeLeft")} ${seconds}${t("ability.selection.seconds")}`} /></header>
      <p className="ability-selection-instruction">{t("ability.selection.privateReveal")}</p>
      <div className="ability-selection-turn"><b>{draft.currentPlayerId === view.me.playerId ? t("ability.selection.yourTurn") : t("ability.selection.playerTurn", { player: orderNames.get(draft.currentPlayerId ?? "") ?? "" })}</b><span>{draft.pickedCount + 1} / 8</span></div>
      {cardGrid}
      <small className="ability-selection-count">{draft.pickedCount} / 8</small>
    </> : phase === "ABILITY_REVEAL" ? <>
      <p className="ability-selection-kicker">PORENA · ABILITY DRAFT</p>
      <h2>{t("ability.selection.reveal")}</h2>
      <p className="ability-selection-instruction">{t("ability.selection.privateReveal")}</p>
      {cardGrid}<p className="ability-reveal-countdown" role="status">{t("ability.selection.startsIn", { seconds })}</p>
    </> : null}
    {typeof document !== "undefined" && createPortal(<dialog ref={dialog} className={`ability-draft-dialog${selected?.playerId === view.me.playerId ? " is-viewer" : ""}`} aria-label={selected ? `${orderNames.get(selected.playerId)} · ${t(`ability.card.${selected.abilityId}.name`)}` : t("ability.viewCard")} onClose={() => setSelectedPlayer(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="ability-draft-dialog-content">
        {selected && <AbilityCard ability={selected.abilityId} />}
        <button type="button" autoFocus className="secondary" onClick={() => dialog.current?.close()}>{t("ability.close")}</button>
      </div>
    </dialog>, document.body)}
  </section>;
}
