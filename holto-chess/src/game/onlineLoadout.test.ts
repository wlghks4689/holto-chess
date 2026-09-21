import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom as createRoomCurrent, forceBarrier, turnKey, type RoomSnapshot } from "./room";
import { prepareShowdown, startNextRound } from "./engine";
import { createPlayerView } from "./playerView";
import { parseClientMessage, type GameAction } from "../shared/protocol";
import { fillSlots, toggleSlot } from "../shared/loadoutSlots";

const act = (room: RoomSnapshot, action: GameAction) => applyRoomAction(room, "p1", action, turnKey(room), 1000);
function round3() {
  let room = addSession(createRoom("ABCDEF", 707), "one").room;
  room = addSession(room, "two").room;
  room.status = "PLAYING";
  for (let i = 0; i < 2; i++) {
    while (room.game.players[0].ownedCardIds.length < room.game.round + 1) room = act(room, { type: "BUY_CARD", cardId: room.game.players[0].shopCardIds[0] });
    room.game = prepareShowdown(room.game, []);
    room.game.phase = "NEXT_ROUND"; room.game = startNextRound(room.game);
  }
  while (room.game.players[0].ownedCardIds.length < 4) room = act(room, { type: "BUY_CARD", cardId: room.game.players[0].shopCardIds[0] });
  return room;
}
describe("one-click online loadout", () => {
  it("fills an empty socket in one click and removes a filled socket in one click", () => {
    const owned = ["As", "Kh", "Qc", "Jd"];
    const slots = toggleSlot([], owned, 2);
    expect(slots).toEqual([null, null, "As", null]);
    expect(toggleSlot(slots, owned, 2)).toEqual([null, null, null, null]);
    expect(fillSlots(slots, owned)).toEqual(["Kh", "Qc", "As", "Jd"]);
  });
  it("rejects retired R3 split placements and does not expose loadout sockets", () => {
    const room = round3();
    const owned = [...room.game.players[0].ownedCardIds];
    const slots = [null, null, owned[2], null];
    expect(() => act(room, { type: "SELECT_LOADOUT", slots })).toThrow(/분할/);
    expect(createPlayerView(room, "p1").me.loadoutSlots).toBeUndefined();
    expect(createPlayerView(room, "p2").me.loadoutSlots).toBeUndefined();
    const next = forceBarrier(room, barrierDeadline(room)!)!;
    expect(next.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(next.game.players[0].ownedCardIds).toEqual(owned);
    expect(next.game.players[0].ownedCardIds).toHaveLength(4);
  });
  it("accepts ready with all four owned cards and no selection", () => {
    let room = round3();
    const owned = [...room.game.players[0].ownedCardIds];
    room = act(room, { type: "END_SHOP_PHASE" });
    expect(room.endedShopIds).toContain("p1");
    expect(room.game.players[0].ownedCardIds).toEqual(owned);
  });
  it("keeps all four cards on timeout without a loadout step", () => {
    const room = round3();
    const next = forceBarrier(room, barrierDeadline(room)!)!;
    expect(next.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(next.game.players[0].ownedCardIds).toHaveLength(4);
    expect(new Set(next.game.players[0].ownedCardIds).size).toBe(4);
  });
  it("rejects duplicates, foreign cards, malformed messages, and edits after ready", () => {
    const room = round3(); const card = room.game.players[0].ownedCardIds[0];
    expect(() => act(room, { type: "SELECT_LOADOUT", slots: [card, card, null, null] })).toThrow();
    expect(() => act(room, { type: "SELECT_LOADOUT", slots: [room.game.players[1].ownedCardIds[0], null, null, null] })).toThrow();
    expect(() => parseClientMessage(JSON.stringify({ type: "SELECT_LOADOUT", slots: [card, card, null, null], requestId: "12345678", turnKey: "3:SHOP" }))).toThrow();
    expect(() => act(act(room, { type: "END_SHOP_PHASE" }), { type: "SELECT_LOADOUT", slots: [null, null, null, null] })).toThrow();
  });
  it("goes directly from acknowledged round results into the next shop", () => {
    let room = addSession(createRoom("ABCDEF", 707), "one").room;
    room.status = "PLAYING"; room.game.phase = "ROUND_RESULT";
    room = act(room, { type: "READY" });
    expect(room.game.round).toBe(2);
    expect(room.game.phase).toBe("SHOP");
    expect(room.loadoutDrafts).toEqual({});
  });
  it("keeps a single 30-second result deadline when one player confirms", () => {
    let room = addSession(createRoom("ABCDEF", 707), "one").room;
    room = addSession(room, "two").room;
    room.status = "PLAYING"; room.game.phase = "ROUND_RESULT";
    room = applyRoomAction(room, "p1", { type: "READY" }, turnKey(room), 1000);
    const originalDeadline = barrierDeadline(room);
    room = applyRoomAction(room, "p1", { type: "READY" }, turnKey(room), 20_000);
    expect(barrierDeadline(room)).toBe(originalDeadline);
    expect(originalDeadline).toBe(Math.max(room.barrierSince!, room.presentation?.endsAt ?? 0) + 30_000);
    expect(room.game.phase).toBe("ROUND_RESULT");
  });
});

// Regression coverage for persisted games created before the open-draft rules.
function createRoom(...args: Parameters<typeof createRoomCurrent>) { return createRoomCurrent(args[0], args[1], args[2], 1); }
