import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClock } from "./serverClock";

describe("server clock estimate", () => {
  afterEach(() => vi.useRealTimers());
  it("estimates skew from RTT while reporting asymmetric delay as uncertainty", () => {
    vi.useFakeTimers(); vi.setSystemTime(10_650);
    const clock = createServerClock();
    clock.roundTrip!(10_000, 10_650, 15_000, 15_000);
    expect(clock.offset()).toBe(4675);
    expect(clock.quality!()).toMatchObject({ rttMs: 650, uncertaintyMs: 325, degraded: true });
    clock.roundTrip!(10_650, 10_690, 15_670, 15_670);
    expect(clock.offset()).toBe(5000);
    expect(clock.quality!()).toMatchObject({ uncertaintyMs: 20, degraded: false });
    clock.reset!();
    expect(clock.quality!().degraded).toBe(true);
  });
  it("subtracts server processing time and expires stale estimates", () => {
    vi.useFakeTimers(); vi.setSystemTime(2000);
    const clock = createServerClock();
    clock.roundTrip!(1000, 2000, 6000, 6900);
    expect(clock.quality!().rttMs).toBe(100);
    vi.setSystemTime(40_000);
    expect(clock.quality!().degraded).toBe(true);
  });
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
