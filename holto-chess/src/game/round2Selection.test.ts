import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, createRoom, turnKey, type RoomSnapshot } from "./room";
import { prepareShowdown, startNextRound } from "./engine";
import { createPlayerView } from "./playerView";
import { parseClientMessage, type GameAction } from "../shared/protocol";

const act = (room: RoomSnapshot, action: GameAction) => applyRoomAction(room, "p1", action, turnKey(room), 1000);
function round2() {
  let room = addSession(createRoom("ABCDEF", 707), "one").room;
  room = addSession(room, "two").room;
  room.status = "PLAYING";
  room.game = prepareShowdown(room.game, []);
  room.game.phase = "NEXT_ROUND";
  room.game = startNextRound(room.game);
  return room;
}
describe("R2 selection after selling", () => {
  it("saves each selection, removes sold cards and allows ready after replacing them", () => {
    let room = round2();
    const original = [...room.game.players[0].ownedCardIds];
    room = act(room, { type: "SELECT_CARDS", cardIds: original.slice(0, 2) });
    room = act(room, { type: "SELL_CARD", cardId: original[0] });
    expect(createPlayerView(room, "p1").me.selectedCardIds).not.toContain(original[0]);
    while (room.game.players[0].ownedCardIds.length < 3) room = act(room, { type: "BUY_CARD", cardId: room.game.players[0].shopCardIds[0] });
    const owned = room.game.players[0].ownedCardIds;
    room = act(room, { type: "SELECT_CARDS", cardIds: [] });
    room = act(room, { type: "SELECT_CARDS", cardIds: [owned[0]] });
    expect(() => act(room, { type: "END_SHOP_PHASE" })).toThrow("2장");
    room = act(room, { type: "SELECT_CARDS", cardIds: owned.slice(0, 2) });
    expect(createPlayerView(room, "p1").me.selectedCardIds).toEqual(owned.slice(0, 2));
    room = act(room, { type: "END_SHOP_PHASE" });
    expect(room.endedShopIds).toContain("p1");
    expect(() => act(room, { type: "SELECT_CARDS", cardIds: [] })).toThrow();
  });
  it("accepts partial selections over the wire but rejects duplicates and foreign cards", () => {
    for (const cardIds of [[], ["As"], ["As", "Kh"]]) {
      expect(parseClientMessage(JSON.stringify({ type: "SELECT_CARDS", cardIds, requestId: "12345678", turnKey: "2:SHOP" })).type).toBe("SELECT_CARDS");
    }
    const room = round2();
    const owned = room.game.players[0].ownedCardIds[0];
    expect(() => act(room, { type: "SELECT_CARDS", cardIds: [owned, owned] })).toThrow();
    expect(() => act(room, { type: "SELECT_CARDS", cardIds: [room.game.players[1].ownedCardIds[0]] })).toThrow();
  });
});
