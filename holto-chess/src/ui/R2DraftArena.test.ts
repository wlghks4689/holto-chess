import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createRoom, addSession } from "../game/room";
import { openDraft, pickDraftCard, prepareShowdown, resolvePrimary, leaveRoundResult, startNextRound } from "../game/engine";
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
  expect(html).toContain('class="draft-private-hand"');
  expect(html).toContain("내 보유 카드");
  expect(html).toContain("상대에게 비공개");
  expect(html).toContain('aria-label="보유 카드 공개 범위 보기"');
  expect(html).toContain('<span role="tooltip">상대에게 비공개</span>');
  expect(html.indexOf('class="draft-private-hand"')).toBeGreaterThan(html.indexOf('class="r2-arena"'));
  const hand = html.match(/<div class="draft-private-cards">([\s\S]*?)<\/div>/)?.[1] ?? "";
  expect(hand.match(/class="playing-card/g)).toHaveLength(view.me.ownedCards.length);
  expect(html).toContain("드래프트 선택 순서");
  expect(html).toContain('class="draft-private-timer"');
  expect(html.indexOf('class="r2-draft-heading"')).toBeGreaterThan(html.indexOf('class="r2-stage"'));
  expect(html.indexOf('class="r2-draft-heading"')).toBeLessThan(html.indexOf('class="r2-arena"'));
  expect(html).not.toContain("ROUND 2 · DRAFT PHASE");
  expect(html).toContain("공개 드래프트");
  expect(html).toContain('aria-label="공개 드래프트 진행 방식 보기"');
  expect(html).toContain('role="tooltip"');
  expect(html).toContain("누적 승점 낮은 순");
  expect(html).toContain("8장 공개 풀에서 차례마다 1장을 구매");
  expect(html).not.toContain("r2-draft-rule");
  expect(html).not.toContain("공용 카드 배치 중");
  expect(html).not.toContain("모든 플레이어가 같은");
  expect(html).not.toContain("배치 중");
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('aria-current="step"');
  expect(DRAFT_DEAL_MS).toBeGreaterThanOrEqual(1200);
  expect(DRAFT_DEAL_MS).toBeLessThanOrEqual(1600);
});
it("adds the purchased card to the same viewer's centered private hand", () => {
  const room = addSession(createRoom("DRAFT-PICK", 303), "one").room;
  room.status = "PLAYING";
  room.game = openDraft(startNextRound(leaveRoundResult(resolvePrimary(prepareShowdown(room.game, [])))));
  const viewer = room.game.draft!.order[0]!.playerId;
  room.sessions[0]!.playerId = viewer;
  const before = createPlayerView(room, viewer);
  const chosen = before.draft!.cards.find(({ price }) => price <= before.me.stackBB)!;
  room.game = pickDraftCard(room.game, viewer, chosen.card.id);
  const after = createPlayerView(room, viewer);
  const html = renderToStaticMarkup(createElement(OpenDraftPanel, { view: after, send: () => {}, disabled: false, seconds: 20 }));
  const hand = html.match(/<div class="draft-private-cards">([\s\S]*?)<\/div>/)?.[1] ?? "";
  expect(after.me.ownedCards).toHaveLength(before.me.ownedCards.length + 1);
  expect(after.me.ownedCards.some((card) => card.id === chosen.card.id)).toBe(true);
  expect(hand.match(/class="playing-card/g)).toHaveLength(after.me.ownedCards.length);
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
it("keeps the R4 draft order compact without showing any opponent hole cards", () => {
  const view = fixture(true);
  view.round = 4;
  view.draft!.publicHands = { [view.draft!.order[1]!.playerId]: [{ id: "Ah", rank: 14, suit: "h" }] };
  const html = renderToStaticMarkup(createElement(OpenDraftPanel, { view, send: () => {}, disabled: false, seconds: 20 }));

  expect(html).toContain('class="r2-order"');
  expect(html).toContain('class="draft-private-hand"');
  expect(html).toContain("상대에게 비공개");
  expect(html).not.toContain("4장 · 상대에게 비공개");
  expect(html).toContain("16장 공개 풀에서 차례마다 1장을 구매");
  expect(html).toContain('role="tooltip"');
  expect(html).toContain('class="phase-timer is-normal r2-clock"');
  expect(html).not.toContain('class="draft-hand"');
  expect(html).not.toContain('class="card-back');
  expect(html).not.toContain('class="draft-acquired"');
});
