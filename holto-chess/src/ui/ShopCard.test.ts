import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShopCard } from "./ShopCard";

describe("two-card deal shop card", () => {
  it("starts face up and can be purchased immediately", () => {
    const html = renderToStaticMarkup(createElement(ShopCard, {
      card: { id: "As", rank: 14, suit: "s" }, price: 20, locked: false,
      onBuy: () => undefined, onLock: () => undefined,
    }));
    expect(html).toContain("A♠ 상점 카드");
    expect(html).toContain("구매 · 20 BB");
    expect(html).not.toContain("card-back");
    expect(html).not.toMatch(/class="card-purchase" disabled=""/);
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
