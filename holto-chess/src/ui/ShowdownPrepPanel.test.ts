import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { FinalRoundTransition, ShowdownPrepPanel } from "./ShowdownPrepPanel";

describe("showdown preparation presentation", () => {
  it("shows both R5 players' three RUN pairs with odds for each independent board", () => {
    const deck = makeDeck();
    const seats = [0, 1].map(index => {
      const cards = deck.slice(index * 6, index * 6 + 6);
      return { playerId: `p${index}`, name: `PLAYER ${index}`, points: 0, cards,
        runCards: [cards.slice(0, 2), cards.slice(2, 4), cards.slice(4, 6)] };
    });
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round: 5, final: false, playerName: "PLAYER 0", seconds: 3,
      matchup: { matchNumber: 1, viewer: seats[0]!, opponent: seats[1]! } }));
    expect(html.match(/aria-label="RUN [123]"/g)).toHaveLength(6);
    expect(html.match(/class="playing-card[^"]* compact/g)).toHaveLength(12);
    expect(html).not.toContain("card-back");
    expect(html.match(/class="r2-run-equity"><small>예상 승률<\/small><strong>\d+%<\/strong>/g)).toHaveLength(6);
    expect(html).toContain("각 RUN 승률은 개별 보드 기준 예상치입니다.");
  });
  it.each([1,2])("uses the same skill icon component for both seats in round %i", (round) => {
    const cards = makeDeck().slice(0,2);
    const runCards: [typeof cards, typeof cards] = [cards,cards];
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round, playerName:"나", seconds:3,
      matchup:{matchNumber:1,viewer:{playerId:"p1",name:"나",points:12,cards,runCards,abilityId:"royal-blood"},opponent:{playerId:"p2",name:"긴 상대 이름",points:12,cards,runCards,abilityId:"target-sniper"}} }));
    const iconClass = round === 2 ? "r2-match-avatar-icon" : "showdown-prep-avatar-icon";
    expect(html.match(new RegExp(`class="${iconClass}"`,"g"))).toHaveLength(2);
    expect(html).toContain('alt="왕가의 혈통"');
    expect(html).toContain('alt="타겟 스나이퍼"');
    expect(html).not.toContain(`class="${iconClass.replace("-icon","")}"`);
  });
  it("shows four final players with all 28 card backs and no exposed rank or suit", () => {
    const cards = makeDeck().slice(0,7);
    const seats = [0,1,2,3].map(i => ({ playerId:`p${i}`, name:`PLAYER ${i}`, points:12, cards }));
    const html = renderToStaticMarkup(createElement(FinalRoundTransition, {matchup:{matchNumber:1,viewer:seats[0]!,opponents:seats.slice(1)}}));
    expect(html.match(/class="playing-card card-back compact"/g)).toHaveLength(28);
    expect(html.match(/class="showdown-prep-identity"/g)).toHaveLength(4);
    expect(html).not.toContain("card-rank");
    expect(html).not.toContain("card-suit");
    expect(html).not.toContain("showdown-prep-equity");
    expect(html).not.toContain("final-arena-mobile.webp");
    expect(html).not.toContain("final-arena-desktop.webp");
    expect(html).not.toContain("cinema-final-arena");
    expect(html).toContain("match-loading");
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
    expect(html).toContain("승점 12P");
    expect(html).toContain("승점 16P");
    expect(html).toContain("SHOWDOWN");
    expect(html).not.toContain("showdown-prep-card-space");
    expect(html).not.toContain("showdown-prep-card-back");
    for (const removed of ["매치업 동기화 중", "READY", "SYNC", "다음 상대와", "남은 시간"]) expect(html).not.toContain(removed);
  });

  it("uses a separate R2 split-run layout with two cards and independent odds per run", () => {
    const deck = makeDeck();
    const left = deck.slice(0, 3), right = deck.slice(10, 13);
    const runCards = (cards: typeof left) => [[cards[0]!, cards[1]!], [cards[0]!, cards[2]!]] as [typeof left, typeof left];
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round: 2, playerName: "나", seconds: 3, matchup: {
      matchNumber: 2,
      viewer: { playerId: "p1", name: "나", points: 12, cards: left, runCards: runCards(left) },
      opponent: { playerId: "p2", name: "블러프 폭스", points: 16, cards: right, runCards: runCards(right) },
    } }));
    expect(html).toContain("ROUND 02 · MATCH 2");
    expect(html).toContain("RUN IT TWICE");
    expect(html).toContain('class="r2-match-vs"');
    expect(html.indexOf('class="r2-match-player is-viewer')).toBeLessThan(html.indexOf('class="r2-match-vs"'));
    expect(html.indexOf('class="r2-match-vs"')).toBeLessThan(html.indexOf('class="r2-match-player is-opponent'));
    expect(html.match(/aria-label="RUN [12]"/g)).toHaveLength(4);
    expect(html.match(/class="playing-card[^"]* compact/g)).toHaveLength(8);
    expect(html.match(/class="r2-run-equity"><small>예상 승률<\/small><strong>\d+%<\/strong>/g)).toHaveLength(4);
    expect(html).toContain("각 RUN 승률은 개별 보드 기준 예상치입니다.");
    for (const removed of ["SAME HAND", "보유 카드", "READY", "SYNC"]) expect(html).not.toContain(removed);
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

  it("shows three-way R4 match 2 equity below all three complete hands", () => {
    const deck = makeDeck();
    const seats = [0, 1, 2].map(index => ({ playerId: `p${index}`, name: `선수 ${index}`, points: 0, cards: deck.slice(index * 5, index * 5 + 5) }));
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round: 4, playerName: seats[0]!.name, seconds: 3,
      matchup: { matchNumber: 2, viewer: seats[0]!, opponents: seats.slice(1) } }));
    expect(html).toContain("MATCH 2");
    expect(html.match(/예상 승률 <strong>\d+%<\/strong>/g)).toHaveLength(3);
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
    expect(html.match(/showdown-prep-hand" data-count="7" aria-label=/g)).toHaveLength(count);
    expect(html.match(/class="showdown-prep-vs"/g)).toHaveLength(1);
    expect(html).not.toContain("예상 승률");
    expect(html).not.toContain("상대 확인 중");
  });
  it("exposes the five-card count without changing cards or matchup identity", () => {
    const cards = makeDeck().slice(0,5);
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round:4, playerName:"나", seconds:3,
      matchup:{ matchNumber:1, viewer:{playerId:"p1",name:"나",points:0,cards}, opponents:[{playerId:"p2",name:"상대",points:0,cards}] } }));
    expect(html.match(/showdown-prep-hand" data-count="5"/g)).toHaveLength(2);
    expect(html.match(/class="playing-card/g)).toHaveLength(10);
  });
});
