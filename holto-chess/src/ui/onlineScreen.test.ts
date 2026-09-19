import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addSession, applyRoomAction, createRoom, turnKey } from "../game/room";
import { createPlayerView } from "../game/playerView";
import { onlineScreen } from "./onlineScreen";
import { MultiplayerLobby, RoomWaitingRoom } from "./OnlineLobby";

const credential = { roomId: "ABCDEF", playerId: "p1", token: "test" };
const noop = () => {};
const waiting = (view: ReturnType<typeof createPlayerView>) => renderToStaticMarkup(createElement(RoomWaitingRoom, {
  view, status: "접속됨", connected: true, pending: false, error: "", onReady: noop, onLeave: noop, onRetry: noop, onReturn: noop,
}));

describe("online screen separation", () => {
  it("opens the lobby without a selected session and waits for a matching view", () => {
    const room = addSession(createRoom("ABCDEF", 303), "one").room;
    const view = createPlayerView(room, "p1");
    expect(onlineScreen(null, view)).toBe("lobby");
    expect(onlineScreen(credential, null)).toBe("connecting");
    expect(onlineScreen({ ...credential, roomId: "ZYXWVU" }, view)).toBe("connecting");
    expect(onlineScreen(credential, view)).toBe("waiting");
  });
  it("renders only real participants, without the preallocated game HUD", () => {
    const room = addSession(createRoom("ABCDEF", 303), "one").room;
    const html = waiting(createPlayerView(room, "p1"));
    expect(html).toContain("1 / 8");
    expect(html).toContain("ABCDEF");
    expect(html.match(/<li>/g)).toHaveLength(1);
    for (const hidden of ["TWO HAND", "ROUND 01", "50BB", "player-strip", "카드 마켓"]) expect(html).not.toContain(hidden);
  });
  it("enters the game only after the server starts it, with eight seats and 50BB", () => {
    let room = addSession(createRoom("ABCDEF", 303), "one").room;
    room = addSession(room, "two").room;
    room = applyRoomAction(room, "p1", { type: "READY" }, turnKey(room));
    expect(onlineScreen(credential, createPlayerView(room, "p1"))).toBe("waiting");
    expect(waiting(createPlayerView(room, "p1"))).toContain("✓ 준비 완료");
    room = applyRoomAction(room, "p2", { type: "READY" }, turnKey(room));
    const view = createPlayerView(room, "p1");
    expect(onlineScreen(credential, view)).toBe("game");
    expect(view.round).toBe(1);
    expect(view.players).toHaveLength(8);
    expect(view.me.stackBB).toBe(50);
  });
  it("excludes departed seats from the waiting list and detects an old departed session", () => {
    let room = addSession(createRoom("ABCDEF", 303), "one").room;
    room = addSession(room, "two").room;
    room = applyRoomAction(room, "p2", { type: "LEAVE_ROOM" }, turnKey(room));
    expect(waiting(createPlayerView(room, "p1"))).toContain("1 / 8");
    expect(onlineScreen({ ...credential, playerId: "p2" }, createPlayerView(room, "p2"))).toBe("departed");
  });
  it("shows recent rooms as optional actions, not an automatically active game", () => {
    const html = renderToStaticMarkup(createElement(MultiplayerLobby, { nickname: "테스터", onNickname: noop, roomCode: "", onRoomCode: noop, busy: false, error: "", sessions: [credential], onJoin: noop, onResume: noop, onHome: noop }));
    expect(html).toContain("멀티플레이 로비");
    expect(html).toContain("다시 참가");
    expect(html).toContain("홈으로");
    expect(html).not.toContain("READY");
    expect(html).not.toContain("TWO HAND");
  });
});
