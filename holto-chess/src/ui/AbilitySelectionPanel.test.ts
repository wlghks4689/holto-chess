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
    for (let slot = 0; slot < game.players.length; slot++) {
      game = pickAbility(game, game.players[slot]!.id, slot);
    }
    const room = { ...addSession(createRoom("UI", 303), "test-session").room, game, status: "PLAYING" as const };
    const view = createPlayerView(room, "p1");
    expect(view.phase).toBe("ABILITY_REVEAL");
    const html = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 30 }));
    expect(html).toContain("어빌리티 카드 확정");
    expect(html).toContain("카드를 선택하면 상세 효과를 볼 수 있습니다.");
    expect(html).not.toContain("ability-selection-kicker");
    expect(html.match(/ability-card-thumbnail/g)).toHaveLength(8);
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
    expect(html).toContain("카드 확대");
    expect(html.match(/ability-artwork" aria-hidden="true" data-ready="false"/g)).toHaveLength(2);
    expect(html.match(/ability-artwork-frame/g)).toHaveLength(2);
  });
});
