import { describe, expect, it } from "vitest";
import { INTER_MATCH_HOLD_MS, MATCH_HOLD_MS, MATCH_PREP_MS, PRESENTATION_LEAD_MS, cinematicTimeline, presentationDurationMs } from "../shared/presentationTimeline";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import { matchesVisible, syncPresentation, visibleMatchesFor } from "./presentation";
import { addSession, applyRoomAction, barrierDeadline, barrierTimeoutMs, createRoom as createRoomCurrent, forceBarrier, turnKey, type RoomSnapshot } from "./room";

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
    const sharedStarts = new Map<number, number>();
    for (const { playerId } of room.sessions) {
      const entries = schedule.perPlayer[playerId]!;
      const matches = visibleMatchesFor(room, playerId);
      expect(entries.map((entry) => entry.matchId)).toEqual(matches.map((match) => match.id));
      entries.forEach((entry, index) => {
        const view = createMatchView(room.game, matches[index]!);
        if (sharedStarts.has(index)) expect(entry.offsetMs).toBe(sharedStarts.get(index));
        else sharedStarts.set(index, entry.offsetMs);
        if (index === 0) expect(entry.offsetMs).toBe(0);
        else expect(entry.offsetMs - (entries[index - 1]!.offsetMs + entries[index - 1]!.durationMs)).toBeGreaterThanOrEqual(INTER_MATCH_HOLD_MS);
        // Later Swiss matches show their own matchup before the cinematic starts.
        expect(entry.prepMs ?? 0).toBe(index === 0 ? 0 : MATCH_PREP_MS);
        const last = index === entries.length - 1;
        expect(entry.durationMs).toBe(cinematicTimeline(view).at(-1)!.at + (last ? MATCH_HOLD_MS : 0) + (entry.prepMs ?? 0));
        expect(entry.durationMs).toBe(presentationDurationMs(view) + (entry.prepMs ?? 0) - (last ? 0 : MATCH_HOLD_MS));
      });
      const last = entries.at(-1);
      if (last) longest = Math.max(longest, last.offsetMs + last.durationMs);
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

  it("adds later-match previews in R4 but never in the final round", () => {
    const { room, openedAt } = untilVisible(started());
    const viewerMatch = room.game.roundResults.find((match) => match.playerIds.includes("p1"))!;
    room.game.roundResults.push({ ...viewerMatch, id: `${viewerMatch.id}-again` });
    room.game.round = 4;
    delete room.presentation;
    syncPresentation(room, openedAt + 1);
    const r4Preps = room.presentation!.perPlayer.p1!.map((entry) => entry.prepMs ?? 0);
    expect(r4Preps).toHaveLength(4);
    expect(r4Preps).toEqual([0, MATCH_PREP_MS, MATCH_PREP_MS, MATCH_PREP_MS]);

    room.game.round = 5;
    delete room.presentation;
    syncPresentation(room, openedAt + 2);
    expect(room.presentation!.perPlayer.p1?.map((entry) => entry.prepMs ?? 0)).toEqual([0, 0, 0, 0]);
  });
});

// Regression coverage for persisted games created before the open-draft rules.
function createRoom(...args: Parameters<typeof createRoomCurrent>) { return createRoomCurrent(args[0], args[1], args[2], 1); }
