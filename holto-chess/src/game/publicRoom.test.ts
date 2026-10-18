import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, createRoom, turnKey, type RoomSnapshot } from "./room";
import {
  confirmPublicSeat, isPublicLobby, makePublicRoom, markPublicSeatDisconnected, PUBLIC_CAPACITY, PUBLIC_LOBBY_TIMING,
  publicLobbyClosesAt, publicLobbyDeadline, releasedKey, releasePublicSeat, reservePublicSeat, sweepPublicLobby,
} from "./publicRoom";

const T0 = 1_000_000;
const { RESERVATION_MS, RECONNECT_GRACE_MS, EMPTY_CLOSE_MS, MAX_WAIT_MS } = PUBLIC_LOBBY_TIMING;
const lobby = () => makePublicRoom(createRoom("PUBLIC", 99), "a".repeat(32), T0);
const account = (n: number) => ({ accountUserId: `user-${n}`, displayName: `플레이어${n}` });
function reserve(room: RoomSnapshot, n: number, now = T0) {
  const result = reservePublicSeat(room, `hash-${n}`, account(n), now);
  if ("error" in result) throw new Error(result.error);
  return result;
}
function seat(room: RoomSnapshot, n: number, now = T0) {
  const { room: reserved, playerId } = reserve(room, n, now);
  return { room: confirmPublicSeat(reserved, playerId)!.room, playerId };
}
const ready = (room: RoomSnapshot, playerId: string, now = T0) => applyRoomAction(room, playerId, { type: "READY" }, turnKey(room), now);

/** Invariants every public lobby must keep, whatever happened before. */
function assertSeats(room: RoomSnapshot): void {
  const ids = room.sessions.map(session => session.playerId);
  expect(room.sessions.length).toBeLessThanOrEqual(PUBLIC_CAPACITY);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(room.sessions.map(session => session.accountUserId)).size).toBe(ids.length);
  expect(ids.every(id => room.game.players.some(player => player.id === id))).toBe(true);
  // READY belongs only to confirmed seats with a live connection.
  for (const id of room.readyIds) {
    const owner = room.sessions.find(session => session.playerId === id);
    expect(owner && owner.reservedUntil === undefined && owner.disconnectedAt === undefined).toBe(true);
  }
  for (const player of room.game.players) {
    if (!ids.includes(player.id)) expect(player.name).toBe(room.publicLobby!.botNames[player.id]);
  }
}

describe("public lobby seats", () => {
  it("reserves at most eight seats and refuses the ninth as full", () => {
    let room = lobby();
    for (let n = 1; n <= 8; n++) room = reserve(room, n).room;
    expect(reservePublicSeat(room, "hash-9", account(9), T0)).toEqual({ error: "ROOM_FULL" });
    expect(reservePublicSeat(room, "hash-x", account(3), T0)).toEqual({ error: "ACCOUNT_ALREADY_SEATED" });
    assertSeats(room);
  });

  it("seats a guest once per room, keeps the bot name until a nickname arrives, and caps one network at three seats", () => {
    const key = (c: string) => c.repeat(64);
    let room = lobby();
    const guest = reservePublicSeat(room, "g-hash", { guestKey: key("a") }, T0);
    if ("error" in guest) throw new Error(guest.error);
    expect(guest.room.sessions[0]).toMatchObject({ guestKey: key("a") });
    expect(guest.room.sessions[0]!.accountUserId).toBeUndefined();
    expect(guest.room.game.players.find(player => player.id === guest.playerId)!.name).toBe(guest.room.publicLobby!.botNames[guest.playerId]);
    expect(reservePublicSeat(guest.room, "g-hash-2", { guestKey: key("a"), displayName: "다시" }, T0)).toEqual({ error: "GUEST_ALREADY_SEATED" });
    room = guest.room;
    for (const n of [1, 2, 3]) {
      const seated = reservePublicSeat(room, `n-${n}`, { guestKey: key(String(n)), displayName: `손님${n}`, networkKey: key("e") }, T0);
      if ("error" in seated) throw new Error(seated.error);
      room = seated.room;
    }
    expect(reservePublicSeat(room, "n-4", { ...account(4), networkKey: key("e") }, T0)).toEqual({ error: "NETWORK_SEAT_LIMIT" });
    expect("error" in reservePublicSeat(room, "n-5", { ...account(5), networkKey: key("f") }, T0)).toBe(false);
  });

  it("reuses a left seat: 100 join/leave cycles never fill the room by history", () => {
    let room = seat(lobby(), 1).room;
    for (let n = 2; n < 102; n++) {
      const joined = seat(room, n);
      expect(joined.playerId).toBe("p2");
      room = releasePublicSeat(joined.room, joined.playerId, T0);
      assertSeats(room);
    }
    expect(room.sessions.map(session => session.playerId)).toEqual(["p1"]);
    expect(room.game.players.find(player => player.id === "p2")!.name).toBe(room.publicLobby!.botNames.p2);
  });

  it("gives back an unconfirmed reservation exactly at 30 seconds and remembers why", () => {
    const { room } = reserve(seat(lobby(), 1).room, 2);
    expect(sweepPublicLobby(room, T0 + RESERVATION_MS - 1)).toBeNull();
    const swept = sweepPublicLobby(room, T0 + RESERVATION_MS)!;
    expect(swept.sessions.map(session => session.playerId)).toEqual(["p1"]);
    expect(releasedKey(swept, "hash-2", T0 + RESERVATION_MS)).toBe("RESERVATION_EXPIRED");
    expect(reserve(swept, 3, T0 + RESERVATION_MS).playerId).toBe("p2");
  });

  it("keeps a disconnected seat for 89 seconds, reclaims it at 90 and drops READY at once", () => {
    let room = seat(seat(lobby(), 1).room, 2).room;
    room = ready(room, "p1");
    room = markPublicSeatDisconnected(room, ["p1"], T0)!;
    expect(room.readyIds).toEqual([]);
    expect(sweepPublicLobby(room, T0 + RECONNECT_GRACE_MS - 1000)).toBeNull();
    // Reconnecting inside the grace keeps the seat but not the old READY.
    const back = confirmPublicSeat(room, "p1")!;
    expect(back.activity).toBe(false);
    expect(back.room.readyIds).toEqual([]);
    const reclaimed = sweepPublicLobby(room, T0 + RECONNECT_GRACE_MS)!;
    expect(reclaimed.sessions.map(session => session.playerId)).toEqual(["p2"]);
    expect(releasedKey(reclaimed, "hash-1", T0 + RECONNECT_GRACE_MS)).toBe("SEAT_RELEASED");
    assertSeats(reclaimed);
  });

  it("starts only when every seat is confirmed, connected and READY", () => {
    let room = seat(seat(lobby(), 1).room, 2).room;
    room = ready(room, "p1");
    // A pending reservation blocks the start and resets READY.
    const pending = reserve(room, 3).room;
    expect(pending.readyIds).toEqual([]);
    let blocked = ready(ready(pending, "p1"), "p2");
    expect(blocked.status).toBe("LOBBY");
    // Confirming is a membership change: everybody agrees again.
    blocked = confirmPublicSeat(blocked, "p3")!.room;
    expect(blocked.readyIds).toEqual([]);
    const started = ready(ready(ready(blocked, "p1"), "p2"), "p3");
    expect(started.status).toBe("PLAYING");
    expect(isPublicLobby(started)).toBe(false);
    expect(reservePublicSeat(started, "hash-9", account(9), T0)).toEqual({ error: "ROOM_STARTED" });
  });

  it("closes 60 seconds after the last seat goes and never recruits past 60 minutes", () => {
    const fresh = lobby();
    expect(publicLobbyClosesAt(fresh)).toBe(T0 + EMPTY_CLOSE_MS);
    const { room, playerId } = seat(fresh, 1);
    expect(publicLobbyClosesAt(room)).toBe(T0 + MAX_WAIT_MS);
    const empty = releasePublicSeat(room, playerId, T0 + 5000);
    expect(publicLobbyClosesAt(empty)).toBe(T0 + 5000 + EMPTY_CLOSE_MS);
    expect(publicLobbyDeadline(reserve(room, 2, T0 + 1000).room)).toBe(T0 + 1000 + RESERVATION_MS);
  });

  it("leaving a public lobby frees the seat instead of leaving a bot-played departure", () => {
    const room = seat(seat(lobby(), 1).room, 2).room;
    const left = applyRoomAction(room, "p2", { type: "LEAVE_ROOM" }, turnKey(room), T0);
    expect(left.sessions.map(session => session.playerId)).toEqual(["p1"]);
    expect(left.sessions.some(session => session.departed)).toBe(false);
  });

  it("leaves private lobbies untouched", () => {
    const room = addSession(addSession(createRoom("PRIVAT", 5), "a").room, "b").room;
    expect(isPublicLobby(room)).toBe(false);
    expect(sweepPublicLobby(room, T0 + MAX_WAIT_MS * 2)).toBeNull();
    expect(publicLobbyDeadline(room)).toBeUndefined();
    expect(markPublicSeatDisconnected(room, ["p1"], T0)).toBeNull();
    const left = applyRoomAction(room, "p2", { type: "LEAVE_ROOM" }, turnKey(room), T0);
    expect(left.sessions.find(session => session.playerId === "p2")!.departed).toBe(true);
  });

  it("keeps capacity and ownership invariants under 1,000 random event orders", () => {
    // Seeded LCG: a failure prints the seed and step so the exact order can be replayed.
    for (let seed = 1; seed <= 1000; seed++) {
      let state = seed;
      const random = (n: number) => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
      let room = lobby();
      let now = T0;
      let nextAccount = 1;
      for (let step = 0; step < 60; step++) {
        now += random(20_000);
        const ids = room.sessions.map(session => session.playerId);
        const pick = ids[random(Math.max(ids.length, 1))];
        try {
          switch (random(6)) {
            case 0: { const result = reservePublicSeat(room, `hash-${nextAccount}`, account(nextAccount), now); nextAccount++; if (!("error" in result)) room = result.room; break; }
            case 1: if (pick) room = confirmPublicSeat(room, pick)?.room ?? room; break;
            case 2: if (pick) room = markPublicSeatDisconnected(room, [pick], now) ?? room; break;
            case 3: if (pick) room = releasePublicSeat(room, pick, now); break;
            case 4: if (pick) { try { room = ready(room, pick, now); } catch { /* READY is refused for seats it does not apply to */ } } break;
            default: room = sweepPublicLobby(room, now) ?? room;
          }
          if (!isPublicLobby(room)) break;
          assertSeats(room);
        } catch (error) {
          throw new Error(`seed ${seed} step ${step}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
      }
    }
  }, 60_000); // About 5s alone; the full parallel suite can be several times slower.
});
