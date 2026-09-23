import type { CSSProperties } from "react";
import type { ShowdownPrepSeatView, ShowdownPrepView } from "../shared/protocol";
import { CardView } from "./CardView";
import "./showdown-prep.css";

const ROUND_TITLES = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "THE LAST HAND"];

function PrepSeat({ seat, viewer, pending = false }: { seat?: ShowdownPrepSeatView; viewer: boolean; pending?: boolean }) {
  const name = seat?.name ?? "상대 확인 중";
  const avatar = pending ? "?" : [...name][0] ?? "P";
  const cards = seat?.cards.slice(0, 7) ?? [];
  return <article className={`showdown-prep-player ${viewer ? "is-viewer" : "is-opponent"} ${pending ? "is-pending" : ""}`}>
    <div className="showdown-prep-identity"><span className="showdown-prep-avatar">{avatar}</span><div><b>{name}</b><small>승점 <strong>{seat?.points ?? "—"}P</strong></small></div></div>
    <div className="showdown-prep-hand" aria-label={`${name} 출전 카드`}>
      {Array.from({ length: 7 }, (_, index) => cards[index]
        ? <CardView key={cards[index]!.id} card={cards[index]!} compact />
        : pending ? <span key={index} className="showdown-prep-card-back" aria-label="비공개 카드"><i>◇</i></span>
          : <span key={index} className="showdown-prep-card-space" aria-hidden="true" />)}
    </div>
  </article>;
}

export function ShowdownPrepPanel({ round, playerName, seconds, secondary = false, matchup }: {
  round: number; playerName: string; seconds: number | null; secondary?: boolean; matchup?: ShowdownPrepView;
}) {
  const viewer = matchup?.viewer ?? { playerId: "viewer", name: playerName, points: 0, cards: [] };
  const matchNumber = matchup?.matchNumber ?? (secondary ? 2 : 1);
  const duration = Math.max(1, seconds ?? 3);
  return <section className="showdown-prep match-loading" aria-label="매칭 로딩창" style={{ "--prep-duration": `${duration}s` } as CSSProperties}>
    <header className="showdown-prep-heading"><small>ROUND {String(round).padStart(2, "0")} · MATCH {matchNumber}</small><h1>{ROUND_TITLES[round] ?? `ROUND ${round}`}</h1></header>
    <div className="showdown-prep-stage">
      <PrepSeat seat={viewer} viewer />
      <strong className="showdown-prep-vs" aria-label="대결">VS</strong>
      <PrepSeat seat={matchup?.opponent} viewer={false} pending={!matchup?.opponent} />
    </div>
    <footer className="showdown-prep-footer" role="status"><strong>SHOWDOWN</strong><span aria-hidden="true"><i /></span></footer>
  </section>;
}
