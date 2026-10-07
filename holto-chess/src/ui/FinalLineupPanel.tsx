import { useState } from "react";
import type { CSSProperties } from "react";
import type { GameAction, PlayerView } from "../shared/protocol";
import { evaluateFive } from "../core/poker/evaluate";
import { CardView } from "./CardView";
import { PhaseTimer } from "./PhaseTimer";
import { compactHandName } from "./handLabel";
import { madeTone } from "./madeTone";
import { useTranslation } from "../i18n";
import { LINEUP_SIZE, lineupOf, swapLineup } from "./finalLineup";

/**
 * Six-round R6 lineup: the strongest five already play and the rest are burned. Tap a burned card
 * and a played card (either order) to swap them; Ready keeps the lineup on screen.
 */
export function FinalLineupPanel({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<string | null>(null);
  const owned = view.me.ownedCards;
  const lineup = lineupOf(view.me.selectedCardIds, owned.map((card) => card.id));
  const played = lineup.map((id) => owned.find((card) => card.id === id)!).filter(Boolean);
  const burned = owned.filter((card) => !lineup.includes(card.id));
  const seat = view.players.find((p) => p.playerId === view.me.playerId);
  const ready = !!seat?.ready;
  const choosing = burned.length > 0;
  const locked = disabled || ready || !choosing;
  const hand = played.length === LINEUP_SIZE ? evaluateFive(played) : undefined;
  const tap = (id: string) => {
    if (locked) return;
    if (!focus || focus === id) { setFocus(focus === id ? null : id); return; }
    const focusPlayed = lineup.includes(focus), idPlayed = lineup.includes(id);
    // Two cards on the same side: move the focus instead of swapping.
    if (focusPlayed === idPlayed) { setFocus(id); return; }
    setFocus(null);
    send({ type: "RUN_LOADOUT", cardIds: swapLineup(lineup, focusPlayed ? focus : id, focusPlayed ? id : focus) });
  };
  const timer = seconds !== null && <PhaseTimer seconds={seconds} ariaLabel={t("lineup.timerAria", { seconds })} />;
  const heading = (copy: string) => <header className="six-round-header">
    <div><small className="draft-kicker">ROUND 06 · THE LAST HAND</small><h2>{t("lineup.heading")}</h2><p>{copy}</p></div>{timer}
  </header>;
  if (seat?.alive === false) return <section className="panel final-lineup">{heading(t("lineup.spectating"))}</section>;
  const card = (item: (typeof owned)[number]) => <div key={item.id} className={`final-lineup-slot ${focus === item.id ? "is-focused" : ""}`}>
    <CardView card={item} selected={focus === item.id} onClick={locked ? undefined : () => tap(item.id)} />
  </div>;
  return <section className="panel final-lineup">
    {heading(t(choosing ? "lineup.help" : "lineup.fixed"))}
    <div className="final-lineup-row is-played">
      <header><b>{t("lineup.played")}</b>{hand && <strong className={`made-${madeTone(hand.displayName)}`}>{compactHandName(hand.displayName, t)}</strong>}</header>
      <div className="final-lineup-cards" style={{ "--count": played.length } as CSSProperties}>{played.map(card)}</div>
    </div>
    {choosing && <div className="final-lineup-row is-burn">
      <header><b>BURN</b><small>{t("lineup.burnHint")}</small></header>
      <div className="final-lineup-cards" style={{ "--count": burned.length } as CSSProperties}>{burned.map(card)}</div>
    </div>}
    <div className="action-bar run-loadout-action"><button className="primary" disabled={disabled || ready} onClick={() => send({ type: "LOCK_RUN_LOADOUT" })}>{t(ready ? "lineup.locked" : "lineup.confirm")}</button></div>
  </section>;
}
