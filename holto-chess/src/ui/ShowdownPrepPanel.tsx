import { Fragment, useMemo, type CSSProperties } from "react";
import type { ShowdownPrepSeatView, ShowdownPrepView } from "../shared/protocol";
import { CardBack, CardView } from "./CardView";
import { showdownEquity, r4ThreeWayEquity } from "./showdownEquity";
import { abilityIconUrl } from "./abilityArtworkLoader";
import "./showdown-prep.css";
import { useTranslation } from "../i18n";
import { roundTitle } from "./roundTitles";

function PrepAvatar({ seat, fallback, className }: { seat?: ShowdownPrepSeatView; fallback: string; className: string }) {
  const { t } = useTranslation();
  const ability = seat?.abilityId;
  const label = ability ? t(`ability.card.${ability}.name`) : undefined;
  return ability
    ? <img className={`${className}-icon`} src={abilityIconUrl(ability)} alt={label} title={label} />
    : <span className={className}>{fallback}</span>;
}

/** The final's loading screen: four seats in five-round games, three in the six-round R6. */
export function FinalRoundTransition({ matchup, playerName = "PLAYER", seconds = null, round = 5 }: { matchup?: ShowdownPrepView; playerName?: string; seconds?: number | null; round?: number }) {
  return <StandardShowdownPrepPanel round={round} final playerName={playerName} seconds={seconds} matchup={matchup} />;
}

function PrepSeat({ seat, viewer, pending = false, winPercent, hidden = false, hiddenCount = 7 }: { seat?: ShowdownPrepSeatView; viewer: boolean; pending?: boolean; winPercent?: number; hidden?: boolean; hiddenCount?: number }) {
  const { t } = useTranslation();
  const name = seat?.name ?? t("showdown.findingOpponent");
  const avatar = pending ? "?" : [...name][0] ?? "P";
  const cards = seat?.cards.slice(0, 7) ?? [];
  return <article className={`showdown-prep-player ${viewer ? "is-viewer" : "is-opponent"} ${pending ? "is-pending" : ""}`}>
    <div className="showdown-prep-identity"><PrepAvatar className="showdown-prep-avatar" seat={seat} fallback={avatar} /><div><b title={name}>{name}</b><small>{t("showdown.points", { points: seat?.points ?? "—" })}</small></div></div>
    <div className="showdown-prep-hand" data-count={hidden ? hiddenCount : cards.length} aria-label={t("showdown.cardsAria", { player: name })}>
      {hidden ? Array.from({ length: hiddenCount }, (_, i) => <CardBack key={i} compact />) : cards.map((card) => <CardView key={card.id} card={card} compact />)}
    </div>
    {!!seat?.blockCards?.length && <div className="final-block-cards"><small>BURN</small><div>{seat.blockCards.map(card => <CardView key={card.id} card={card} compact />)}</div></div>}
    {winPercent !== undefined && <p className="showdown-prep-equity" aria-label={t("showdown.equityAria", { player: name, percent: winPercent })}>{t("showdown.equityLabel")} <strong>{winPercent}%</strong></p>}
  </article>;
}

function StandardShowdownPrepPanel({ round, playerName, seconds, secondary = false, matchup, final = round === 5 }: {
  round: number; playerName: string; seconds: number | null; secondary?: boolean; matchup?: ShowdownPrepView; final?: boolean;
}) {
  const { t } = useTranslation();
  const viewer = matchup?.viewer ?? { playerId: "viewer", name: playerName, points: 0, cards: [] };
  const available = matchup?.opponents ?? (matchup?.opponent ? [matchup.opponent] : []);
  // The five-round final seats four; the six-round R6 final seats three.
  const finalOpponents = round === 6 ? 2 : 3;
  const opponents = final ? Array.from({ length: finalOpponents }, (_, i) => available[i] ?? { playerId: `pending-${i}`, name: t("showdown.findingOpponent"), points: 0, cards: [] }) : available;
  const multiway = opponents.length > 1;
  const matchNumber = matchup?.matchNumber ?? (secondary ? 2 : 1);
  const duration = Math.max(1, seconds ?? 3);
  const equity = useMemo(() => {
    if (round === 4 && matchup?.opponents?.length === 2) {
      return r4ThreeWayEquity([matchup.viewer.cards, ...matchup.opponents.map(seat => seat.cards)]);
    }
    const opponent = matchup?.opponents?.length === 1 ? matchup.opponents[0] : matchup?.opponent;
    return !final && matchup && opponent && (!matchup.opponents || matchup.opponents.length === 1)
      ? showdownEquity(round as 1 | 2 | 3 | 4 | 5, matchup.viewer.cards, opponent.cards) : null;
  }, [round, matchup, final]);
  return <section className={`showdown-prep match-loading ${final ? "final-match-loading" : ""}`} data-round={round} aria-label={t("showdown.matchLoadingAria")} style={{ "--prep-duration": `${duration}s` } as CSSProperties}>
    <header className="showdown-prep-heading"><small>ROUND {String(round).padStart(2, "0")} · MATCH {matchNumber}</small><h1>{roundTitle(round, round === 6 ? 6 : 5)}</h1></header>
    <div className={`showdown-prep-stage ${multiway ? `is-multiway is-${opponents.length + 1}-way` : ""}`}>
      {multiway ? <>
        <PrepSeat seat={viewer} viewer hidden={final && viewer.equity === undefined && (round !== 6 || !viewer.cards.length)} hiddenCount={round === 6 ? 5 : 7} winPercent={viewer.equity === undefined ? equity?.[0] : Math.round(viewer.equity)} />
        {opponents.map((opponent, index) => <PrepSeat key={opponent.playerId} seat={opponent} viewer={false} hidden={final && opponent.equity === undefined && (round !== 6 || !opponent.cards.length)} hiddenCount={round === 6 ? 5 : 7} winPercent={opponent.equity === undefined ? equity?.[index + 1] : Math.round(opponent.equity)} />)}
        <strong className="showdown-prep-vs" aria-label={t("showdown.versus")}>VS</strong>
      </> : <>
        <PrepSeat seat={viewer} viewer winPercent={equity?.[0]} />
        <strong className="showdown-prep-vs" aria-label={t("showdown.versus")}>VS</strong>
        <PrepSeat seat={opponents[0]} viewer={false} pending={!opponents.length} winPercent={equity?.[1]} />
      </>}
    </div>
    <footer className="showdown-prep-footer" role="status"><strong>SHOWDOWN</strong><span aria-hidden="true"><i /></span></footer>
  </section>;
}

function RunTwicePrepPanel({ playerName, matchup }: { playerName: string; matchup?: ShowdownPrepView }) {
  const { t } = useTranslation();
  const viewer = matchup?.viewer;
  const opponents = matchup?.opponents ?? (matchup?.opponent ? [matchup.opponent] : []);
  const opponent = opponents.length === 1 ? opponents[0] : undefined;
  const equities = useMemo(() => {
    if (!viewer?.runCards || !opponent?.runCards) return [[null, null], [null, null]] as const;
    const deadCards = [...viewer.cards, ...opponent.cards];
    return [0, 1].map((run) => {
      const left = viewer.runCards![run]!, right = opponent.runCards![run]!;
      return left.length === 2 && right.length === 2 ? showdownEquity(2, left, right, deadCards) ?? [null, null] : [null, null];
    }) as [[number | null, number | null], [number | null, number | null]];
  }, [viewer, opponent]);
  const seats = [viewer, opponent] as const;
  const names = [viewer?.name ?? playerName, opponent?.name ?? t("showdown.findingOpponent")] as const;
  return <section className="showdown-prep match-loading r2-match-prep" aria-label={t("showdown.matchLoadingAria")}>
    <header className="showdown-prep-heading"><small>ROUND 02 · MATCH {matchup?.matchNumber ?? 1}</small><h1>RUN IT TWICE</h1></header>
    <div className="r2-match-stage">
      {seats.map((seat, index) => <Fragment key={seat?.playerId ?? `pending-${index}`}>
        <article className={`r2-match-player ${index === 0 ? "is-viewer" : "is-opponent"} ${seat ? "" : "is-pending"}`}>
          <header className="r2-match-identity"><PrepAvatar className="r2-match-avatar" seat={seat} fallback={seat ? [...seat.name][0] ?? "P" : "?"} /><div><b title={names[index]}>{names[index]}</b><small>{seat ? t("showdown.points", { points: seat.points }) : "—"}</small></div></header>
          <div className="r2-run-list">{([0, 1] as const).map((run) => {
            const cards = seat?.runCards?.[run] ?? [];
            const percent = equities[run][index] ?? null;
            return <section className="r2-run-preview" key={run} aria-label={`RUN ${run + 1}`}>
              <h2>RUN {run + 1}</h2>
              <div className="r2-run-preview-body"><div className="r2-run-cards">{cards.slice(0, 2).map((card) => <CardView key={card.id} card={card} compact />)}{Array.from({ length: Math.max(0, 2 - cards.length) }, (_, i) => <span className="r2-run-card-placeholder" key={`empty-${i}`} />)}</div><div className="r2-run-equity"><small>{t("showdown.equityLabel")}</small><strong>{percent === null ? "--" : `${percent}%`}</strong></div></div>
            </section>;
          })}</div>
        </article>
        {index === 0 && <strong className="r2-match-vs" aria-label={t("showdown.versus")}>VS</strong>}
      </Fragment>)}
    </div>
    <footer className="showdown-prep-footer r2-match-footer"><strong>SHOWDOWN</strong><small>{t("showdown.runEquityNote")}</small></footer>
  </section>;
}

/** Six-round R5: the viewer sees their own three RUN pairs; the opponent's cards stay face down until each RUN. */
function TripleRunPrepPanel({ playerName, matchup }: { playerName: string; matchup?: ShowdownPrepView }) {
  const { t } = useTranslation();
  const viewer = matchup?.viewer;
  const opponent = matchup?.opponent ?? matchup?.opponents?.[0];
  const seats = [viewer, opponent] as const;
  const names = [viewer?.name ?? playerName, opponent?.name ?? t("showdown.findingOpponent")] as const;
  return <section className="showdown-prep match-loading r2-match-prep r5-match-prep" aria-label={t("showdown.matchLoadingAria")}>
    <header className="showdown-prep-heading"><small>ROUND 05 · MATCH 1</small><h1>RUN IT THREE TIMES</h1></header>
    <div className="r2-match-stage">
      {seats.map((seat, index) => <Fragment key={seat?.playerId ?? `pending-${index}`}>
        <article className={`r2-match-player ${index === 0 ? "is-viewer" : "is-opponent"} ${seat ? "" : "is-pending"}`}>
          <header className="r2-match-identity"><PrepAvatar className="r2-match-avatar" seat={seat} fallback={seat ? [...seat.name][0] ?? "P" : "?"} /><div><b title={names[index]}>{names[index]}</b><small>{seat ? t("showdown.points", { points: seat.points }) : "—"}</small></div></header>
          <div className="r2-run-list">{([0, 1, 2] as const).map((run) => {
            const cards = seat?.runCards?.[run];
            return <section className="r2-run-preview" key={run} aria-label={`RUN ${run + 1}`}>
              <h2>RUN {run + 1}</h2>
              <div className="r2-run-preview-body"><div className="r2-run-cards">{cards ? cards.map((card) => <CardView key={card.id} card={card} compact />)
                : [0, 1].map((slot) => <CardBack key={slot} compact />)}</div></div>
            </section>;
          })}</div>
        </article>
        {index === 0 && <strong className="r2-match-vs" aria-label={t("showdown.versus")}>VS</strong>}
      </Fragment>)}
    </div>
    <footer className="showdown-prep-footer r2-match-footer"><strong>SHOWDOWN</strong><small>{t("triple.reveal")}</small></footer>
  </section>;
}

/** `final` marks the game's last round; it defaults to the five-round R5 final. */
export function ShowdownPrepPanel(props: { round: number; playerName: string; seconds: number | null; secondary?: boolean; matchup?: ShowdownPrepView; final?: boolean }) {
  const final = props.final ?? props.round === 5;
  if (props.round === 2) return <RunTwicePrepPanel playerName={props.playerName} matchup={props.matchup} />;
  if (props.round === 5 && !final) return <TripleRunPrepPanel playerName={props.playerName} matchup={props.matchup} />;
  return <StandardShowdownPrepPanel {...props} final={final} />;
}
