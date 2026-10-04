import { expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, migrateRoomSnapshot, turnKey } from "./room";
import { createPlayerView } from "./playerView";

it("keeps other seats at shop-entry BB through buy/sell/commit, but shows the owner immediately", () => {
  let room = createRoom("ABCDEF", 303);
  for (let i = 0; i < 8; i++) room = addSession(room, `hash-${i}`).room;
  for (const session of room.sessions) room = applyRoomAction(room, session.playerId, { type: "READY" }, turnKey(room), 1000);
  const before = createPlayerView(room, "p1", [], 1000);
  const owner = createPlayerView(room, "p2", [], 1000);
  const card = owner.me.shopCards.find(card => card.price <= owner.me.stackBB)!;
  room = applyRoomAction(room, "p2", { type: "BUY_CARD", cardId: card.card.id }, turnKey(room), 1000);
  const buyer = createPlayerView(room, "p2", [], 1000);
  expect(buyer.me.stackBB).toBe(owner.me.stackBB - card.price);
  expect(createPlayerView(room, "p1", [], 1000).players).toEqual(before.players);
  const restored = migrateRoomSnapshot(JSON.parse(JSON.stringify(room)));
  expect(createPlayerView(restored, "p1", [], 1000).players).toEqual(before.players);
  // R1 starts empty, so a sale would strand the hand; a reroll is the other spend to keep hidden.
  room = applyRoomAction(room, "p2", { type: "REROLL" }, turnKey(room), 1000);
  expect(createPlayerView(room, "p1", [], 1000).players).toEqual(before.players);
  room = applyRoomAction(room, "p2", { type: "BUY_CARD", cardId: createPlayerView(room, "p2").me.shopCards.find(card => card.price <= room.game.players[1]!.stackBB)!.card.id }, turnKey(room), 1000);
  room = applyRoomAction(room, "p2", { type: "END_SHOP_PHASE" }, turnKey(room), 1000);
  expect(createPlayerView(room, "p1", [], 1000).players.find(p => p.playerId === "p2")!.stackBB).toBe(50);
  room = applyRoomAction(room, "p2", { type: "CANCEL_SHOP_READY" }, turnKey(room), 1000);
  for (const session of room.sessions) {
    const owner = createPlayerView(room, session.playerId, [], 1000);
    for (let have = owner.me.ownedCards.length; have < 2; have += 1) {
      const me = createPlayerView(room, session.playerId, [], 1000).me;
      const available = me.shopCards.find(card => card.price <= me.stackBB)!;
      room = applyRoomAction(room, session.playerId, { type: "BUY_CARD", cardId: available.card.id }, turnKey(room), 1000);
    }
    room = applyRoomAction(room, session.playerId, { type: "END_SHOP_PHASE" }, turnKey(room), 1000);
  }
  expect(room.game.phase).not.toBe("SHOP");
  expect(room.shopPublicBB).toBeUndefined();
  expect(createPlayerView(room, "p1", [], 1000).players.find(p => p.playerId === "p2")!.stackBB).toBe(room.game.players[1]!.stackBB);
});

it("freezes spectator balances and captures old shop snapshots at migration time", () => {
  let room = createRoom("ABCDEF", 303);
  for (let i = 0; i < 8; i++) room = addSession(room, `hash-${i}`).room;
  for (const session of room.sessions) room = applyRoomAction(room, session.playerId, { type: "READY" }, turnKey(room), 1000);
  for (let step = 0; step < 60 && !(room.game.round === 3 && room.game.phase === "SHOP"); step++) {
    room = forceBarrier(room, barrierDeadline(room)!)!;
  }
  expect(room.game.round).toBe(3);
  expect(room.game.phase).toBe("SHOP");
  // Projection fixture: a previously eliminated viewer follows a surviving seat.
  room.game.players[0]!.eliminated = true;
  room.game.players[0]!.eliminatedRound = 2;
  const target = room.game.players.find(player => player.id !== "p1" && !player.eliminated)!;
  const entryBalance = target.stackBB;
  target.stackBB -= 7;
  const view = createPlayerView(room, "p1", [], 1000);
  expect(view.spectatorViews!.find(seat => seat.playerId === target.id)!.me.stackBB).toBe(entryBalance);
  delete room.shopPublicBB;
  const migrated = migrateRoomSnapshot(room);
  expect(migrated.shopPublicBB!.values[target.id]).toBe(target.stackBB);
  // Historical entry balances cannot be reconstructed for an old mid-shop save.
  target.stackBB -= 3;
  expect(migrated.shopPublicBB!.values[target.id]).not.toBe(target.stackBB);
});
