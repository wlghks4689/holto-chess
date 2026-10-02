import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom } from "../game/room";
import { createPlayerView } from "../game/playerView";
import { koKR } from "../i18n/locales/ko-KR";
import { StartScreen } from "./StartScreen";
import { FeedbackDialog } from "./FeedbackDialog";
import { RoomWaitingRoom } from "./OnlineLobby";

const noop = () => {};
afterEach(() => vi.unstubAllGlobals());
describe.each(["web", "crazygames"] as const)("%s UI", (platform) => {
  function setup() { vi.stubGlobal("window", { porenaPlatform: platform }); }
  it("keeps tutorial, guide and multiplayer reachable", () => {
    setup();
    const html = renderToStaticMarkup(createElement(StartScreen, { onStart: noop }));
    expect(html).toContain(koKR["home.tutorial"]);
    expect(html).toContain(koKR["home.guide"]);
    if (platform === "crazygames") {
      expect(html).toContain("빠른 플레이");
      expect(html).toContain(koKR["home.multi"]);
    } else {
      expect(html).not.toContain("빠른 플레이");
      expect(html).not.toContain("start-screen-crazygames");
    }
  });
  it("shows the message field and limits reply-address UI to ordinary mode", () => {
    setup();
    const html = renderToStaticMarkup(createElement(FeedbackDialog, { onClose: noop }));
    expect(html).toContain("textarea");
    expect(html.includes('type="email"')).toBe(platform === "web");
    expect(html.includes("email-help")).toBe(platform === "web");
    expect(html).not.toContain('type="checkbox"');
  });
  it("keeps room codes while limiting direct invite links to ordinary mode", () => {
    setup();
    const room = createRoom("ABC234", 42);
    room.sessions = [{ playerId: "p1", tokenHash: "test", requests: [] }];
    const view = createPlayerView(room, "p1");
    const html = renderToStaticMarkup(createElement(RoomWaitingRoom, { view, status: "Connected", connected: true, pending: false, error: "", onReady: noop, onLeave: noop, onRetry: noop, onReturn: noop }));
    expect(html).toContain("ABC234");
    expect(html).toContain("코드 복사");
    expect(html.includes('class="invite-link"')).toBe(platform === "web");
    expect(html.includes("https://porena.kr/?room=ABC234")).toBe(platform === "web");
  });
});
