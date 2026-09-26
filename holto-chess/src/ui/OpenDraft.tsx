import type { CSSProperties } from "react";
import { cardLabel } from "../core/poker/cards";
import type { GameAction, PlayerView } from "../shared/protocol";
import { CardView } from "./CardView";
import { useLocalCountdown } from "./useLocalCountdown";
import "./open-draft.css";
import { R2DraftArena } from "./R2DraftArena";
import { PhaseTimer } from "./PhaseTimer";
import { DraftRuleTooltip } from "./DraftRuleTooltip";
import { useTranslation } from "../i18n";

export function OpenDraftPanel({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
  const { t } = useTranslation();
  const draft = view.draft;
  if (!draft) return null;
  if (view.round === 2) return <R2DraftArena view={view} send={send} disabled={disabled} seconds={seconds} />;
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? id;
  const ordering = view.phase === "DRAFT_ORDER";
  const myTurn = !ordering && draft.currentPlayerId === view.me.playerId;
  return <section className="open-draft panel" aria-label={t("draft.roundAria", { round: view.round })}>
    <header><small className="draft-kicker">ROUND {view.round} · DRAFT PHASE</small><div className="draft-title-row"><h2>{t(ordering ? "draft.title" : "draft.pickOne")}</h2><DraftRuleTooltip round={view.round} /></div>{(ordering || myTurn) && <PhaseTimer className="draft-clock" seconds={seconds ?? (ordering ? 3 : 20)} ariaLabel={t(ordering ? "draft.dealTimer" : "draft.pickTimer", { seconds: seconds ?? (ordering ? 3 : 20) })} />}</header>
    {view.round === 4 && <div className="draft-private-inventory"><small>{t("draft.privateCards")}</small><div className="card-row centered">{view.me.ownedCards.map((card) => <CardView key={card.id} card={card} compact />)}</div></div>}
    <ol className="draft-order">{draft.order.map((entry, index) => <li key={entry.playerId} className={entry.playerId === draft.currentPlayerId ? "current" : ""}>
      <b>{String(index + 1).padStart(2, "0")}</b><span>{name(entry.playerId)}</span><small>{entry.points}P · {entry.stackBB}BB</small>
    </li>)}</ol>
    <><div className={`draft-arena ${ordering ? "is-dealing" : ""}`}><div className="draft-deal-origin" aria-hidden="true">◇</div>{draft.cards.map(({ card, price, claimedBy }, index) => <div key={card.id} className={`draft-offer ${claimedBy ? "claimed" : ""}`} style={{ "--deal-delay": `${150 + index * 90}ms` } as CSSProperties}>
      <CardView card={card} onClick={myTurn && !disabled && !claimedBy && view.me.stackBB >= price ? () => send({ type: "DRAFT_PICK", cardId: card.id }) : undefined} />
      <strong className="draft-price">{price} BB</strong>
      {!ordering && <small>{claimedBy ? name(claimedBy) : t(view.me.stackBB < price ? "draft.insufficientBB" : myTurn ? "draft.canBuy" : "draft.waitTurn")}</small>}
    </div>)}</div>{!ordering && <footer aria-live="polite"><small>{t("draft.currentPicker")}</small><h3>{draft.currentPlayerId ? myTurn ? t("draft.playerYourTurn", { player: name(draft.currentPlayerId) }) : name(draft.currentPlayerId) : t("draft.finished")}</h3><p>{t("draft.autoPurchase")}</p></footer>}</>
  </section>;
}

export function TimedOpenDraftPanel({ durationSeconds, ...props }: Parameters<typeof OpenDraftPanel>[0] & { durationSeconds: number }) {
  const seconds = useLocalCountdown(durationSeconds);
  return <OpenDraftPanel {...props} seconds={seconds} />;
}

export function RunLoadoutPanel({ view, send, disabled, seconds, showTimer = true }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null; showTimer?: boolean;
}) {
  const { t } = useTranslation();
  const owned = view.me.ownedCards;
  const selected = view.me.selectedCardIds;
  const ids = selected.length === 3 ? selected : owned.map((c) => c.id);
  const ready = !!view.players.find((p) => p.playerId === view.me.playerId)?.ready;
  const change = (slot: number, id: string) => {
    const next = [...ids]; const previous = next.indexOf(id);
    if (previous >= 0) [next[slot], next[previous]] = [next[previous]!, next[slot]!];
    send({ type: "RUN_LOADOUT", cardIds: next });
  };
  return <section className="panel run-loadout">
    <h2 className="run-loadout-heading">{t("loadout.headingFirst")}<br className="run-loadout-mobile-break" /> {t("loadout.headingSecond")}</h2>
    <div className="run-loadout-content">
      {showTimer && <div className="run-loadout-timer"><PhaseTimer seconds={seconds ?? 30} ariaLabel={t("loadout.timerAria", { seconds: seconds ?? 30 })} /></div>}
      <div className="run-loadout-slots">{[t("loadout.representative"), t("loadout.run1"), t("loadout.run2")].map((label, index) => <label key={index}>
        <span className="run-loadout-slot-title" role="heading" aria-level={3}>{label}</span>
        {owned.find((c) => c.id === ids[index]) && <CardView card={owned.find((c) => c.id === ids[index])!} />}
        <select aria-label={label} disabled={disabled || ready} value={ids[index]} onChange={(e) => change(index, e.target.value)}>{owned.map((c) => <option value={c.id} key={c.id}>{cardLabel(c)}</option>)}</select>
      </label>)}</div>
      <p className="run-loadout-help">{t("loadout.commonCardHelp")}</p>
    </div>
    <div className="action-bar run-loadout-action"><button className="primary" disabled={disabled || ready} onClick={() => send({ type: "LOCK_RUN_LOADOUT" })}>{t(ready ? "loadout.locked" : "loadout.confirm")}</button></div>
  </section>;
}

export function TimedRunLoadoutPanel({ durationSeconds, ...props }: Parameters<typeof RunLoadoutPanel>[0] & { durationSeconds: number }) {
  const seconds = useLocalCountdown(durationSeconds);
  return <RunLoadoutPanel {...props} seconds={seconds} />;
}
