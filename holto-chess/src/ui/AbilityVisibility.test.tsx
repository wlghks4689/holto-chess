import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShopAbilityPanel } from "./AbilityVisibility";

describe("Target Sniper ability panel", () => {
  it("identifies the initially dealt card in compact and full panels", () => {
    const startingCard = { id: "As", rank: 14 as const, suit: "s" as const };
    const compact = renderToStaticMarkup(createElement(ShopAbilityPanel, { ability: "target-sniper", startingCard, compact: true }));
    const full = renderToStaticMarkup(createElement(ShopAbilityPanel, { ability: "target-sniper", startingCard }));
    expect(compact).toContain("최초 지급 카드: A♠");
    expect(full).toContain("최초 지급 카드: A♠");
  });
});
