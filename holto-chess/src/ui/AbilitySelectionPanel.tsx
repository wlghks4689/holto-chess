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

type Box = { left: number; top: number; width: number; height: number };
// The last pick finishes turning over before the eight cards glide into the reveal grid.
const GATHER_DELAY_MS = 380;
const GATHER_MS = 620;

export function AbilitySelectionPanel({ view, send, seconds = 0, disabled = false }: { view: PlayerView; send: (action: GameAction) => void; seconds?: number; disabled?: boolean }) {
  const { t } = useTranslation();
  const { enabled: motionEnabled } = useCinematicMotion();
  const draft = view.abilityDraft;
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const pickBoxes = useRef<Map<number, Box> | null>(null);
  const [ghosts, setGhosts] = useState<Box[]>([]);
  const ownAbility = draft?.myPick?.abilityId;
  // The frame is warmed during the order reveal; icons only once their card is picked and shown.
  const revealed = draft?.abilities?.map(pick => pick.abilityId).join(",") ?? "";
  useEffect(() => { preloadAbilityArtwork(revealed ? revealed.split(",") as AbilityId[] : []); }, [revealed]);
  // A turn update must not dismiss or replace the card being inspected.
  useEffect(() => {
    if (ownAbility) dialog.current?.showModal();
  }, [ownAbility]);
  useEffect(() => {
    const element = dialog.current;
    return () => { element?.close(); };
  }, []);
  const phase = view.phase;
  // PICK -> REVEAL: remember where every slot sat, then slide the picked cards from there (FLIP)
  // while the unpicked ones fade out in place. Joining straight into REVEAL just shows the grid.
  useLayoutEffect(() => {
    const root = section.current;
    if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect();
      return new Map([...root.querySelectorAll<HTMLElement>(".ability-back-grid > [data-slot]")].map(element => {
        const box = element.getBoundingClientRect();
        return [Number(element.dataset.slot), { left: box.left - base.left, top: box.top - base.top, width: box.width, height: box.height }] as const;
      }));
    };
    if (phase === "ABILITY_PICK") { pickBoxes.current = measure(); return; }
    const before = pickBoxes.current;
    pickBoxes.current = null;
    if (phase !== "ABILITY_REVEAL" || !before || !motionEnabled) return;
    const after = measure();
    for (const [slot, to] of after) {
      const from = before.get(slot), element = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      if (!from || !element || !to.width) continue;
      element.animate([
        { transformOrigin: "top left", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` },
        { transformOrigin: "top left", transform: "none" },
      ], { duration: GATHER_MS, delay: GATHER_DELAY_MS, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    }
    setGhosts([...before].filter(([slot, box]) => !after.has(slot) && box.width > 0).map(([, box]) => box));
  }, [phase, draft?.pickedCount, motionEnabled]);
  useEffect(() => {
    if (!ghosts.length) return;
    const timer = setTimeout(() => setGhosts([]), GATHER_DELAY_MS + GATHER_MS);
    return () => clearTimeout(timer);
  }, [ghosts]);
  if (!draft) return null;
  const ready = view.players.find(player => player.playerId === view.me.playerId)?.ready;
  const orderNames = new Map(view.players.map(player => [player.playerId, player.name]));
  const selected = draft.abilities?.find(pick => pick.playerId === (selectedPlayer ?? view.me.playerId));
  const inspect = (playerId: string) => { setSelectedPlayer(playerId); dialog.current?.showModal(); };
  const slots = phase === "ABILITY_REVEAL"
    ? [...(draft.abilities?.map(pick => pick.slot) ?? [])].sort((a, b) => a - b)
    : Array.from({ length: draft.slotCount }, (_, slot) => slot);
  const cardGrid = <div className="ability-back-grid" style={{ "--ability-columns": Math.ceil(slots.length / 2) } as CSSProperties}>{slots.map((slot) => {
    const pick = draft.abilities?.find(pick => pick.slot === slot);
    return <AbilityDraftSlot key={slot} slot={slot} ability={pick?.abilityId} own={pick?.playerId === view.me.playerId}
      title={pick ? t(`ability.card.${pick.abilityId}.name`) : undefined}
      owner={pick ? pick.playerId === view.me.playerId ? t("round.you") : orderNames.get(pick.playerId) : undefined}
      label={pick ? `${orderNames.get(pick.playerId)} · ${t(`ability.card.${pick.abilityId}.name`)} · ${t("ability.viewCard")}` : t("ability.selection.card", { number: slot + 1 })}
      disabled={!pick && (disabled || phase !== "ABILITY_PICK" || !draft.availableSlots.includes(slot) || draft.currentPlayerId !== view.me.playerId)}
      onClick={() => pick ? inspect(pick.playerId) : send({ type: "ABILITY_PICK", slot })} />;
  })}{phase !== "ABILITY_REVEAL" && Array.from({ length: (4 - draft.slotCount % 4) % 4 }, (_, index) => <div key={draft.slotCount + index} data-slot={-1 - index} className="ability-card-back ability-card-placeholder" aria-hidden="true"><span>?</span></div>)}</div>;
  return <section ref={section} className={`ability-selection is-${phase.toLowerCase()}${motionEnabled ? " ability-motion-enabled" : ""}`}>
    {ghosts.map((box, index) => <span key={index} className="ability-card-back ability-gather-ghost" aria-hidden="true" style={box}><span>?</span></span>)}
    {phase === "ABILITY_ORDER" ? <>
      <p className="ability-selection-kicker">PORENA · ABILITY DRAFT</p>
      <h2>{t("ability.selection.order")}</h2>
      <div className="ability-order-die" aria-label={t("ability.selection.orderDie")}>{String(draft.order.indexOf(view.me.playerId) + 1).padStart(2, "0")}</div>
      <ol className="ability-order-list">{draft.order.map((id, index) => <li key={id} className={id === view.me.playerId ? "is-viewer" : ""}><b>{String(index + 1).padStart(2, "0")}</b><span>{orderNames.get(id) ?? id}</span>{id === view.me.playerId && <small>{t("round.you")}</small>}</li>)}</ol>
    </> : <>
      <div className="ability-draft-heading">
      {phase === "ABILITY_PICK" ? <>
      <header className="ability-selection-heading"><div><p className="ability-selection-kicker">PORENA · ABILITY DRAFT</p>
      <h2>{t(draft.currentPlayerId === view.me.playerId ? "ability.selection.choose" : "ability.selection.waiting")}</h2></div>
      <PhaseTimer className="ability-selection-timer" seconds={seconds} ariaLabel={`${t("shop.timeLeft")} ${seconds}${t("ability.selection.seconds")}`} /></header>
      <p className="ability-selection-instruction">{t("ability.selection.privateReveal")}</p>
      <div className="ability-selection-turn"><b>{draft.currentPlayerId === view.me.playerId ? t("ability.selection.yourTurn") : t("ability.selection.playerTurn", { player: orderNames.get(draft.currentPlayerId ?? "") ?? "" })}</b><span>{draft.pickedCount + 1} / 8</span></div>
      </> : <>
      <h2>{t("ability.selection.reveal")}</h2>
      <p className="ability-selection-instruction">{t("ability.selection.privateReveal")}</p>
      </>}
      </div>
      {cardGrid}
      {phase !== "ABILITY_PICK" && <div className="ability-reveal-actions">
        <p className="ability-reveal-countdown" role="status">{t("ability.selection.startsIn", { seconds })}</p>
        <button type="button" className="primary" disabled={disabled || ready || !view.me.alive} onClick={() => send({ type: "READY" })}>{t(ready ? "online.readyDone" : "online.readyAction")}</button>
      </div>}
    </>}
    {typeof document !== "undefined" && createPortal(<dialog ref={dialog} className={`ability-draft-dialog${selected?.playerId === view.me.playerId ? " is-viewer" : ""}`} aria-label={selected ? `${orderNames.get(selected.playerId)} · ${t(`ability.card.${selected.abilityId}.name`)}` : t("ability.viewCard")} onClose={() => setSelectedPlayer(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="ability-draft-dialog-content">
        {selected && <><AbilityCard key={`${selected.playerId}:${selected.abilityId}`} ability={selected.abilityId} flippable /><p className="ability-flip-hint">{t("ability.flipHint")}</p></>}
        <button type="button" autoFocus className="secondary" onClick={() => dialog.current?.close()}>{t("ability.close")}</button>
      </div>
    </dialog>, document.body)}
  </section>;
}
