import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunWinner } from "./RunItTwiceResult";

describe("compact run result", () => {
  it("shows only the board winner without a duplicate match summary", () => {
    expect(renderToStaticMarkup(createElement(RunWinner, { winners: ["리버 폭스"] }))).toContain("리버 폭스 승리");
    expect(renderToStaticMarkup(createElement(RunWinner, { winners: ["리버 폭스", "턴 샤크"] }))).toContain("무승부");
  });
});
