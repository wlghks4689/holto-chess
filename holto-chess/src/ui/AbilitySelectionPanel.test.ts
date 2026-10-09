import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAbilityGame, finishAbilityDeal } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { addSession, createRoom } from "../game/room";
import { AbilitySelectionPanel } from "./AbilitySelectionPanel";
import { setCinematicMotion } from "./useCinematicMotion";

function viewOf(game: ReturnType<typeof createAbilityGame>) {
  const room = { ...addSession(createRoom("UI", 303), "test-session").room, game, status: "PLAYING" as const };
  return createPlayerView(room, "p1");
}

describe("ability deal presentation", () => {
  it("uses the shared game motion preference for the deal and the reveal", () => {
    const view = viewOf(createAbilityGame(303));
    const render = () => renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {} }));
    try {
      setCinematicMotion(true);
      expect(render()).toContain("ability-motion-enabled");
      setCinematicMotion(false);
      expect(render()).not.toContain("ability-motion-enabled");
    } finally { setCinematicMotion(true); }
  });

  it("deals only the viewer's own card, large and readable, with the time left and no ready button", () => {
    const game = createAbilityGame(303);
    const view = viewOf(game);
    expect(view.phase).toBe("ABILITY_DEAL");
    const html = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 5 }));
    expect(html).toContain("나의 어빌리티");
    expect(html.match(/ability-card-description/g)).toHaveLength(1);
    expect(html).toContain(`data-ability="${game.players[0]!.abilityId}"`);
    for (const other of game.players.slice(1)) expect(html).not.toContain(`data-ability="${other.abilityId}"`);
    expect(html).not.toContain("ability-back-grid");
    expect(html).not.toContain("READY · 준비 완료");
    expect(html).toContain(">5<");
  });

  it("shows the confirmed heading, eight inspectable cards and the ready button in the reveal", () => {
    const view = viewOf(finishAbilityDeal(createAbilityGame(303)));
    expect(view.phase).toBe("ABILITY_REVEAL");
    const html = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 30 }));
    expect(html).toContain("어빌리티 카드 확정");
    expect(html).toContain("모든 플레이어가 준비 완료되면 상점 단계로 넘어갑니다. (자동 시작 30초)");
    expect(html).toContain("카드를 선택하면 상세 효과를 볼 수 있습니다.");
    expect(html).not.toContain("ability-selection-kicker");
    expect(html.match(/ability-card-thumbnail/g)).toHaveLength(8);
    expect(html.match(/<button[^>]*class="ability-card-back/g)).toHaveLength(8);
    expect(html).toContain("ability-card-thumbnail is-viewer");
    expect(html).toContain('style="--ability-columns:4"');
    expect(html).toContain("READY · 준비 완료");
    view.players.find(player => player.playerId === view.me.playerId)!.ready = true;
    const confirmed = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 20 }));
    expect(confirmed).toContain('class="primary" disabled=""');
    expect(confirmed).toContain("✓ 준비 완료");
  });
});
