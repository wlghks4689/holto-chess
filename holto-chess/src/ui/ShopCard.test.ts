import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShopCard } from "./ShopCard";

describe("two-card deal shop card", () => {
  it("starts face down and keeps purchase separate and disabled", () => {
    const html = renderToStaticMarkup(createElement(ShopCard, {
      card: { id: "As", rank: 14, suit: "s" }, price: 20, locked: false,
      onBuy: () => undefined, onLock: () => undefined,
    }));
    expect(html).toContain("is-hidden");
    expect(html).toContain("shop-card-flip-inner");
    expect(html).toContain("상점 카드 확인");
    expect(html).toContain("확인 후 구매 · 20 BB");
    expect(html).toMatch(/class="card-purchase" disabled=""/);
  });

  it("renders lock as an independent control", () => {
    const html = renderToStaticMarkup(createElement(ShopCard, {
      card: { id: "As", rank: 14, suit: "s" }, price: 20, locked: true,
      onBuy: () => undefined, onLock: () => undefined,
    }));
    expect(html).toContain("is-locked");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("잠금 해제");
  });
});
