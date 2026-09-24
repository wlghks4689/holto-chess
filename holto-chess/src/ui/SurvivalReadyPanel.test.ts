import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SurvivalReadyPanel } from "./SurvivalReadyPanel";
import { survivalReadyActionLabel } from "./survivalReadyPresentation";

const playerIds = ["p2", "p3"];
const name = (id: string) => ({ p2: "블러프 캣", p3: "턴 샤크" })[id as "p2" | "p3"];

describe("survival tiebreak readiness", () => {
  it("shows the tied players and start action without repeating the elimination warning", () => {
    const html = renderToStaticMarkup(createElement(SurvivalReadyPanel, { playerIds, eliminateCount: 1, viewerId: "p2", name }));
    expect(html).toContain("동점자가 발생하여 타이 브레이크 경기를 진행합니다.");
    expect(html).toContain("블러프 캣 · 턴 샤크");
    expect(html).not.toContain("타이 브레이크에서 패배하면 탈락합니다.");
    expect(html).not.toContain("타이 브레이크 대상자가 아닙니다.");
    expect(survivalReadyActionLabel(playerIds, "p2")).toBe("타이브레이크 시작하기");
  });

  it("invites a nonparticipant to watch rather than start the match", () => {
    const html = renderToStaticMarkup(createElement(SurvivalReadyPanel, { playerIds, eliminateCount: 1, viewerId: "p1", name }));
    expect(html).toContain("동점자가 발생하여 타이 브레이크 경기를 진행합니다.");
    expect(html).toContain("타이 브레이크 대상자가 아닙니다. 동점자들의 경기를 관전합니다.");
    expect(html).not.toContain("타이 브레이크에서 패배하면 탈락합니다.");
    expect(survivalReadyActionLabel(playerIds, "p1")).toBe("관전하기");
  });
});
