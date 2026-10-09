import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { PlayerView } from "../shared/protocol";
import type { GameAction } from "../shared/protocol";
import { AbilityDraftSlot } from "./AbilityDraftSlot";
import { preloadAbilityArtwork } from "./abilityArtworkLoader";
import type { AbilityId } from "./abilityCatalog";
import { AbilityCard } from "./AbilityCard";
import { PhaseTimer } from "./PhaseTimer";
import { useCinematicMotion } from "./useCinematicMotion";
import { useTranslation } from "../i18n";
import "./abilitySelection.css";

/**
 * ABILITY_DEAL: each seat sees only its own dealt ability, large and readable, for a few seconds.
 * ABILITY_REVEAL: every seat's ability in one grid until everyone is ready.
 * Straight from the deal, one's own card glides from where it was dealt into its grid slot and the others rise in.
 */
export function AbilitySelectionPanel({ view, send, seconds = 0, disabled = false }: { view: PlayerView; send: (action: GameAction) => void; seconds?: number; disabled?: boolean }) {
  const { t } = useTranslation();
  const { enabled: motionEnabled } = useCinematicMotion();
  const draft = view.abilityDraft;
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const shown = [draft?.mine, ...draft?.abilities.map(pick => pick.abilityId) ?? []].filter(Boolean).join(",");
  useEffect(() => { preloadAbilityArtwork(shown ? shown.split(",") as AbilityId[] : []); }, [shown]);
  const dealCard = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const dealtAt = useRef<DOMRect | null>(null);
  const phase = view.phase;
  useLayoutEffect(() => {
    if (phase === "ABILITY_DEAL") {
      // The wrapper is never transformed, so its top edge and width are where the card rests.
      const measure = () => { dealtAt.current = dealCard.current?.getBoundingClientRect() ?? null; };
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const from = dealtAt.current;
    dealtAt.current = null;
    if (phase !== "ABILITY_REVEAL" || !from || !motionEnabled || !grid.current) return;
    const slots = [...grid.current.querySelectorAll<HTMLElement>(".ability-draft-slot")];
    let order = 0;
    for (const slot of slots) {
      const to = slot.getBoundingClientRect();
      if (slot.classList.contains("is-viewer") && to.width > 0) {
        const scale = from.width / to.width;
        slot.animate([
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scale})`, transformOrigin: "0 0", zIndex: 3 },
          { transform: "none", transformOrigin: "0 0", zIndex: 3 },
        ], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
      } else {
        slot.animate([{ opacity: 0, transform: "translateY(14px) scale(.94)" }, { opacity: 1, transform: "none" }],
          { duration: 420, delay: 300 + order++ * 70, easing: "ease-out", fill: "backwards" });
      }
    }
  }, [phase, motionEnabled]);
  if (!draft) return null;
  const motion = motionEnabled ? " ability-motion-enabled" : "";
  if (phase === "ABILITY_DEAL") return <section className={`ability-selection is-ability_deal${motion}`}>
    <header className="ability-selection-heading"><div><p className="ability-selection-kicker">PORENA · ABILITY</p>
      <h2>{t("ability.deal.title")}</h2></div>
      <PhaseTimer className="ability-selection-timer" seconds={seconds} ariaLabel={`${t("shop.timeLeft")} ${seconds}${t("ability.selection.seconds")}`} /></header>
    <p className="ability-selection-instruction">{t("ability.deal.hint")}</p>
    {draft.mine && <div className="ability-deal-card" ref={dealCard}><AbilityCard ability={draft.mine} flippable /><p className="ability-flip-hint">{t("ability.flipHint")}</p></div>}
  </section>;

  const ready = view.players.find(player => player.playerId === view.me.playerId)?.ready;
  const orderNames = new Map(view.players.map(player => [player.playerId, player.name]));
  const selected = draft.abilities.find(pick => pick.playerId === (selectedPlayer ?? view.me.playerId));
  const inspect = (playerId: string) => { setSelectedPlayer(playerId); dialog.current?.showModal(); };
  const picks = [...draft.abilities].sort((a, b) => a.slot - b.slot);
  return <section className={`ability-selection is-ability_reveal${motion}`}>
    <div className="ability-draft-heading">
      <h2>{t("ability.selection.reveal")}</h2>
      <p className="ability-selection-instruction">{t("ability.selection.privateReveal")}</p>
    </div>
    <div className="ability-back-grid" ref={grid} style={{ "--ability-columns": Math.ceil(picks.length / 2) } as CSSProperties}>{picks.map((pick) =>
      <AbilityDraftSlot key={pick.slot} ability={pick.abilityId} own={pick.playerId === view.me.playerId}
        title={t(`ability.card.${pick.abilityId}.name`)}
        owner={pick.playerId === view.me.playerId ? t("round.you") : orderNames.get(pick.playerId)}
        label={`${orderNames.get(pick.playerId)} · ${t(`ability.card.${pick.abilityId}.name`)} · ${t("ability.viewCard")}`}
        disabled={false} onClick={() => inspect(pick.playerId)} />)}</div>
    <div className="ability-reveal-actions">
      <p className="ability-reveal-countdown" role="status">{t("ability.selection.startsIn", { seconds })}</p>
      <button type="button" className="primary" disabled={disabled || ready || !view.me.alive} onClick={() => send({ type: "READY" })}>{t(ready ? "online.readyDone" : "online.readyAction")}</button>
    </div>
    {typeof document !== "undefined" && createPortal(<dialog ref={dialog} className={`ability-draft-dialog${selected?.playerId === view.me.playerId ? " is-viewer" : ""}`} aria-label={selected ? `${orderNames.get(selected.playerId)} · ${t(`ability.card.${selected.abilityId}.name`)}` : t("ability.viewCard")} onClose={() => setSelectedPlayer(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="ability-draft-dialog-content">
        {selected && <><AbilityCard key={`${selected.playerId}:${selected.abilityId}`} ability={selected.abilityId} flippable /><p className="ability-flip-hint">{t("ability.flipHint")}</p></>}
        <button type="button" autoFocus className="secondary" onClick={() => dialog.current?.close()}>{t("ability.close")}</button>
      </div>
    </dialog>, document.body)}
  </section>;
}
