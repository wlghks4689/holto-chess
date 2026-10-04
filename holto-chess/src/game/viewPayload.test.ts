import { expect, it } from "vitest";
import { createPlayerView } from "./playerView";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "./room";

/** An eight-human room advanced by timeouts to the end of the R3 cinematic, two seats eliminated. */
function afterR3(): { room: RoomSnapshot; ids: string[]; at: number } {
  let room = createRoom("PAYLOD", 7, "seeded", 2, true);
  for (let i = 0; i < 8; i++) room = addSession(room, `h-${i}`).room;
  for (const s of room.sessions) room = applyRoomAction(room, s.playerId, { type: "READY" }, turnKey(room), 1000);
  let now = 1000;
  while (!(room.game.round === 3 && room.game.phase === "ROUND_RESULT" && !room.game.survival)) { now = Math.max(now, barrierDeadline(room)!); room = forceBarrier(room, now)!; }
  return { room, ids: room.sessions.map((s) => s.playerId), at: room.presentation!.endsAt };
}

it("sends each spectator match once and omits round history identical to the matches", () => {
  const { room, ids, at } = afterR3();
  const out = room.game.players.find((p) => p.eliminated)!;
  const view = createPlayerView(room, out.id, ids, at);
  const pool = view.spectatorMatches!.map((m) => m.id);
  expect(new Set(pool).size).toBe(pool.length);
  expect(view.spectatorViews!.length).toBe(6);
  for (const perspective of view.spectatorViews!) {
    expect(perspective).not.toHaveProperty("matches");
    const survivor = room.game.roundResults.filter((m) => m.playerIds.includes(perspective.playerId)).map((m) => m.id);
    expect(perspective.matchIds).toEqual(survivor);
    expect(perspective.matchIds.every((id) => pool.includes(id))).toBe(true);
  }
  // R3's round history is exactly the shown matches, so it is left out and the client numbers them.
  const alive = createPlayerView(room, room.game.players.find((p) => !p.eliminated)!.id, ids, at);
  expect(alive.matches.length).toBeGreaterThan(0);
  expect(alive.roundHistory).toBeUndefined();
});

it("keeps R4 round history, which also holds the first-stage match the group view leaves out", () => {
  const start = afterR3(); const ids = start.ids;
  let { room, at: now } = start;
  while (!(room.game.round === 4 && room.game.phase === "ROUND_RESULT")) { now = Math.max(now, barrierDeadline(room)!); room = forceBarrier(room, now)!; }
  const seat = room.game.players.find((p) => !p.eliminated && room.sessions.some((s) => s.playerId === p.id))!;
  const view = createPlayerView(room, seat.id, ids, room.presentation!.endsAt);
  expect(view.roundHistory!.map((m) => m.matchNumber)).toEqual(view.roundHistory!.map((_, i) => i + 1));
  expect(view.roundHistory!.length).toBeGreaterThan(view.matches.length);
});
