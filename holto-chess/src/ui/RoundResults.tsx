import { useEffect, useRef, useState, type ReactNode } from "react";
import { cardLabel } from "../core/poker/cards";
import type { RoundSummaryRow } from "../shared/protocol";
import { PhaseTimer } from "./PhaseTimer";
import { useTranslation } from "../i18n";

const placementSuffix = (rank: number, locale: string, koreanSuffix: string) => {
  if (locale === "ko-KR") return koreanSuffix;
  const rule = new Intl.PluralRules("en-US", { type: "ordinal" }).select(rank);
  return rule === "one" ? "st" : rule === "two" ? "nd" : rule === "few" ? "rd" : "th";
};

function HandCards({ row }: { row: RoundSummaryRow }) {
  return <div className="summary-hand" data-count={row.cards.length}>{row.cards.map((card) => { const label = cardLabel(card); return <span key={card.id} aria-label={label} className={card.suit === "h" || card.suit === "d" ? "red" : ""}><b className="summary-card-rank">{label.slice(0, -1)}</b><i className="summary-card-suit">{label.slice(-1)}</i></span>; })}</div>;
}

function SummaryTable({ rows, viewerId }: { rows: RoundSummaryRow[]; viewerId: string }) {
  const { t } = useTranslation();
  return <table><thead><tr><th>{t("results.player")}</th><th>{t("results.playedHand")}</th><th>{t("results.record")}</th><th>{t("results.earnedPoints")}</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.playerId} className={`${row.playerId === viewerId ? "is-me " : ""}${row.eliminated ? "is-eliminated" : ""}`}>
      <th scope="row">{row.name}{row.playerId === viewerId && <small>YOU</small>}{row.eliminated && <small className="eliminated-label">{t("results.eliminated")}</small>}</th>
      <td><HandCards row={row} /></td>
      <td className="summary-record">{t("results.recordValue", { wins: row.wins, draws: row.draws, losses: row.losses })}</td><td className="summary-points">+{row.points}P</td>
    </tr>)}</tbody></table>;
}

function RankMovement({ row }: { row: RoundSummaryRow }) {
  if (row.previousRank === undefined) return <span className="rank-movement is-new">NEW</span>;
  const delta = row.previousRank - row.rank;
  if (!delta) return <span className="rank-movement is-still">—</span>;
  return <span className={`rank-movement ${delta > 0 ? "is-up" : "is-down"}`}>{delta > 0 ? "↑" : "↓"}{Math.abs(delta)}</span>;
}

function ChipStackIcon() {
  return <svg className="leaderboard-chip-icon" viewBox="0 0 32 32" aria-hidden="true">
    <ellipse cx="16" cy="8" rx="10" ry="5" />
    <path d="M6 8v5c0 2.8 4.5 5 10 5s10-2.2 10-5V8" />
    <path d="M6 13v5c0 2.8 4.5 5 10 5s10-2.2 10-5v-5" />
    <path d="M6 18v5c0 2.8 4.5 5 10 5s10-2.2 10-5v-5" />
  </svg>;
}

function Leaderboard({ rows, viewerId }: { rows: RoundSummaryRow[]; viewerId: string }) {
  const { t, locale } = useTranslation();
  const signature = rows.map((row) => `${row.playerId}:${row.rank}:${row.previousRank ?? "new"}:${row.totalPoints}:${row.stackBB}`).join("|");
  const currentOrder = rows.map((row) => row.playerId);
  const previousOrder = [...rows].sort((a, b) => (a.previousRank ?? a.rank) - (b.previousRank ?? b.rank)).map((row) => row.playerId);
  const [order, setOrder] = useState(previousOrder);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const before = new Map([...rowRefs.current].map(([id, element]) => [id, element.getBoundingClientRect()]));
      setOrder(currentOrder);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        for (const [id, element] of rowRefs.current) {
          const first = before.get(id); const last = element.getBoundingClientRect();
          if (!first || first.top === last.top) continue;
          element.animate([{ transform: `translateY(${first.top - last.top}px)` }, { transform: "translateY(0)" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
      }));
    }, 700);
    return () => window.clearTimeout(timer);
    // The parent remounts this component whenever the compact ranking signature changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const byId = new Map(rows.map((row) => [row.playerId, row]));
  return <div className="leaderboard-table-wrap"><table className="leaderboard-table">
    <thead><tr><th className="leaderboard-rank-head">{t("results.rank")}</th><th className="leaderboard-movement-head">{t("results.change")}</th><th className="leaderboard-player-head">{t("results.player")}</th><th className="leaderboard-hand-head">{t("results.hand")}</th><th className="leaderboard-record-head">{t("results.roundRecord")}</th><th className="leaderboard-stack-head">{t("results.ownedBB")}</th><th className="leaderboard-total-head">{t("results.cumulativePoints")}</th></tr></thead>
    <tbody>{order.map((id) => byId.get(id)).filter((row): row is RoundSummaryRow => !!row).map((row) => <tr key={row.playerId} ref={(element) => { if (element) rowRefs.current.set(row.playerId, element); else rowRefs.current.delete(row.playerId); }} className={`${row.playerId === viewerId ? "is-me " : ""}${row.eliminated ? "is-eliminated" : ""}`}>
      <td className={`leaderboard-rank ${row.rank <= 3 ? `place-${row.rank}` : "place-rest"}`}><span className="placement-rank"><strong>{row.rank}</strong><small>{placementSuffix(row.rank, locale, t("final.placeSuffix"))}</small></span></td>
      <td className="leaderboard-movement"><RankMovement row={row} /></td>
      <th className="leaderboard-player" scope="row"><span className="leaderboard-identity"><span className="leaderboard-name">{row.name}</span>{row.playerId === viewerId && <small>YOU</small>}{row.eliminated && <small className="eliminated-label">{t("results.eliminated")}</small>}</span><span className="mobile-record">{t("results.recordValue", { wins: row.wins, draws: row.draws, losses: row.losses })}</span></th>
      <td className="leaderboard-hand"><HandCards row={row} /></td>
      <td className="summary-record">{t("results.recordValue", { wins: row.wins, draws: row.draws, losses: row.losses })}</td>
      <td className="leaderboard-stack"><ChipStackIcon /><span><strong>{row.stackBB}</strong><small>BB</small></span></td>
      <td className={`summary-total ${row.points > 0 ? "has-gain" : "no-gain"}`} aria-label={t("results.totalAria", { points: row.totalPoints })}><span className="score-gain" aria-hidden="true">+{row.points}P</span><strong className="score-total">{row.totalPoints}P</strong></td>
    </tr>)}</tbody>
  </table></div>;
}

export function RoundResults({ rows, viewerId, showBrackets = false, secondsLeft = null, children }: { round: number; rows: RoundSummaryRow[]; viewerId: string; showBrackets?: boolean; secondsLeft?: number | null; children: ReactNode }) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  const bracketSections = [
    { bracket: "winner" as const, title: t("results.winnerBracket"), note: t("results.placementMatch") },
    { bracket: "loser" as const, title: t("results.survivalBracket"), note: t("results.survivalMatch") },
  ];
  return <section className="round-results">
    <div className="round-overview panel">
      <header className="round-result-heading"><div><h2>{t(showBrackets ? "results.bracketAssignment" : "results.standings")}</h2><p>{t(showBrackets ? "results.bracketDescription" : "results.standingsDescription")}</p></div>
        {!showBrackets && secondsLeft !== null && <PhaseTimer className="result-deadline" seconds={secondsLeft} ariaLabel={t("results.timerAria", { seconds: secondsLeft })} />}
      </header>
      {showBrackets ? <div className="round-bracket-grid">{bracketSections.map((section) => <section className={`round-bracket is-${section.bracket}`} key={section.bracket}>
        <header><div><span>{section.bracket === "winner" ? "WINNER BRACKET" : "SURVIVAL BRACKET"}</span><h3>{section.title}</h3></div><small>{section.note}</small></header>
        <SummaryTable rows={rows.filter((row) => row.bracket === section.bracket)} viewerId={viewerId} />
      </section>)}</div> : <Leaderboard key={rows.map((row) => `${row.playerId}:${row.rank}:${row.previousRank ?? "new"}:${row.totalPoints}:${row.stackBB}`).join("|")} rows={rows} viewerId={viewerId} />}
    </div>
    <details className="personal-history panel"><summary>{t("results.myMatches")} <span>{t("results.expand")}</span></summary><div className="matches">{children}</div></details>
  </section>;
}
