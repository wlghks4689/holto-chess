import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { FinalRoundTransition, ShowdownPrepPanel } from "./ShowdownPrepPanel";

describe("showdown preparation presentation", () => {
  it("keeps the final round on its transition instead of a matchup screen", () => {
    const html = renderToStaticMarkup(createElement(FinalRoundTransition));
    expect(html).toContain("최종전 준비 중");
    expect(html).toContain('<span class="final-round-mark"><small>ROUND</small><strong>05</strong></span>');
    expect(html).not.toContain("매칭 로딩창");
  });
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
    expect(html).not.toContain("showdown-prep-card-space");
    expect(html).not.toContain("showdown-prep-card-back");
    for (const removed of ["매치업 동기화 중", "READY", "SYNC", "다음 상대와", "남은 시간"]) expect(html).not.toContain(removed);
  });

  it("labels the second match without restoring the removed phrase", () => {
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, {
      round: 4, playerName: "턴 샤크", seconds: null, secondary: true,
    }));
    expect(html).toContain("MATCH 2");
    expect(html).toContain("턴 샤크");
    expect(html).toContain("상대 확인 중");
    expect(html).not.toContain("비공개 카드");
    expect(html).not.toContain("showdown-prep-card-space");
    expect(html).not.toContain('role="timer"');
  });

  it("shows rounded odds below each complete pair of cards", () => {
    const deck = makeDeck();
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, {
      round: 1, playerName: "나", seconds: 3, matchup: {
        matchNumber: 2,
        viewer: { playerId: "p1", name: "나", points: 3, cards: deck.slice(0, 2) },
        opponent: { playerId: "p2", name: "상대", points: 6, cards: deck.slice(2, 4) },
      },
    }));
    expect(html).toContain("MATCH 2");
    expect(html.match(/예상 승률 <strong>\d+%<\/strong>/g)).toHaveLength(2);
    expect(html.indexOf('aria-label="나 출전 카드"')).toBeLessThan(html.indexOf('aria-label="나 예상 승률'));
  });

  it("centers the R4 three-player matchup around one VS without character art", () => {
    const count = 3;
    const deck = makeDeck();
    const seats = Array.from({ length: count }, (_, index) => ({ playerId: `p${index + 1}`, name: `플레이어 ${index + 1}`,
      points: index * 4, cards: deck.slice(index * 7, index * 7 + 7) }));
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round: 4, playerName: seats[0]!.name,
      seconds: 3, matchup: { matchNumber: 1, viewer: seats[0]!, opponents: seats.slice(1) } }));
    expect(html).toContain(`is-${count}-way`);
    expect(html.match(/class="showdown-prep-player /g)).toHaveLength(count);
    expect(html.match(/showdown-prep-hand" aria-label=/g)).toHaveLength(count);
    expect(html.match(/class="showdown-prep-vs"/g)).toHaveLength(1);
    expect(html).not.toContain("예상 승률");
    expect(html).not.toContain("상대 확인 중");
  });
});
