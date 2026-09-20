import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRoom, addSession } from "../game/room";
import { createPlayerView } from "../game/playerView";
import { EmptyHandSlots } from "./EmptyHandSlots";
import { OnlineScoreboard } from "./OnlineScoreboard";

describe("online compact game UI", () => {
  it("ranks points before BB and survival status, using BB only to break ties", () => {
    const view = createPlayerView(addSession(createRoom("ABCDEF", 101), "one").room, "p1");
    view.players = view.players.slice(0, 3);
    Object.assign(view.players[0], { name: "HIGH_BB", points: 10, stackBB: 300, alive: true });
    Object.assign(view.players[1], { name: "HIGH_POINTS", points: 20, stackBB: 30, alive: false });
    Object.assign(view.players[2], { name: "TIED_POINTS", points: 10, stackBB: 100, alive: true });
    const originalIds = view.players.map((player) => player.playerId);
    const html = renderToStaticMarkup(createElement(OnlineScoreboard, { view }));
    expect(html.indexOf("HIGH_POINTS")).toBeLessThan(html.indexOf("HIGH_BB"));
    expect(html.indexOf("HIGH_BB")).toBeLessThan(html.indexOf("TIED_POINTS"));
    expect(view.players.map((player) => player.playerId)).toEqual(originalIds);
  });
  it("shows exactly the unfilled hand capacity, including later seven-card rounds", () => {
    for (const [count, limit] of [[1, 2], [3, 3], [4, 7], [7, 7]]) {
      const html = renderToStaticMarkup(createElement(EmptyHandSlots, { count, limit }));
      expect(html.match(/inventory-empty-slot/g)?.length ?? 0).toBe(limit - count);
      if (count < limit) expect(html).toContain(`카드 슬롯 ${count + 1} / ${limit} 비어 있음`);
    }
  });
  it("uses a closed dialog table instead of a horizontal seat strip", () => {
    const room = addSession(createRoom("ABCDEF", 101), "one").room;
    const view = createPlayerView(room, "p1");
    view.players[0].name = "내 플레이어";
    view.players[1].name = "선두 플레이어";
    view.players[1].points = 99;
    const html = renderToStaticMarkup(createElement(OnlineScoreboard, { view }));
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).not.toContain("player-strip");
    for (const title of ["순위", "플레이어", "보유 BB", "승점"]) expect(html).toContain(title);
    expect(html.indexOf("선두 플레이어")).toBeLessThan(html.indexOf("내 플레이어"));
    expect(html.match(/<tr/g)).toHaveLength(9);
  });
});
