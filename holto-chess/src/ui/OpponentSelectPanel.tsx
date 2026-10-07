import type { CSSProperties } from "react";
import type { GameAction, PlayerView } from "../shared/protocol";
import { CardView } from "./CardView";
import { PhaseTimer } from "./PhaseTimer";
import { abilityIconUrl } from "./abilityArtworkLoader";
import { useTranslation } from "../i18n";

/**
 * Six-round R5 matchmaking: every survivor's cards are public. The standings leader picks one
 * opponent; the other two play each other. Everyone else watches the choice, then the pairings.
 */
export function OpponentSelectPanel({ view, send, disabled, seconds }: {
  view: PlayerView; send: (action: GameAction) => void; disabled: boolean; seconds: number | null;
}) {
  const { t } = useTranslation();
  const pick = view.opponentSelect;
  if (!pick) return null;
  const player = (id: string) => view.players.find((p) => p.playerId === id);
  const name = (id: string) => player(id)?.name ?? id;
  const chooser = name(pick.chooserId);
  const myChoice = view.me.playerId === pick.chooserId && !pick.opponentId;
  const pairings = pick.opponentId ? [[pick.chooserId, pick.opponentId], pick.order.map((entry) => entry.playerId).filter((id) => id !== pick.chooserId && id !== pick.opponentId)] : [];
  return <section className="panel opponent-select" aria-label={t("opponent.title")}>
    <header className="six-round-header">
      <div><small className="draft-kicker">{t("opponent.eyebrow")}</small><h2>{t(pick.opponentId ? "opponent.matchupTitle" : "opponent.title")}</h2>
        <p>{pick.opponentId ? t("triple.points") : myChoice ? t("opponent.yourPick") : t("opponent.waiting", { player: chooser })}</p></div>
      {/* Everyone sees the clock: the leader's choice, then the pairing reveal before the R5 shop opens. */}
      {seconds !== null && <PhaseTimer seconds={seconds} ariaLabel={t(pick.opponentId ? "opponent.shopTimerAria" : "opponent.timerAria", { seconds })} />}
    </header>
    {pick.opponentId && <div className="opponent-pairings" aria-live="polite">{pairings.map(([left, right]) => <div key={`${left}-${right}`} className={`opponent-pairing ${left === pick.chooserId ? "is-leader" : ""}`}>
      <b>{name(left!)}</b><span>VS</span><b>{name(right!)}</b>
    </div>)}</div>}
    <div className="opponent-seats">{pick.order.map((entry, index) => {
      const leader = entry.playerId === pick.chooserId;
      const chosen = entry.playerId === pick.opponentId;
      const selectable = myChoice && !leader && !disabled;
      const ability = player(entry.playerId)?.abilityId;
      const content = <>
        <header>{ability ? <img src={abilityIconUrl(ability)} alt="" /> : <i aria-hidden="true" />}<b>{name(entry.playerId)}</b><span className="opponent-rank">{t("opponent.rank", { rank: index + 1 })}</span></header>
        <p className="opponent-stats"><span>{entry.points}P</span><span>{entry.stackBB}BB</span></p>
        <div className="opponent-cards" style={{ "--card-count": Math.max(entry.cards.length, 1) } as CSSProperties}>{entry.cards.map((card) => <CardView key={card.id} card={card} compact />)}</div>
        {leader && <span className="opponent-leader">{t("opponent.leader")}</span>}
        {selectable && <span className="opponent-choose">{t("opponent.choose")}</span>}
      </>;
      const className = `opponent-seat ${leader ? "is-leader" : ""} ${chosen ? "is-chosen" : ""} ${entry.playerId === view.me.playerId ? "is-me" : ""} ${selectable ? "is-selectable" : ""}`;
      return selectable
        ? <button type="button" key={entry.playerId} className={className} onClick={() => send({ type: "CHOOSE_OPPONENT", playerId: entry.playerId })}>{content}</button>
        : <article key={entry.playerId} className={className}>{content}</article>;
    })}</div>
    <p className="six-round-hint">{t(pick.opponentId ? "opponent.shopSoon" : "opponent.timeoutHint")}</p>
  </section>;
}

/** R5 shop and placement: who this seat plays, once the leader has chosen. */
export function R5OpponentBanner({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const pair = view.pairings?.find((ids) => ids.includes(view.me.playerId));
  const opponentId = pair?.find((id) => id !== view.me.playerId);
  if (!opponentId) return null;
  return <p className="r5-opponent-banner" role="status">{t("opponent.yourOpponent", { player: view.players.find((p) => p.playerId === opponentId)?.name ?? opponentId })}</p>;
}
