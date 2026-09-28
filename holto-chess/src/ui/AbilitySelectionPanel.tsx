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
  if (!draft) return null;
  const phase = view.phase;
  const orderNames = new Map(view.players.map(player => [player.playerId, player.name]));
  return <section className={`ability-selection is-${phase.toLowerCase()}`} aria-live="polite">
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
      {draft.myPick && <aside className="ability-picked-preview" aria-live="polite"><h3>{t("ability.selection.yourCard")}</h3><AbilityCard ability={draft.myPick.abilityId} /></aside>}
      <div className="ability-back-grid">{Array.from({ length: 10 }, (_, slot) => {
        const available = draft.availableSlots.includes(slot);
        if (draft.myPick?.slot === slot) return <div key={slot} className="ability-card-back is-picked" role="img" aria-label={t("ability.selection.pickedCard")}><span>✓</span></div>;
        return <button key={slot} type="button" className="ability-card-back" disabled={disabled || !available || draft.currentPlayerId !== view.me.playerId} aria-label={t("ability.selection.card", { number: slot + 1 })} onClick={() => send({ type: "ABILITY_PICK", slot })}><span>?</span></button>;
      })}</div>
      <small className="ability-selection-count">{draft.pickedCount} / 8</small>
    </> : phase === "ABILITY_REVEAL" ? <>
      <p className="ability-selection-kicker">PORENA · ABILITY DRAFT</p>
      <h2>{t("ability.selection.reveal")}</h2>
      <div className="ability-reveal-grid">{(draft.abilities ?? []).map(({ playerId, abilityId }) => <article key={playerId} className={playerId === view.me.playerId ? "is-viewer" : ""}>
        <img src={`/assets/abilities/${ABILITY_CARDS[abilityId]}`} alt="" /><div><b>{orderNames.get(playerId) ?? playerId}</b><span>{t(`ability.card.${abilityId}.name`)}</span></div>
      </article>)}</div><p className="ability-reveal-countdown">{t("ability.selection.startsIn", { seconds })}</p>
    </> : null}
  </section>;
}
