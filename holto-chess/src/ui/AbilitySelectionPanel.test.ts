import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAbilityGame, openAbilitySelection, pickAbility } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { addSession, createRoom } from "../game/room";
import { AbilitySelectionPanel } from "./AbilitySelectionPanel";

describe("ability draft presentation", () => {
  it("shows the confirmed heading and concise inspection hint without the reveal kicker", () => {
    let game = openAbilitySelection(createAbilityGame(303));
    game.abilityDraft!.order = game.players.map(player => player.id);
    const selectedSlots = [0, 2, 3, 5, 7, 8, 10, 11];
    for (let pick = 0; pick < game.players.length; pick++) {
      game = pickAbility(game, game.players[pick]!.id, selectedSlots[pick]!);
    }
    const room = { ...addSession(createRoom("UI", 303), "test-session").room, game, status: "PLAYING" as const };
    const view = createPlayerView(room, "p1");
    expect(view.phase).toBe("ABILITY_REVEAL");
    const html = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 30 }));
    expect(html).toContain("어빌리티 카드 확정");
    expect(html).toContain("모든 플레이어가 준비 완료되면 상점 단계로 넘어갑니다. (자동 시작 30초)");
    expect(html).toContain("카드를 선택하면 상세 효과를 볼 수 있습니다.");
    expect(html).not.toContain("ability-selection-kicker");
    expect(html.match(/ability-card-thumbnail/g)).toHaveLength(8);
    expect(html.match(/<button[^>]*class="ability-card-back/g)).toHaveLength(8);
    expect(html).toContain('style="--ability-columns:4"');
    expect(html).toContain("READY · 준비 완료");
    expect(html).toContain("30초");
    view.players.find(player => player.playerId === view.me.playerId)!.ready = true;
    const confirmed = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 20 }));
    expect(confirmed).toContain('class="primary" disabled=""');
    expect(confirmed).toContain("✓ 준비 완료");
  });

  it("keeps twelve selectable slots, no inert mobile backs and inspectable thumbnails", () => {
    let game = openAbilitySelection(createAbilityGame(303));
    game.abilityDraft!.order = game.players.map(player => player.id);
    game = pickAbility(game, "p1", 0);
    game = pickAbility(game, "p2", 1);
    const room = { ...addSession(createRoom("UI", 303), "test-session").room, game, status: "PLAYING" as const };
    const view = createPlayerView(room, "p1");
    const html = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 12 }));
    expect(html.match(/<button[^>]*class="ability-card-back/g)).toHaveLength(12);
    expect(html).not.toContain("ability-card-placeholder");
    expect(html.match(/ability-card-thumbnail/g)).toHaveLength(2);
    expect(html).toContain("ability-card-thumbnail is-viewer");
    expect(html).not.toContain("ability-picked-preview");
    expect(html).not.toContain("ability-card-description");
    expect(html).not.toContain("READY · 준비 완료");
    expect(html).toContain("카드 확대");
    expect(html.match(/ability-artwork" aria-hidden="true" data-ready="false"/g)).toHaveLength(2);
    expect(html.match(/ability-artwork-frame/g)).toHaveLength(2);
  });
});
