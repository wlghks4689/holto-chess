import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoundGuide } from "./RoundGuide";

describe("round guide", () => {
  it("shows all four R3 Omaha hole cards and explains the exact 2+3 rule", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 3, onClose: () => undefined }));

    expect(html).toContain("홀카드 4장 · 정확히 2장 사용");
    expect(html).toContain("홀카드 4장 중 정확히 2장 + 보드 5장 중 정확히 3장으로 BEST5");
    expect(html).toContain("2♦");
    expect(html).toContain("2♣");
    expect(html).toContain("A♥");
    expect(html).toContain("9♠");
  });
});
