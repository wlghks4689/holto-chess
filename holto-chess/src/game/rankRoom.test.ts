import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, resumeSession, startSolo, turnKey, type RoomSnapshot } from "./room";
import { collectRankObligations } from "./rankRoom";
import { createPlayerView } from "./playerView";
import { parseClientMessage, type GameAction } from "../shared/protocol";
import { seasonAt } from "./rank";

const T0 = Date.parse("2026-11-01T00:00:00Z");
const account = (n: number) => ({ accountUserId: `user-${n}`, displayName: `계정${n}` });
/** Seats: account, account, guest unless told otherwise. */
function started(identities: (ReturnType<typeof account> | undefined)[] = [account(1), account(2), undefined]) {
  let room = createRoom("RANKAB", 777, "seeded", 2, true);
  identities.forEach((identity, i) => { room = addSession(room, `hash-${i}`, identity).room; });
  for (const session of room.sessions) room = act(room, session.playerId, { type: "READY" });
  return room;
}
function act(room: RoomSnapshot, id: string, action: GameAction, now = T0) { return applyRoomAction(room, id, action, turnKey(room), now); }
function playOut(room: RoomSnapshot) {
  for (let step = 0; step < 300 && room.game.phase !== "GAME_RESULT"; step++) room = forceBarrier(room, barrierDeadline(room)!)!;
  expect(room.game.phase).toBe("GAME_RESULT");
  return room;
}

describe("RANK-SYSTEM-002 room rank state", () => {
  it("fixes the ranked seats, human count and season when the game starts", () => {
    const room = started();
    expect(room.status).toBe("PLAYING");
    expect(room.rank).toMatchObject({ seats: { p1: "user-1", p2: "user-2" }, humanCount: 3, mode: "MULTI", seasonId: seasonAt(T0).id, forfeitIds: [], recordedIds: [] });
    // Guests only: nothing is ranked.
    expect(started([undefined, undefined]).rank).toBeUndefined();
  });

  it("requires an explicit confirmation before a live ranked seat forfeits, then records it once", () => {
    let room = started();
    expect(() => act(room, "p1", { type: "LEAVE_ROOM" })).toThrow("FORFEIT_CONFIRM_REQUIRED");
    room = act(room, "p1", { type: "LEAVE_ROOM", confirmForfeit: true });
    expect(room.rank!.forfeitIds).toEqual(["p1"]);
    expect(room.sessions[0]!.departed).toBe(true);
    // The duplicate (lost ACK, double click) changes nothing.
    room = act(room, "p1", { type: "LEAVE_ROOM", confirmForfeit: true });
    expect(room.rank!.forfeitIds).toEqual(["p1"]);
    expect(collectRankObligations(room)).toBe(true);
    expect(room.rankPending).toEqual([expect.objectContaining({ playerId: "p1", userId: "user-1", placement: 8, finalScore: 0, forfeited: true, humanCount: 3 })]);
    expect(collectRankObligations(room)).toBe(false);
  });

  it("never lets a forfeited seat take control back, and keeps the bot playing it", () => {
    let room = act(started(), "p1", { type: "LEAVE_ROOM", confirmForfeit: true });
    expect(resumeSession(room, "p1", T0)).toBeNull();
    expect(() => act(room, "p1", { type: "READY" })).toThrow("관전만");
    room = playOut(room);
    collectRankObligations(room);
    const forfeits = room.rankPending!.filter((entry) => entry.playerId === "p1");
    expect(forfeits).toHaveLength(1);
    expect(forfeits[0]!.forfeited).toBe(true);
    expect(createPlayerView(room, "p1").rank).toMatchObject({ ranked: true, forfeited: true });
  });

  it("lets a guest leave and come back as before, with no forfeit", () => {
    const room = act(started(), "p3", { type: "LEAVE_ROOM" });
    expect(room.rank!.forfeitIds).toEqual([]);
    expect(resumeSession(room, "p3", T0)!.sessions[2]!.departed).toBe(false);
  });

  it("charges no forfeit to a seat that is already eliminated, or after the final result", () => {
    const room = started();
    room.game.players[0]!.eliminated = true;
    expect(act(room, "p1", { type: "LEAVE_ROOM" }).rank!.forfeitIds).toEqual([]);
    const finished = playOut(started());
    expect(act(finished, "p2", { type: "LEAVE_ROOM" }).rank!.forfeitIds).toEqual([]);
  });

  it("queues every ranked seat's real placement at GAME_RESULT, once, and none for guests", () => {
    const room = playOut(started());
    expect(collectRankObligations(room)).toBe(true);
    const queued = room.rankPending!.map((entry) => entry.playerId).sort();
    expect(queued).toEqual(["p1", "p2"]);
    for (const entry of room.rankPending!) {
      expect(entry.forfeited).toBe(false);
      expect(entry.placement).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(entry.finalScore)).toBe(true);
    }
    expect(collectRankObligations(room)).toBe(false);
    // The result stays hidden from the view until the server confirms it; a pending flag says so.
    expect(createPlayerView(room, "p1").rank).toMatchObject({ ranked: true, forfeited: false, pending: true });
    expect(createPlayerView(room, "p3").rank).toBeUndefined();
  });

  it("starts a new ranked game on rematch without inheriting a forfeit, and keeps an unsent settlement", () => {
    let room = playOut(act(started([account(1), account(2), account(3)]), "p3", { type: "LEAVE_ROOM", confirmForfeit: true }));
    collectRankObligations(room);
    const firstGame = room.rank!.gameId;
    room.finalResultsReleasedAt = T0;
    room = act(act(room, "p1", { type: "REMATCH_READY" }), "p2", { type: "REMATCH_READY" });
    expect(room.game.phase).not.toBe("GAME_RESULT");
    expect(room.rank!.gameId).not.toBe(firstGame);
    expect(room.rank!.forfeitIds).toEqual([]);
    expect(room.rank!.seats).toEqual({ p1: "user-1", p2: "user-2" }); // the forfeited seat left the room
    expect(room.rank!.humanCount).toBe(2);
    expect(room.rankPending!.every((entry) => entry.gameId === firstGame)).toBe(true);
  });

  it("starts a ranked solo room at once with one human", () => {
    const room = startSolo(addSession(createRoom("SOLOAB", 5, "seeded", 2, true), "solo", account(9)).room, T0);
    expect(room.status).toBe("PLAYING");
    expect(room.rank).toMatchObject({ mode: "SOLO", humanCount: 1, seats: { p1: "user-9" } });
    expect(createPlayerView(room, "p1").solo).toBe(true);
  });

  it("accepts only `confirmForfeit: true` on the wire, and ignores client claims about the outcome", () => {
    const base = { requestId: "leave-request", turnKey: "a".repeat(64) };
    expect(parseClientMessage(JSON.stringify({ type: "LEAVE_ROOM", confirmForfeit: true, ...base }))).toMatchObject({ confirmForfeit: true });
    expect(() => parseClientMessage(JSON.stringify({ type: "LEAVE_ROOM", confirmForfeit: false, ...base }))).toThrow();
    for (const claim of ["placement", "rankDelta", "finalScore", "accountUserId", "humanCount"]) {
      expect(() => parseClientMessage(JSON.stringify({ type: "LEAVE_ROOM", [claim]: 1, ...base }))).toThrow("허용되지 않은 필드");
    }
  });
});
