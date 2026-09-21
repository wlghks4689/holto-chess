import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrepRoundHeader } from "./PrepPhase";
import { getPrepPresentation } from "./prepPresentation";

describe("getPrepPresentation", () => {
  it("keeps R3 as the target throughout the R2 augment and transition", () => {
    for (const phase of ["AUGMENT", "NEXT_ROUND"] as const) {
      expect(getPrepPresentation(2, phase)).toMatchObject({
        completedRound: 2,
        targetRound: 3,
        title: "OMAHA SWISS",
      });
    }
  });

  it("keeps the same R3 prep context after the server advances into its shop", () => {
    const prep = getPrepPresentation(3, "SHOP");
    expect(prep).toMatchObject({ completedRound: 2, targetRound: 3 });
    expect(prep?.rules).toEqual([
      "홀카드 4장",
      "동일한 4장으로 모든 매치 진행",
      "세 번의 Swiss 매치",
      "게임마다 새로운 보드",
      "정확히 홀카드 2장 + 보드 3장 사용",
    ]);
  });

  it("does not label the opening shop or combat phases as PREP", () => {
    expect(getPrepPresentation(1, "SHOP")).toBeNull();
    expect(getPrepPresentation(3, "DECK_SELECT")).toBeNull();
    expect(getPrepPresentation(5, "GAME_RESULT")).toBeNull();
  });

  it("keeps prep rules inside the title rulebook instead of the header", () => {
    const prep = getPrepPresentation(3, "SHOP")!;
    const html = renderToStaticMarkup(createElement(PrepRoundHeader, { prep }));
    expect(html).not.toContain("ROUND 02 COMPLETE");
    expect(html).not.toContain("PREP PHASE");
    expect(html).not.toContain("CURRENT PHASE");
    expect(html).not.toContain("PREPARING R03");
    expect(html).toContain("OMAHA SWISS 규칙 보기");
    expect(html).toContain("정확히 홀카드 2장 + 보드 3장 사용");
  });
});
