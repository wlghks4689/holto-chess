import type { ReactNode } from "react";
import { cardLabel } from "../core/poker/cards";
import type { RoundSummaryRow } from "../shared/protocol";

export function RoundResults({ round, rows, viewerId, children }: { round: number; rows: RoundSummaryRow[]; viewerId: string; children: ReactNode }) {
  if (!rows.length) return null;
  return <section className="round-results">
    <div className="round-overview panel">
      <header><span className="eyebrow">ROUND {round} · RESULT</span><h2>플레이어별 경기 요약</h2><p>이번 라운드 공개 핸드와 누적 전적 · 승점순</p></header>
      <table><thead><tr><th>플레이어</th><th>플레이 핸드</th><th>승 / 무 / 패</th><th>획득 승점</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.playerId} className={row.playerId === viewerId ? "is-me" : ""}>
          <th scope="row">{row.name}{row.playerId === viewerId && <small>YOU</small>}</th>
          <td><div className="summary-hand">{row.cards.map((card) => <span key={card.id} className={card.suit === "h" || card.suit === "d" ? "red" : ""}>{cardLabel(card)}</span>)}</div></td>
          <td className="summary-record">{row.wins}승 {row.draws}무 {row.losses}패</td><td className="summary-points">+{row.points}P</td>
        </tr>)}</tbody></table>
    </div>
    <details className="personal-history panel"><summary>내 매치 내용 · 히스토리 <span>펼쳐보기</span></summary><div className="matches">{children}</div></details>
  </section>;
}
