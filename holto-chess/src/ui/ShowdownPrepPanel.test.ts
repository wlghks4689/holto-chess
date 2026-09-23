import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";

describe("showdown preparation presentation", () => {
  it("uses a player-versus-player loading composition without the old literal phase label", () => {
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, {
      round: 2, playerName: "나", seconds: 3,
    }));
    expect(html).toContain("매치업 동기화 중");
    expect(html).toContain(">VS<");
    expect(html).toContain("상대 매칭 중");
    expect(html).toContain("준비가 끝나면 자동으로 시작합니다.");
    expect(html).toContain("쇼다운 시작까지 3초");
    expect(html).not.toContain("VS · 전장 준비");
  });

  it("labels the second match without restoring the removed phrase", () => {
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, {
      round: 4, playerName: "턴 샤크", seconds: null, secondary: true,
    }));
    expect(html).toContain("SECOND MATCH");
    expect(html).toContain("턴 샤크");
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain("전장 준비");
  });
});
