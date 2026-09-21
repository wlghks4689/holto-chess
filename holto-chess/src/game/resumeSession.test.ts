import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, createRoom, pendingBarrierIds, resumeSession, turnKey, type RoomSnapshot } from "./room";

const T0 = 2_000_000;
function started(): RoomSnapshot {
  let room = createRoom("ABCDEF", 909);
  for (const hash of ["hash-1", "hash-2"]) room = addSession(room, hash).room;
  for (const session of room.sessions) room = applyRoomAction(room, session.playerId, { type: "READY" }, turnKey(room), T0);
  expect(room.status).toBe("PLAYING");
  return room;
}

describe("leaving and coming back", () => {
  it("hands a left seat to the bot and stops waiting on it", () => {
    const room = applyRoomAction(started(), "p2", { type: "LEAVE_ROOM" }, turnKey(started()), T0);
    expect(room.sessions.find((session) => session.playerId === "p2")!.departed).toBe(true);
    expect(pendingBarrierIds(room)).not.toContain("p2");
    expect(() => applyRoomAction(room, "p2", { type: "READY" }, turnKey(room), T0)).toThrow(/나갔습니다/);
  });

  it("gives the seat back on reconnect, from the round in progress", () => {
    const left = applyRoomAction(started(), "p2", { type: "LEAVE_ROOM" }, turnKey(started()), T0);
    const back = resumeSession(left, "p2", T0 + 30_000)!;
    expect(back).not.toBeNull();
    expect(back.sessions.find((session) => session.playerId === "p2")!.departed).toBeFalsy();
    expect(back.revision).toBeGreaterThan(left.revision);
    // The seat is live again: the phase waits for it and its own actions are accepted.
    expect(pendingBarrierIds(back)).toContain("p2");
    expect(() => applyRoomAction(back, "p2", { type: "END_SHOP_PHASE" }, turnKey(back), T0 + 30_000)).not.toThrow(/나갔습니다/);
    // Whatever the bot did while away stands; resuming never rewinds the game.
    expect(back.game.round).toBe(left.game.round);
    expect(back.game.phase).toBe(left.game.phase);
  });

  it("is a no-op for a seat that never left", () => {
    expect(resumeSession(started(), "p1", T0)).toBeNull();
  });
});
