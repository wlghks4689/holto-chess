import { Fragment, useMemo, type CSSProperties } from "react";
import type { ShowdownPrepSeatView, ShowdownPrepView } from "../shared/protocol";
import { CardView } from "./CardView";
import { showdownEquity } from "./showdownEquity";
import "./showdown-prep.css";
import { useTranslation } from "../i18n";

const ROUND_TITLES = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "THE LAST HAND"];

export function FinalRoundTransition() {
  const { t } = useTranslation();
  return <section className="panel transition-panel"><span className="final-round-mark"><small>ROUND</small><strong>05</strong></span><h2>{t("showdown.finalPreparing")}</h2></section>;
}

function PrepSeat({ seat, viewer, pending = false, winPercent }: { seat?: ShowdownPrepSeatView; viewer: boolean; pending?: boolean; winPercent?: number }) {
  const { t } = useTranslation();
  const name = seat?.name ?? t("showdown.findingOpponent");
  const avatar = pending ? "?" : [...name][0] ?? "P";
  const cards = seat?.cards.slice(0, 7) ?? [];
  return <article className={`showdown-prep-player ${viewer ? "is-viewer" : "is-opponent"} ${pending ? "is-pending" : ""}`}>
    <div className="showdown-prep-identity"><span className="showdown-prep-avatar">{avatar}</span><div><b>{name}</b><small>{t("showdown.points", { points: seat?.points ?? "—" })}</small></div></div>
    <div className="showdown-prep-hand" aria-label={t("showdown.cardsAria", { player: name })}>
      {cards.map((card) => <CardView key={card.id} card={card} compact />)}
    </div>
    {winPercent !== undefined && <p className="showdown-prep-equity" aria-label={t("showdown.equityAria", { player: name, percent: winPercent })}>{t("showdown.equityLabel")} <strong>{winPercent}%</strong></p>}
  </article>;
}

function StandardShowdownPrepPanel({ round, playerName, seconds, secondary = false, matchup }: {
  round: number; playerName: string; seconds: number | null; secondary?: boolean; matchup?: ShowdownPrepView;
}) {
  const { t } = useTranslation();
  const viewer = matchup?.viewer ?? { playerId: "viewer", name: playerName, points: 0, cards: [] };
  const opponents = matchup?.opponents ?? (matchup?.opponent ? [matchup.opponent] : []);
  const multiway = opponents.length > 1;
  const matchNumber = matchup?.matchNumber ?? (secondary ? 2 : 1);
  const duration = Math.max(1, seconds ?? 3);
  const equity = useMemo(() => {
    const opponent = matchup?.opponents?.length === 1 ? matchup.opponents[0] : matchup?.opponent;
    return matchup && opponent && (!matchup.opponents || matchup.opponents.length === 1)
      ? showdownEquity(round as 1 | 2 | 3 | 4 | 5, matchup.viewer.cards, opponent.cards) : null;
  }, [round, matchup]);
  return <section className="showdown-prep match-loading" aria-label={t("showdown.matchLoadingAria")} style={{ "--prep-duration": `${duration}s` } as CSSProperties}>
    <header className="showdown-prep-heading"><small>ROUND {String(round).padStart(2, "0")} · MATCH {matchNumber}</small><h1>{ROUND_TITLES[round] ?? `ROUND ${round}`}</h1></header>
    <div className={`showdown-prep-stage ${multiway ? `is-multiway is-${opponents.length + 1}-way` : ""}`}>
      {multiway ? <>
        <PrepSeat seat={viewer} viewer />
        {opponents.map((opponent) => <PrepSeat key={opponent.playerId} seat={opponent} viewer={false} />)}
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
    if (!viewer?.runCards || !opponent?.runCards) return [null, null] as const;
    const deadCards = [...viewer.cards, ...opponent.cards];
    return [0, 1].map((run) => {
      const left = viewer.runCards![run]!, right = opponent.runCards![run]!;
      return left.length === 2 && right.length === 2 ? showdownEquity(2, left, right, deadCards)?.[0] ?? null : null;
    }) as [number | null, number | null];
  }, [viewer, opponent]);
  const seats = [viewer, opponent] as const;
  const names = [viewer?.name ?? playerName, opponent?.name ?? t("showdown.findingOpponent")] as const;
  return <section className="showdown-prep match-loading r2-match-prep" aria-label={t("showdown.matchLoadingAria")}>
    <header className="showdown-prep-heading"><small>ROUND 02 · MATCH {matchup?.matchNumber ?? 1}</small><h1>RUN IT TWICE</h1></header>
    <div className="r2-match-stage">
      {seats.map((seat, index) => <Fragment key={seat?.playerId ?? `pending-${index}`}>
        <article className={`r2-match-player ${index === 0 ? "is-viewer" : "is-opponent"} ${seat ? "" : "is-pending"}`}>
          <header className="r2-match-identity"><span className="r2-match-avatar">{seat ? [...seat.name][0] ?? "P" : "?"}</span><div><b title={names[index]}>{names[index]}</b><small>{seat ? t("showdown.points", { points: seat.points }) : "—"}</small></div></header>
          <div className="r2-run-list">{([0, 1] as const).map((run) => {
            const cards = seat?.runCards?.[run] ?? [];
            const percent = index === 0 ? equities[run] : equities[run] === null ? null : 100 - equities[run]!;
            return <section className="r2-run-preview" key={run} aria-label={`RUN ${run + 1}`}>
              <h2>RUN {run + 1}</h2>
              <div className="r2-run-preview-body"><div className="r2-run-cards">{cards.slice(0, 2).map((card) => <CardView key={card.id} card={card} compact />)}{Array.from({ length: Math.max(0, 2 - cards.length) }, (_, i) => <span className="r2-run-card-placeholder" key={`empty-${i}`} />)}</div><div className="r2-run-equity"><small>예상 승률</small><strong>{percent === null ? "--" : `${percent}%`}</strong></div></div>
            </section>;
          })}</div>
        </article>
        {index === 0 && <strong className="r2-match-vs" aria-label={t("showdown.versus")}>VS</strong>}
      </Fragment>)}
    </div>
    <footer className="showdown-prep-footer r2-match-footer"><strong>SHOWDOWN</strong><small>각 RUN 승률은 개별 보드 기준 예상치입니다.</small></footer>
  </section>;
}

export function ShowdownPrepPanel(props: { round: number; playerName: string; seconds: number | null; secondary?: boolean; matchup?: ShowdownPrepView }) {
  return props.round === 2
    ? <RunTwicePrepPanel playerName={props.playerName} matchup={props.matchup} />
    : <StandardShowdownPrepPanel {...props} />;
}
