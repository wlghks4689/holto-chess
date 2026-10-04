import { expect, it } from "vitest";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { DISCLOSURE_LEAD_MS, nextDisclosureAt } from "./disclosure";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "./room";

/** A two-seat room advanced by timeouts until the R1 showdown cinematic is scheduled. */
function r1Showdown(): RoomSnapshot {
  let room = createRoom("LEADAB", 11, "seeded", 2, true);
  for (let i = 0; i < 2; i++) room = addSession(room, `h-${i}`).room;
  for (const s of room.sessions) room = applyRoomAction(room, s.playerId, { type: "READY" }, turnKey(room), 1000);
  let now = 1000;
  while (!room.presentation) { now = Math.max(now, barrierDeadline(room)!); room = forceBarrier(room, now)!; }
  return room;
}

it("releases each cinematic beat ahead of the shared clock but final results only at the end", () => {
  const room = r1Showdown();
  const schedule = room.presentation!;
  const entry = schedule.perPlayer.p1![0]!;
  const match = room.game.roundResults.find((m) => m.id === entry.matchId)!;
  const frame = cinematicTimeline(createMatchView(room.game, match)).find((f) => f.phase === "RESULT")!;
  const beat = schedule.startsAt + entry.offsetMs + (entry.prepMs ?? 0) + frame.at;
  const shown = (now: number) => createPlayerView(room, "p1", ["p1", "p2"], now).matches.find((m) => m.id === match.id);
  // The RESULT beat reaches the client DISCLOSURE_LEAD_MS early, not exactly on time.
  expect(shown(beat - DISCLOSURE_LEAD_MS - 1)!.winnerIds).toEqual([]);
  expect(shown(beat - DISCLOSURE_LEAD_MS)!.winnerIds).toEqual(match.winnerIds);
  // The alarm that carries it fires early too.
  expect(nextDisclosureAt(room, beat - DISCLOSURE_LEAD_MS - 1)).toBeLessThanOrEqual(beat - DISCLOSURE_LEAD_MS);
  // Round standings stay closed until the presentation really ends.
  expect(createPlayerView(room, "p1", ["p1", "p2"], schedule.endsAt - 1).presentation!.complete).toBe(false);
  expect(createPlayerView(room, "p1", ["p1", "p2"], schedule.endsAt).presentation!.complete).toBe(true);
});
