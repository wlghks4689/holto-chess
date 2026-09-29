import type { ReactNode } from "react";
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

function Leaderboard({ rows, viewerId }: { rows: RoundSummaryRow[]; viewerId: string }) {
  const { t, locale } = useTranslation();
  return <div className="leaderboard-table-wrap"><table className="leaderboard-table">
    <thead><tr>{(["rank", "nickname", "cards", "roundRecord", "ownedBB", "cumulativePoints"] as const).map((key) => <th key={key} scope="col">{t(`results.${key}`).split(" ").map((word, index) => <span className="leaderboard-heading-word" key={index}>{word}</span>)}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.playerId} className={`${row.playerId === viewerId ? "is-me " : ""}${row.eliminated ? "is-eliminated" : ""}`}>
      <td className={`leaderboard-rank ${row.rank <= 3 ? `place-${row.rank}` : "place-rest"}`}><span className="placement-rank"><strong>{row.rank}</strong><small>{placementSuffix(row.rank, locale, t("final.placeSuffix"))}</small></span></td>
      <th className="leaderboard-player" scope="row"><span className="leaderboard-identity"><span className="leaderboard-name" title={row.name}>{row.name}</span>{row.playerId === viewerId && <small>YOU</small>}{row.eliminated && <small className="eliminated-label">{t("results.eliminated")}</small>}</span><span className="mobile-record">{t("results.recordValue", { wins: row.wins, draws: row.draws, losses: row.losses })}</span></th>
      <td className="leaderboard-hand"><HandCards row={row} /></td>
      <td className="summary-record">{t("results.recordValue", { wins: row.wins, draws: row.draws, losses: row.losses })}</td>
      <td className="leaderboard-stack"><span><strong>{row.stackBB}</strong><small>BB</small></span></td>
      <td className="leaderboard-points" aria-label={t("results.totalAria", { points: row.totalPoints })}>{row.totalPoints}P</td>
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
  return <section className={`round-results ${showBrackets ? "is-brackets" : "is-leaderboard"}`}>
    <div className="round-overview panel">
      <header className="round-result-heading"><div><h2>{t(showBrackets ? "results.bracketAssignment" : "results.standings")}</h2><p>{t(showBrackets ? "results.bracketDescription" : "results.standingsDescription")}</p></div>
        {!showBrackets && secondsLeft !== null && <PhaseTimer className="result-deadline" seconds={secondsLeft} ariaLabel={t("results.timerAria", { seconds: secondsLeft })} />}
      </header>
      {showBrackets ? <div className="round-bracket-grid">{bracketSections.map((section) => <section className={`round-bracket is-${section.bracket}`} key={section.bracket}>
        <header><div><span>{section.bracket === "winner" ? "WINNER BRACKET" : "SURVIVAL BRACKET"}</span><h3>{section.title}</h3></div><small>{section.note}</small></header>
        <SummaryTable rows={rows.filter((row) => row.bracket === section.bracket)} viewerId={viewerId} />
      </section>)}</div> : <Leaderboard rows={rows} viewerId={viewerId} />}
    </div>
    <details className="personal-history panel"><summary>{t("results.myMatches")} <span>{t("results.expand")}</span></summary><div className="matches">{children}</div></details>
  </section>;
}
