import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import type { PlayerView } from "../shared/protocol";
import { RunLoadoutPanel } from "./OpenDraft";

function viewFixture(): PlayerView {
  const ownedCards = makeDeck().slice(0, 3);
  return {
    me: { ownedCards, selectedCardIds: ownedCards.map((card) => card.id) },
    players: [{ playerId: "p1", ready: false }],
  } as unknown as PlayerView;
}

describe("R2 run loadout presentation", () => {
  it("shows the centered instruction, slot titles and timer without timeout copy", () => {
    const html = renderToStaticMarkup(createElement(RunLoadoutPanel, {
      view: viewFixture(), send: () => {}, disabled: false, seconds: 24,
    }));

    expect(html).toContain("대표 카드 1장과 각 RUN에 사용할 보조 카드를 선택해주세요");
    expect(html).toContain('class="run-loadout-content"');
    expect(html).toContain('role="heading" aria-level="3">대표 카드</span>');
    expect(html).toContain("RUN 1 보조 카드");
    expect(html).toContain("RUN 2 보조 카드");
    expect(html).toContain("남은 시간");
    expect(html).toContain("24");
    expect(html).not.toContain("시간이 끝나면 미완성 배치는 자동으로 완성됩니다");
    expect(html).toContain("배치 확정 · 준비 완료");
  });

  it("can hide the timer for the tutorial while keeping the unchanged loadout control", () => {
    const html = renderToStaticMarkup(createElement(RunLoadoutPanel, {
      view: viewFixture(), send: () => {}, disabled: false, seconds: null, showTimer: false,
    }));

    expect(html).not.toContain('role="timer"');
    expect(html).toContain("배치 확정 · 준비 완료");
  });
});
