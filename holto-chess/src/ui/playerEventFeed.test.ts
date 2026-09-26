import { describe, expect, it } from "vitest";
import { createGame, prepareShowdown, resolvePrimary } from "../game/engine";
import { playerEventFeed, renderPlayerFeedEntry } from "./playerEventFeed";
import { setLocale, t } from "../i18n";

describe("player event feed", () => {
  it("keeps a compact player-specific action and round record", () => {
    const state = createGame(42);
    state.logs.push({ id: 99, tone: "info", message: "R1 쇼다운 준비 완료" });
    const result = resolvePrimary(prepareShowdown(state, []));
    const entries = playerEventFeed(result, "p1");
    expect(entries.some((entry) => /^R1 · \d+승 \d+무 \d+패 · \+\d+P 마감$/.test(entry.message))).toBe(true);
    expect(entries.some((entry) => entry.message.includes("쇼다운 준비 완료"))).toBe(false);
    expect(entries.every((entry) => entry.message.startsWith("R1 ·") || entry.message.startsWith("나 ·") || entry.message.startsWith("나 탈락") || entry.message.includes("최종 점수 집계 완료"))).toBe(true);
  });

  it("renders structured and old snapshot entries without changing gameplay state", () => {
    const state = createGame(42);
    state.logs.unshift({ id: 100, tone: "economy", message: "나 · As 구매 −20BB", event: "CARD_PURCHASED", playerId: "p1", params: { player: "나", card: "As", amount: 20 } });
    state.logs.unshift({ id: 101, tone: "info", message: "나 · 이전 기록" });
    const before = structuredClone(state);
    const feed = playerEventFeed(state, "p1");
    setLocale("en-US");
    expect(feed.map((entry) => renderPlayerFeedEntry(entry, t))).toContain("나 · bought As · −20BB");
    expect(feed.map((entry) => renderPlayerFeedEntry(entry, t))).toContain("나 · 이전 기록");
    setLocale("ko-KR");
    expect(feed.map((entry) => renderPlayerFeedEntry(entry, t))).toContain("나 · As 구매 −20BB");
    expect(state).toEqual(before);
  });
});
