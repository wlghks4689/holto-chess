import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRoom, addSession } from "../game/room";
import { createPlayerView } from "../game/playerView";
import { EmptyHandSlots } from "./EmptyHandSlots";
import { OnlineScoreboard } from "./OnlineScoreboard";

describe("online compact game UI", () => {
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
