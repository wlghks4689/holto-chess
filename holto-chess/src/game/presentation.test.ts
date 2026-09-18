import { describe, expect, it } from "vitest";
import { MATCH_HOLD_MS, PRESENTATION_LEAD_MS, cinematicTimeline, presentationDurationMs } from "../shared/presentationTimeline";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import { matchesVisible, visibleMatchesFor } from "./presentation";
import { addSession, applyRoomAction, barrierDeadline, barrierTimeoutMs, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "./room";

const T0 = 5_000_000;
function started(count = 3, seed = 707): RoomSnapshot {
  let room = createRoom("ABCDEF", seed);
  for (let i = 0; i < count; i++) room = addSession(room, `hash-${i}`).room;
  for (const session of room.sessions) room = applyRoomAction(room, session.playerId, { type: "READY" }, turnKey(room), T0);
  return room;
}
/** Lets bots carry every barrier until the next showdown set is visible, recording when it opened. */
function untilVisible(room: RoomSnapshot): { room: RoomSnapshot; openedAt: number } {
  for (let guard = 0; guard < 40; guard++) {
    const at = barrierDeadline(room) ?? T0;
    const next = forceBarrier(room, at);
    if (!next) break;
    room = next;
    if (matchesVisible(room)) return { room, openedAt: at };
  }
  throw new Error("no showdown became visible");
}

describe("server-scheduled showdown presentation", () => {
  it("stamps one shared start/end for the visible showdown set, sized to the longest seat", () => {
    const { room, openedAt } = untilVisible(started());
    const schedule = room.presentation!;
    expect(schedule.startsAt).toBe(openedAt + PRESENTATION_LEAD_MS);
    let longest = 0;
    for (const { playerId } of room.sessions) {
      const entries = schedule.perPlayer[playerId]!;
      const matches = visibleMatchesFor(room, playerId);
      expect(entries.map((entry) => entry.matchId)).toEqual(matches.map((match) => match.id));
      let offset = 0;
      entries.forEach((entry, index) => {
        const view = createMatchView(room.game, matches[index]!);
        expect(entry.offsetMs).toBe(offset);
        // Same timeline code the client plays, plus the automatic 1.5s hold between matches.
        expect(entry.durationMs).toBe(cinematicTimeline(view).at(-1)!.at + MATCH_HOLD_MS);
        expect(entry.durationMs).toBe(presentationDurationMs(view));
        offset += entry.durationMs;
      });
      longest = Math.max(longest, offset);
    }
    expect(schedule.endsAt).toBe(schedule.startsAt + longest);
  });

  it("keeps the schedule while the same set stays visible and clears it once matches are hidden", () => {
    let { room } = untilVisible(started());
    const first = room.presentation!;
    for (let guard = 0; guard < 40; guard++) {
      const next = forceBarrier(room, barrierDeadline(room)!);
      if (!next) break;
      room = next;
      if (!matchesVisible(room)) { expect(room.presentation).toBeUndefined(); return; }
      if (room.presentation!.key === first.key) expect(room.presentation).toEqual(first);
      else { expect(room.presentation!.startsAt).toBeGreaterThan(first.startsAt); return; }
    }
    throw new Error("the visible set never changed");
  });

  it("never lets the barrier clock run during the shared cinematic", () => {
    const { room } = untilVisible(started());
    const deadline = barrierDeadline(room)!;
    expect(deadline).toBe(Math.max(room.barrierSince!, room.presentation!.endsAt) + barrierTimeoutMs(room.game.phase));
    expect(forceBarrier(room, room.presentation!.endsAt)).toBeNull();
  });

  it("sends each seat only its own playback entries plus the server time", () => {
    const { room } = untilVisible(started());
    const view = createPlayerView(room, "p1", [], 123_456);
    expect(view.serverNow).toBe(123_456);
    expect(view.presentation).toEqual({ version: room.presentation!.version, startsAt: room.presentation!.startsAt,
      endsAt: room.presentation!.endsAt, matches: room.presentation!.perPlayer.p1 });
    expect(view.presentation!.matches.every((entry) => view.matches.some((match) => match.id === entry.matchId))).toBe(true);
    expect(JSON.stringify(view)).not.toContain("perPlayer");
  });

  it("does not schedule anything outside visible showdown phases", () => {
    const room = started();
    expect(room.game.phase).toBe("SHOP");
    expect(room.presentation).toBeUndefined();
    expect(createPlayerView(room, "p1").presentation).toBeUndefined();
  });
});
