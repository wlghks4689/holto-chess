import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoundSummaryRow } from "../shared/protocol";
import { RoundResults } from "./RoundResults";

const rows: RoundSummaryRow[] = [
  { playerId: "p1", name: "턴 샤크", cards: [], wins: 1, draws: 0, losses: 0, points: 10, totalPoints: 20, stackBB: 60, rank: 1, previousRank: 3, eliminated: false, bracket: "winner" },
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
    expect(html).toContain("누적 승점 &gt; 보유 BB &gt; 좌석 순서");
    expect(html).toContain("+10P");
    expect(html).toContain("20P");
    expect(html).toContain("↑2");
    expect(html).toContain("순위표 남은 시간 30초");
    expect(html.match(/<table(?: |>)/g)).toHaveLength(1);
  });
});
