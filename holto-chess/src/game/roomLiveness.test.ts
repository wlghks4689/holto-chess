import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import {
  BARRIER_TIMEOUT_MS, addSession, applyRoomAction, barrierDeadline, barrierTimeoutMs, createRoom,
  forceBarrier, pendingBarrierIds, turnKey, type RoomSnapshot,
} from "./room";
import type { GameAction } from "../shared/protocol";

const T0 = 1_000_000;
function act(room: RoomSnapshot, id: string, action: GameAction, now = T0): RoomSnapshot {
  return applyRoomAction(room, id, action, turnKey(room), now);
}
function started(count = 2, seed = 707): RoomSnapshot {
  let room = createRoom("ABCDEF", seed);
  for (let i = 0; i < count; i++) room = addSession(room, `hash-${i}`).room;
  for (const session of room.sessions) room = act(room, session.playerId, { type: "READY" });
  expect(room.status).toBe("PLAYING");
  return room;
}
/** Fills a seat to the round's hand limit and commits it, the way a live client would. */
function finishShop(room: RoomSnapshot, id: string, now = T0): RoomSnapshot {
  let next = room;
  const limit = BALANCE.handLimits[next.game.round];
  while (next.game.players.find((p) => p.id === id)!.ownedCardIds.length < limit) {
    const cardId = next.game.players.find((p) => p.id === id)!.shopCardIds[0]!;
    next = act(next, id, { type: "BUY_CARD", cardId }, now);
  }
  const owned = next.game.players.find((p) => p.id === id)!.ownedCardIds;
  const required = next.game.round === 2 ? 2 : next.game.round === 3 ? 4 : 0;
  if (required) next = act(next, id, { type: "SELECT_CARDS", cardIds: owned.slice(0, required) }, now);
  return act(next, id, { type: "END_SHOP_PHASE" }, now);
}

describe("barrier liveness", () => {
  it("tracks who a barrier waits on and arms a deadline only while blocked", () => {
    const room = started();
    expect(pendingBarrierIds(room).sort()).toEqual(["p1", "p2"]);
    expect(barrierDeadline(room)).toBe(T0 + BARRIER_TIMEOUT_MS.SHOP);

    const oneDone = finishShop(room, "p1");
    expect(pendingBarrierIds(oneDone)).toEqual(["p2"]);
    // A different blocker set restarts the countdown rather than inheriting it.
    expect(barrierDeadline(oneDone)).toBe(T0 + BARRIER_TIMEOUT_MS.SHOP);

    // Clearing the shop barrier immediately opens the next one, so a deadline
    // stays armed; it only disarms when the game has nothing left to wait for.
    const bothDone = finishShop(oneDone, "p2");
    expect(bothDone.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(pendingBarrierIds(bothDone).sort()).toEqual(["p1", "p2"]);
    expect(barrierDeadline(bothDone)).toBe(T0 + BARRIER_TIMEOUT_MS.DEFAULT);

    let finished = bothDone;
    for (let step = 0; step < 40 && finished.game.phase !== "GAME_RESULT"; step++) {
      finished = forceBarrier(finished, barrierDeadline(finished) ?? T0) ?? finished;
      if (finished.game.phase === "GAME_RESULT") break;
    }
    expect(finished.game.phase).toBe("GAME_RESULT");
    expect(pendingBarrierIds(finished)).toEqual([]);
    expect(barrierDeadline(finished)).toBeUndefined();
  });

  it("does not force a barrier before the deadline", () => {
    const room = started();
    // The shop is the long clock, so the default deadline must not fire here.
    expect(room.game.phase).toBe("SHOP");
    expect(forceBarrier(room, T0 + BARRIER_TIMEOUT_MS.DEFAULT)).toBeNull();
    expect(forceBarrier(room, T0 + BARRIER_TIMEOUT_MS.SHOP - 1)).toBeNull();
    expect(forceBarrier(room, T0 + BARRIER_TIMEOUT_MS.SHOP)).not.toBeNull();
  });

  it("reserves viewing time for results while retaining short ready barriers", () => {
    expect(barrierTimeoutMs("ROUND_RESULT")).toBe(180_000);
    expect(barrierTimeoutMs("GROUP_ASSIGNMENT")).toBe(180_000);
    const shop = started();
    expect(shop.game.phase).toBe("SHOP");
    expect(barrierTimeoutMs(shop.game.phase)).toBe(60_000);
    const ready = finishShop(finishShop(shop, "p1"), "p2");
    expect(ready.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(barrierTimeoutMs(ready.game.phase)).toBe(30_000);
    expect(barrierDeadline(ready)).toBe(T0 + 30_000);
  });

  it("a silent player cannot strand the shop: the bot finishes their seat", () => {
    const room = finishShop(started(), "p1");
    expect(room.game.phase).toBe("SHOP");
    expect(pendingBarrierIds(room)).toEqual(["p2"]);

    const forced = forceBarrier(room, T0 + barrierTimeoutMs(room.game.phase))!;
    expect(forced).not.toBeNull();
    expect(forced.game.phase).not.toBe("SHOP");
    // The absent player keeps their seat and is dealt a legal hand.
    expect(forced.game.players.find((p) => p.id === "p2")!.ownedCardIds).toHaveLength(BALANCE.handLimits[1]);
    expect(forced.sessions.find((s) => s.playerId === "p2")!.departed).toBeFalsy();
  });

  it("a silent player cannot strand a ready barrier", () => {
    let room = finishShop(finishShop(started(), "p1"), "p2");
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
    room = act(room, "p1", { type: "READY" });
    expect(pendingBarrierIds(room)).toEqual(["p2"]);

    const forced = forceBarrier(room, T0 + barrierTimeoutMs(room.game.phase))!;
    expect(forced.game.phase).not.toBe("SHOWDOWN_PRIMARY");
    expect(forced.readyIds).toEqual([]);
  });

  it("forcing repeatedly always makes progress instead of looping", () => {
    let room = started();
    const seen = new Set<string>();
    for (let step = 0; step < 40 && room.game.phase !== "GAME_RESULT"; step++) {
      const next = forceBarrier(room, barrierDeadline(room) ?? T0);
      if (!next) break;
      const key = `${turnKey(next)}|${next.revision}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      room = next;
    }
    // Nobody ever answered, so bots must have carried the game to its end.
    expect(room.game.phase).toBe("GAME_RESULT");
  });
});

describe("leaving a room", () => {
  it("frees the barrier immediately and hands the seat to the bot", () => {
    let room = started(2);
    room = finishShop(room, "p1");
    expect(pendingBarrierIds(room)).toEqual(["p2"]);

    room = act(room, "p2", { type: "LEAVE_ROOM" });
    expect(room.sessions.find((s) => s.playerId === "p2")!.departed).toBe(true);
    // The shop resolved without waiting: the departed seat was played out, and
    // the next barrier now waits only on the player who is still here.
    expect(room.game.phase).not.toBe("SHOP");
    expect(pendingBarrierIds(room)).toEqual(["p1"]);
    expect(room.game.players.find((p) => p.id === "p2")!.ownedCardIds).toHaveLength(BALANCE.handLimits[1]);
  });

  it("a departed player can no longer act but keeps receiving the game", () => {
    let room = act(started(2), "p1", { type: "LEAVE_ROOM" });
    expect(() => act(room, "p1", { type: "READY" })).toThrow(/나갔습니다/);
    // Leaving twice is harmless.
    room = act(room, "p1", { type: "LEAVE_ROOM" });
    expect(room.sessions.find((s) => s.playerId === "p1")!.departed).toBe(true);
  });

  it("an eliminated player never blocks a barrier in the first place", () => {
    let room = started(2, 4242);
    // Drive to a round where elimination has happened.
    for (let guard = 0; guard < 40 && !room.game.players.some((p) => p.eliminated); guard++) {
      const next = forceBarrier(room, barrierDeadline(room) ?? T0);
      if (!next) break;
      room = next;
    }
    const out = room.game.players.find((p) => p.eliminated && ["p1", "p2"].includes(p.id));
    expect(out).toBeDefined();
    expect(pendingBarrierIds(room)).not.toContain(out!.id);
  });

  it("every human leaving still lets the game finish on bots", () => {
    let room = started(2);
    room = act(room, "p1", { type: "LEAVE_ROOM" });
    room = act(room, "p2", { type: "LEAVE_ROOM" });
    expect(pendingBarrierIds(room)).toEqual([]);
    for (let step = 0; step < 40 && room.game.phase !== "GAME_RESULT"; step++) {
      const next = forceBarrier(room, barrierDeadline(room) ?? T0);
      if (!next) break;
      room = next;
    }
    expect(room.game.phase).toBe("GAME_RESULT");
  });
});
