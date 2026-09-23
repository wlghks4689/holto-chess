import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoundSummaryRow } from "../shared/protocol";
import { RoundResults } from "./RoundResults";

const rows: RoundSummaryRow[] = [
  { playerId: "p1", name: "턴 샤크", cards: [{ id: "2s", rank: 2, suit: "s" }, { id: "3h", rank: 3, suit: "h" }, { id: "4d", rank: 4, suit: "d" }, { id: "5c", rank: 5, suit: "c" }, { id: "6s", rank: 6, suit: "s" }, { id: "7h", rank: 7, suit: "h" }, { id: "8d", rank: 8, suit: "d" }], wins: 1, draws: 0, losses: 0, points: 10, totalPoints: 20, stackBB: 60, rank: 1, previousRank: 3, eliminated: false, bracket: "winner" },
  { playerId: "p2", name: "다이아 바이퍼", cards: [], wins: 1, draws: 0, losses: 0, points: 10, totalPoints: 20, stackBB: 55, rank: 2, previousRank: 1, eliminated: false, bracket: "winner" },
  { playerId: "p3", name: "올인 베어", cards: [], wins: 1, draws: 0, losses: 0, points: 10, totalPoints: 18, stackBB: 70, rank: 3, previousRank: 2, eliminated: false, bracket: "winner" },
  { playerId: "p4", name: "리버 폭스", cards: [], wins: 0, draws: 0, losses: 1, points: 0, totalPoints: 9, stackBB: 40, rank: 4, previousRank: 4, eliminated: false, bracket: "loser" },
  { playerId: "p5", name: "스페이드 울프", cards: [], wins: 0, draws: 0, losses: 1, points: 0, totalPoints: 6, stackBB: 30, rank: 5, previousRank: 5, eliminated: false, bracket: "loser" },
  { playerId: "p6", name: "클럽 레이븐", cards: [], wins: 0, draws: 0, losses: 1, points: 0, totalPoints: 3, stackBB: 20, rank: 6, previousRank: 6, eliminated: false, bracket: "loser" },
];

describe("round result brackets", () => {
  it("separates the R4 primary result into winner and survival bordered groups", () => {
    const html = renderToStaticMarkup(createElement(RoundResults, { round: 4, rows, viewerId: "p1", showBrackets: true, children: null }));
    expect(html).toContain("승자조 브래킷");
    expect(html).toContain("패자조 브래킷");
    expect(html).toContain("MATCH 2 · 순위 결정");
    expect(html).toContain("MATCH 2 · 생존 결정");
    expect(html.match(/class="round-bracket /g)).toHaveLength(2);
    expect(html.indexOf("턴 샤크")).toBeLessThan(html.indexOf("리버 폭스"));
  });

  it("renders the round leaderboard with movement, separated scores and a deadline", () => {
    const html = renderToStaticMarkup(createElement(RoundResults, { round: 4, rows, viewerId: "p1", secondsLeft: 30, children: null }));
    expect(html).not.toContain("round-bracket-grid");
    expect(html).not.toContain("승자조 브래킷");
    expect(html).toContain("순위표");
    expect(html).not.toContain("ROUND 4 · RESULT");
    expect(html).not.toContain("정렬 기준:");
    expect(html).toContain('<th class="leaderboard-hand-head">핸드</th>');
    expect(html).not.toContain("공개 핸드");
    expect(html).toContain('class="leaderboard-chip-icon"');
    expect(html).toContain('class="leaderboard-stack"');
    expect(html).toContain('class="summary-hand" data-count="7"');
    expect(html).toContain('class="mobile-record">1승 0무 0패</span>');
    expect(html).not.toContain("leaderboard-earned");
    expect(html).not.toContain("획득 승점</th>");
    expect(html).toContain('<span class="score-gain" aria-hidden="true">+10P</span>');
    expect(html).toContain('<strong class="score-total">20P</strong>');
    expect(html).toContain("+10P");
    expect(html).toContain("20P");
    expect(html).toContain("↑2");
    expect(html).toContain("순위표 남은 시간 30초");
    expect(html.match(/<table(?: |>)/g)).toHaveLength(1);
  });
});
