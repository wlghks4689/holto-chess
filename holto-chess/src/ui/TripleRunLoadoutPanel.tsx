import { Fragment, useState } from "react";
import type { GameAction, PlayerView } from "../shared/protocol";
import { CardView } from "./CardView";
import { PhaseTimer } from "./PhaseTimer";
import { ShopAbilityPanel } from "./AbilityVisibility";
import { useTranslation } from "../i18n";
import { R5OpponentBanner } from "./OpponentSelectPanel";
import { swapPlacement, swapRuns, tripleRunOrder, TRIPLE_RUN_SLOTS } from "./tripleRunLoadout";

const RUNS = TRIPLE_RUN_SLOTS / 2;

/**
 * Six-round R5 placement: the six cards already sit in the recommended split. Tap one card, then
 * the card it should trade places with, or swap two neighbouring RUNs whole. Each RUN's pair stays hidden until that RUN plays.
 */
export function TripleRunLoadoutPanel({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<number | null>(null);
  const owned = view.me.ownedCards;
  const order = tripleRunOrder(view.me.selectedCardIds, owned.map((card) => card.id));
  const seat = view.players.find((p) => p.playerId === view.me.playerId);
  const ready = !!seat?.ready;
  const complete = owned.length === RUNS * 2;
  const locked = disabled || ready || !complete;
  const tap = (index: number) => {
    if (locked) return;
    if (focus === null) { setFocus(index); return; }
    setFocus(null);
    if (focus !== index) send({ type: "RUN_LOADOUT", cardIds: swapPlacement(order, focus, index) });
  };
  const swapWhole = (from: number) => {
    if (locked) return;
    setFocus(null);
    send({ type: "RUN_LOADOUT", cardIds: swapRuns(order, from, from + 1) });
  };
  // Eliminated seats have no RUNs to place; they wait for the survivors.
  if (seat?.alive === false) return <section className="panel triple-loadout">
    <header className="six-round-header">
      <div><small className="draft-kicker">ROUND 05 · RUN IT THREE TIMES</small><h2>{t("phase.runLoadout")}</h2><p>{t("triple.spectating")}</p></div>
      {seconds !== null && <PhaseTimer seconds={seconds} ariaLabel={t("triple.timerAria", { seconds })} />}
    </header>
  </section>;
  return <section className="panel triple-loadout">
    <header className="six-round-header is-compact">
      <div><small className="draft-kicker">ROUND 05 · RUN IT THREE TIMES</small><h2>{t("triple.heading")}</h2><p>{t("triple.points")}</p></div>
    </header>
    <R5OpponentBanner view={view} />
    <ShopAbilityPanel ability={view.me.abilityId} benefit={view.me.abilityBenefit} startingCard={view.me.abilityStartingCard} compact />
    {complete ? <div className="triple-runs">
      {/* The clock sits above the RUN 3 box, in the free corner beside the ability panel, so the header stays short. */}
      {seconds !== null && <PhaseTimer className="triple-run-timer" seconds={seconds} ariaLabel={t("triple.timerAria", { seconds })} />}{Array.from({ length: RUNS }, (_, run) => <Fragment key={run}>
      {run > 0 && <button type="button" className="triple-run-swap" disabled={locked} onClick={() => swapWhole(run - 1)}
        aria-label={t("triple.swapRuns", { left: run, right: run + 1 })} title={t("triple.swapRuns", { left: run, right: run + 1 })}>⇄</button>}
      <div className="triple-run">
      <b>{t("triple.run", { run: run + 1 })}</b>
      <div className="triple-run-cards">{[0, 1].map((slot) => {
        const index = run * 2 + slot;
        const card = owned.find((item) => item.id === order[index]);
        return card ? <div key={index} className={`triple-slot ${focus === index ? "is-focused" : ""}`} aria-label={t("triple.slotAria", { run: run + 1, slot: slot + 1 })}>
          <CardView card={card} selected={focus === index} onClick={locked ? undefined : () => tap(index)} />
        </div> : null;
      })}</div>
    </div></Fragment>)}</div> : <p className="six-round-hint is-warning" role="status">{t("triple.forfeitNotice")}</p>}
    <p className="six-round-hint">{complete ? `${t("triple.hint")} ${t("triple.reveal")}` : ""}</p>
    <div className="action-bar run-loadout-action"><button className="primary" disabled={disabled || ready} onClick={() => send({ type: "LOCK_RUN_LOADOUT" })}>{t(ready ? "loadout.locked" : "loadout.confirm")}</button></div>
  </section>;
}
