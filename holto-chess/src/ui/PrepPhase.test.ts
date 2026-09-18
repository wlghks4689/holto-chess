import { describe, expect, it } from "vitest";
import { getPrepPresentation } from "./prepPresentation";

describe("getPrepPresentation", () => {
  it("keeps R3 as the target throughout the R2 augment and transition", () => {
    for (const phase of ["AUGMENT", "NEXT_ROUND"] as const) {
      expect(getPrepPresentation(2, phase)).toMatchObject({
        completedRound: 2,
        targetRound: 3,
        title: "OMAHA DOUBLE GAME",
      });
    }
  });

  it("keeps the same R3 prep context after the server advances into its shop", () => {
    const prep = getPrepPresentation(3, "SHOP");
    expect(prep).toMatchObject({ completedRound: 2, targetRound: 3 });
    expect(prep?.rules).toEqual([
      "홀카드 4장",
      "겹치지 않는 2장 + 2장으로 두 게임 구성",
      "두 번의 Omaha 게임",
      "게임마다 새로운 보드",
      "정확히 홀카드 2장 + 보드 3장 사용",
    ]);
  });

  it("does not label the opening shop or combat phases as PREP", () => {
    expect(getPrepPresentation(1, "SHOP")).toBeNull();
    expect(getPrepPresentation(3, "DECK_SELECT")).toBeNull();
    expect(getPrepPresentation(5, "GAME_RESULT")).toBeNull();
  });
});
