import { useMemo, type CSSProperties } from "react";
import type { ShowdownPrepSeatView, ShowdownPrepView } from "../shared/protocol";
import { CardView } from "./CardView";
import { showdownEquity } from "./showdownEquity";
import "./showdown-prep.css";

const ROUND_TITLES = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "THE LAST HAND"];

export function FinalRoundTransition() {
  return <section className="panel transition-panel"><span className="final-round-mark"><small>ROUND</small><strong>05</strong></span><h2>최종전 준비 중</h2></section>;
}

function PrepSeat({ seat, viewer, pending = false, winPercent }: { seat?: ShowdownPrepSeatView; viewer: boolean; pending?: boolean; winPercent?: number }) {
  const name = seat?.name ?? "상대 확인 중";
  const avatar = pending ? "?" : [...name][0] ?? "P";
  const cards = seat?.cards.slice(0, 7) ?? [];
  return <article className={`showdown-prep-player ${viewer ? "is-viewer" : "is-opponent"} ${pending ? "is-pending" : ""}`}>
    <div className="showdown-prep-identity"><span className="showdown-prep-avatar">{avatar}</span><div><b>{name}</b><small>승점 <strong>{seat?.points ?? "—"}P</strong></small></div></div>
    <div className="showdown-prep-hand" aria-label={`${name} 출전 카드`}>
      {cards.map((card) => <CardView key={card.id} card={card} compact />)}
    </div>
    {winPercent !== undefined && <p className="showdown-prep-equity" aria-label={`${name} 예상 승률 ${winPercent}%`}>예상 승률 <strong>{winPercent}%</strong></p>}
  </article>;
}

export function ShowdownPrepPanel({ round, playerName, seconds, secondary = false, matchup }: {
  round: number; playerName: string; seconds: number | null; secondary?: boolean; matchup?: ShowdownPrepView;
}) {
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
  return <section className="showdown-prep match-loading" aria-label="매칭 로딩창" style={{ "--prep-duration": `${duration}s` } as CSSProperties}>
    <header className="showdown-prep-heading"><small>ROUND {String(round).padStart(2, "0")} · MATCH {matchNumber}</small><h1>{ROUND_TITLES[round] ?? `ROUND ${round}`}</h1></header>
    <div className={`showdown-prep-stage ${multiway ? `is-multiway is-${opponents.length + 1}-way` : ""}`}>
      {multiway ? <>
        <PrepSeat seat={viewer} viewer />
        {opponents.map((opponent) => <PrepSeat key={opponent.playerId} seat={opponent} viewer={false} />)}
        <strong className="showdown-prep-vs" aria-label="대결">VS</strong>
      </> : <>
        <PrepSeat seat={viewer} viewer winPercent={equity?.[0]} />
        <strong className="showdown-prep-vs" aria-label="대결">VS</strong>
        <PrepSeat seat={opponents[0]} viewer={false} pending={!opponents.length} winPercent={equity?.[1]} />
      </>}
    </div>
    <footer className="showdown-prep-footer" role="status"><strong>SHOWDOWN</strong><span aria-hidden="true"><i /></span></footer>
  </section>;
}
