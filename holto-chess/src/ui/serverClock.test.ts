import { describe, expect, it } from "vitest";
import { createServerClock } from "./serverClock";

describe("server clock estimate", () => {
  it("keeps the least-delayed sample, so skew is recovered within the fastest transit time", () => {
    const skew = 5_000; // this device runs 5s behind the server
    const clock = createServerClock();
    for (const [sentAt, delay] of [[1_000, 180], [2_000, 40], [3_000, 95]] as const) {
      clock.observe(sentAt, sentAt - skew + delay);
    }
    expect(clock.offset()).toBe(skew - 40);
  });

  it("follows a changed local clock once old samples leave the window", () => {
    const clock = createServerClock(3);
    for (let i = 0; i < 3; i++) clock.observe(10_000 + i, 10_000 + i); // in sync
    for (let i = 0; i < 3; i++) clock.observe(20_000 + i, 20_000 + i + 60_000); // device jumped a minute ahead
    expect(clock.offset()).toBe(-60_000);
  });

  it("ignores malformed stamps", () => {
    const clock = createServerClock();
    clock.observe(Number.NaN);
    expect(clock.offset()).toBe(0);
  });
});
