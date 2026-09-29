import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAbilityGame, openAbilitySelection, pickAbility } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { addSession, createRoom } from "../game/room";
import { AbilitySelectionPanel } from "./AbilitySelectionPanel";

describe("ability draft presentation", () => {
  it("keeps ten card slots and exposes inspectable own/opponent thumbnails without an inline detail card", () => {
    let game = openAbilitySelection(createAbilityGame(303));
    game.abilityDraft!.order = game.players.map(player => player.id);
    game = pickAbility(game, "p1", 0);
    game = pickAbility(game, "p2", 1);
    const room = { ...addSession(createRoom("UI", 303), "test-session").room, game, status: "PLAYING" as const };
    const view = createPlayerView(room, "p1");
    const html = renderToStaticMarkup(createElement(AbilitySelectionPanel, { view, send: () => {}, seconds: 12 }));
    expect(html.match(/class="ability-card-back/g)).toHaveLength(10);
    expect(html.match(/ability-card-thumbnail/g)).toHaveLength(2);
    expect(html).toContain("ability-card-thumbnail is-viewer");
    expect(html).not.toContain("ability-picked-preview");
    expect(html).not.toContain("ability-card-description");
    expect(html).toContain("카드 확대");
  });
});
