import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoundSummaryRow } from "../shared/protocol";
import { RoundResults } from "./RoundResults";

const rows: RoundSummaryRow[] = [
  { playerId: "p1", name: "턴 샤크", cards: [], wins: 1, draws: 0, losses: 0, points: 10, eliminated: false, bracket: "winner" },
  { playerId: "p2", name: "다이아 바이퍼", cards: [], wins: 1, draws: 0, losses: 0, points: 10, eliminated: false, bracket: "winner" },
  { playerId: "p3", name: "올인 베어", cards: [], wins: 1, draws: 0, losses: 0, points: 10, eliminated: false, bracket: "winner" },
  { playerId: "p4", name: "리버 폭스", cards: [], wins: 0, draws: 0, losses: 1, points: 0, eliminated: false, bracket: "loser" },
  { playerId: "p5", name: "스페이드 울프", cards: [], wins: 0, draws: 0, losses: 1, points: 0, eliminated: false, bracket: "loser" },
  { playerId: "p6", name: "클럽 레이븐", cards: [], wins: 0, draws: 0, losses: 1, points: 0, eliminated: false, bracket: "loser" },
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

  it("keeps the existing single table outside the bracket assignment stage", () => {
    const html = renderToStaticMarkup(createElement(RoundResults, { round: 4, rows, viewerId: "p1", children: null }));
    expect(html).not.toContain("round-bracket-grid");
    expect(html).not.toContain("승자조 브래킷");
    expect(html.match(/<table>/g)).toHaveLength(1);
  });
});
