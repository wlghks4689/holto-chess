import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShopCountdown } from "./ShopCountdown";
import { countdownUrgency, formatCountdown, secondsUntil } from "./countdown";

describe("shop countdown", () => {
  it("counts whole seconds up to the deadline and reaches 0 exactly at it", () => {
    expect(secondsUntil(60_000, 0)).toBe(60);
    expect(secondsUntil(60_000, 59_001)).toBe(1);
    expect(secondsUntil(60_000, 60_000)).toBe(0);
    expect(secondsUntil(60_000, 75_000)).toBe(0);
    expect([60, 42, 9, 0].map(formatCountdown)).toEqual(["1:00", "0:42", "0:09", "0:00"]);
  });

  it("warns at 10 seconds and turns critical at 5", () => {
    expect([11, 10, 6, 5, 0].map(countdownUrgency)).toEqual(["normal", "warning", "warning", "critical", "critical"]);
  });

  it("explains the auto-commit only while the player can still act", () => {
    const open = renderToStaticMarkup(createElement(ShopCountdown, { endsAt: 60_000, totalMs: 60_000, now: 18_000, committed: false }));
    expect(open).toContain("상점 종료까지");
    expect(open).toContain("0:42");
    expect(open).toContain("AI가 자동 확정");
    expect(open).toContain("--countdown-ratio:0.7");
    const done = renderToStaticMarkup(createElement(ShopCountdown, { endsAt: 60_000, totalMs: 60_000, now: 55_500, committed: true }));
    expect(done).toContain("다른 플레이어 상점 종료까지");
    expect(done).toContain("is-critical");
    expect(done).not.toContain("AI가 자동 확정");
  });
});
