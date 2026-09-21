import { describe, expect, it } from "vitest";
import { createGame, prepareShowdown, resolvePrimary } from "../game/engine";
import { playerEventFeed } from "./playerEventFeed";

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
});
