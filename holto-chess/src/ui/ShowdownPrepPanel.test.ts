import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";

describe("showdown preparation presentation", () => {
  it("uses a player-versus-player loading composition without the old literal phase label", () => {
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, {
      round: 3, playerName: "나", seconds: 3, matchup: {
        matchNumber: 1,
        viewer: { playerId: "p1", name: "나", points: 12, cards: [{ id: "As", rank: 14, suit: "s" }] },
        opponent: { playerId: "p2", name: "블러프 폭스", points: 16, cards: [{ id: "Th", rank: 10, suit: "h" }] },
      },
    }));
    expect(html).toContain("ROUND 03 · MATCH 1");
    expect(html).toContain("OMAHA SWISS");
    expect(html).toContain('aria-label="매칭 로딩창"');
    expect(html).toContain(">VS<");
    expect(html).toContain("블러프 폭스");
    expect(html).toContain("승점 <strong>12P");
    expect(html).toContain("승점 <strong>16P");
    expect(html).toContain("SHOWDOWN");
    for (const removed of ["매치업 동기화 중", "READY", "SYNC", "다음 상대와", "남은 시간"]) expect(html).not.toContain(removed);
  });

  it("labels the second match without restoring the removed phrase", () => {
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, {
      round: 4, playerName: "턴 샤크", seconds: null, secondary: true,
    }));
    expect(html).toContain("MATCH 2");
    expect(html).toContain("턴 샤크");
    expect(html).toContain("상대 확인 중");
    expect(html.match(/비공개 카드/g)).toHaveLength(7);
    expect(html).not.toContain('role="timer"');
  });
});
