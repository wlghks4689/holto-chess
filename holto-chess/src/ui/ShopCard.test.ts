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
    expect(html).toContain('aria-label="구매 · 20 BB"');
    expect(html).toMatch(/class="card-purchase"[^>]*>20 BB<\/button>/);
    expect(html).not.toContain("card-back");
    expect(html).not.toMatch(/class="card-purchase" disabled=""/);
  });

  it.each([0, 3, 8, 15, 20])("shows only the %i BB price on the purchase button", (price) => {
    const html = renderToStaticMarkup(createElement(ShopCard, {
      card: { id: "As", rank: 14, suit: "s" }, price, disabled: true,
      onBuy: () => undefined,
    }));
    expect(html).toMatch(new RegExp(`class="card-purchase"[^>]*>${price} BB</button>`));
    expect(html).toContain(`aria-label="구매 · ${price} BB"`);
    expect(html).toMatch(/class="card-purchase"[^>]* disabled=""/);
    expect(html).not.toContain('class="card-lock"');
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
