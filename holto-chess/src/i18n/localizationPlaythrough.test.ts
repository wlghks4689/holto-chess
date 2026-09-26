import { describe, expect, it } from "vitest";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "../game/room";
import { createPlayerView } from "../game/playerView";
import { playerEventFeed, renderPlayerFeedEntry } from "../ui/playerEventFeed";
import { setLocale, t } from "./index";

function seededRoom(): RoomSnapshot {
  let room = createRoom("LQA123", 20260925);
  room = addSession(room, "localization-qa-a").room;
  room = addSession(room, "localization-qa-b").room;
  for (const session of room.sessions) room = applyRoomAction(room, session.playerId, { type: "READY" }, turnKey(room), 1_000_000);
  return room;
}

describe("locale-neutral full tournament", () => {
  it("plays R1–R5 with identical cards, points, pairings, eliminations, and final scores in both locales", () => {
    const initial = seededRoom();
    let korean = structuredClone(initial);
    let english = structuredClone(initial);
    const rounds = new Set<number>();
    for (let step = 0; step < 130 && korean.game.phase !== "GAME_RESULT"; step++) {
      expect(english.game).toEqual(korean.game);
      rounds.add(korean.game.round);
      const koDeadline = barrierDeadline(korean)!;
      const enDeadline = barrierDeadline(english)!;
      expect(enDeadline).toBe(koDeadline);
      setLocale("ko-KR");
      for (const session of korean.sessions) {
        createPlayerView(korean, session.playerId, [], koDeadline);
        playerEventFeed(korean.game, session.playerId).map((entry) => renderPlayerFeedEntry(entry, t));
      }
      korean = forceBarrier(korean, koDeadline)!;
      setLocale("en-US");
      for (const session of english.sessions) {
        createPlayerView(english, session.playerId, [], enDeadline);
        playerEventFeed(english.game, session.playerId).map((entry) => renderPlayerFeedEntry(entry, t));
      }
      english = forceBarrier(english, enDeadline)!;
    }
    expect([...rounds]).toEqual([1, 2, 3, 4, 5]);
    expect(korean.game.phase).toBe("GAME_RESULT");
    expect(english.game).toEqual(korean.game);
    expect(createPlayerView(english, english.sessions[0]!.playerId).standings).toEqual(createPlayerView(korean, korean.sessions[0]!.playerId).standings);
    setLocale("ko-KR");
  }, 60_000);

  it("accepts a persisted legacy message-only log after room serialization", () => {
    const room = seededRoom();
    room.game.logs.unshift({ id: 999, tone: "economy", message: `${room.game.players[0]!.name} · 이전 구매 기록` });
    const restored = JSON.parse(JSON.stringify(room)) as RoomSnapshot;
    expect(createPlayerView(restored, restored.sessions[0]!.playerId)).toBeDefined();
    const feed = playerEventFeed(restored.game, restored.sessions[0]!.playerId);
    setLocale("en-US");
    expect(feed.map((entry) => renderPlayerFeedEntry(entry, t))).toContain(room.game.logs[0]!.message);
    setLocale("ko-KR");
  });
});
