import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createRoom, addSession } from "../game/room";
import { openDraft, prepareShowdown, resolvePrimary, leaveRoundResult, startNextRound } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { OpenDraftPanel } from "./OpenDraft";
import { canPickR2Card, DRAFT_DEAL_MS } from "./r2DraftPresentation";

function fixture(open = false) {
  const room = addSession(createRoom("DRAFT", 303), "one").room;
  room.status = "PLAYING";
  room.game = startNextRound(leaveRoundResult(resolvePrimary(prepareShowdown(room.game, []))));
  room.sessions[0].playerId = room.game.draft!.order[0].playerId;
  if (open) room.game = openDraft(room.game);
  return createPlayerView(room, room.game.draft!.order[0].playerId);
}
it("renders eight public cards with a compact hand-free order panel", () => {
  const view = fixture();
  const html = renderToStaticMarkup(createElement(OpenDraftPanel, { view, send: () => {}, disabled: false, seconds: 20 }));
  expect(html.match(/class="r2-card-slot /g)).toHaveLength(8);
  expect(html.match(/class="r2-order-name"/g)).toHaveLength(8);
  expect(html).not.toContain("draft-hand");
  expect(html).not.toContain("비공개 카드");
  expect(html).toContain("ROUND 2 · DRAFT PHASE");
  expect(html).toContain("공개 드래프트");
  expect(html).not.toContain("공용 카드 배치 중");
  expect(html).not.toContain("모든 플레이어가 같은");
  expect(html).not.toContain("배치 중");
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('aria-current="step"');
  expect(DRAFT_DEAL_MS).toBeGreaterThanOrEqual(1200);
  expect(DRAFT_DEAL_MS).toBeLessThanOrEqual(1600);
});
it("blocks selection during dealing, claimed, other turns, insufficient BB and server-disabled states", () => {
  const view = fixture(true);
  expect(canPickR2Card(view, 5, undefined, false, false)).toBe(true);
  expect(canPickR2Card(view, 5, undefined, false, true)).toBe(false);
  expect(canPickR2Card(view, 5, "p8", false, false)).toBe(false);
  expect(canPickR2Card(view, 5, undefined, true, false)).toBe(false);
  expect(canPickR2Card(view, view.me.stackBB + 1, undefined, false, false)).toBe(false);
  view.draft!.currentPlayerId = "someone-else";
  expect(canPickR2Card(view, 5, undefined, false, false)).toBe(false);
});
it("shows claimed owners and skips deal-in when reconnecting after a pick", () => {
  const view = fixture(true);
  view.draft!.cards[0].claimedBy = view.draft!.order[0].playerId;
  view.draft!.currentPlayerId = view.draft!.order[1].playerId;
  const html = renderToStaticMarkup(createElement(OpenDraftPanel, { view, send: () => {}, disabled: true, seconds: 12 }));
  expect(html).toContain('aria-busy="false"');
  expect(html).toContain("is-claimed");
  expect(html).toContain("✓ 완료");
});
it("does not present the AI pick delay as the local player's remaining time", () => {
  const view = fixture(true);
  view.draft!.currentPlayerId = view.draft!.order[1].playerId;
  const html = renderToStaticMarkup(createElement(OpenDraftPanel, { view, send: () => {}, disabled: false, seconds: 1 }));
  expect(html).not.toContain('role="timer"');
  expect(html).toContain("선택 중");
});
