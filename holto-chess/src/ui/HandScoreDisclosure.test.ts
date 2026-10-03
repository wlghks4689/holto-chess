import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BALANCE } from "../game/config";
import { HAND_LADDER } from "./guide/guideRules";
import { HandScoreDisclosure, HandScoreTable } from "./HandScoreDisclosure";
import { ShopPanel } from "./App";
import { qaGame } from "./responsiveFixtures";
import { FinalRoundTransition, ShowdownPrepPanel } from "./ShowdownPrepPanel";

describe("final hand-score disclosure", () => {
  it("starts closed and never includes private player data", () => {
    const html = renderToStaticMarkup(createElement(HandScoreDisclosure));
    expect(html).toContain("족보 점수표");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("hand-score-popover");
    expect(html).not.toContain("playing-card");
  });
  it("lists all ten base categories in game order using the actual scoring constants", () => {
    const html = renderToStaticMarkup(createElement(HandScoreTable));
    expect(html.match(/<tr>/g)).toHaveLength(10);
    let previousIndex = -1;
    for (const category of HAND_LADDER) {
      const index = html.indexOf(`data-category="${category}"`);
      expect(index).toBeGreaterThan(previousIndex);
      expect(html).toMatch(new RegExp(`data-category="${category}">[^<]+</th><td>${BALANCE.handScores[category]}P</td>`));
      previousIndex = index;
    }
    expect(html).toContain("최종 라운드");
    expect(html).toContain("별도로 정산");
    expect(html).not.toContain("glow");
  });
  it.each([1, 2, 3, 4, 5] as const)("shows the shop disclosure only in R5 (round %i)", round => {
    const html = renderToStaticMarkup(createElement(ShopPanel, { state: qaGame(round, BALANCE.handLimits[round]), act: () => undefined }));
    expect(html.includes("hand-score-trigger")).toBe(round === 5);
  });
  it("keeps brief final matching free of the disclosure and any revealed cards", () => {
    const html = renderToStaticMarkup(createElement(FinalRoundTransition));
    expect(html).not.toContain("hand-score-trigger");
    expect(html).not.toContain("card-rank");
    expect(html).not.toContain("card-suit");
  });
  it.each([1, 2, 3, 4])("does not add final scoring UI to ordinary preparation R%i", round => {
    const html = renderToStaticMarkup(createElement(ShowdownPrepPanel, { round, playerName: "나", seconds: 3 }));
    expect(html).not.toContain("hand-score-trigger");
  });
});
