/** RTT midpoint estimate. Half the network RTT is uncertainty, not a simultaneity promise. */
export type ClockQuality = { rttMs: number; uncertaintyMs: number; ageMs: number; degraded: boolean };
export type ServerClock = {
  observe: (serverNow: number, localNow?: number) => void; offset: () => number; now: () => number;
  roundTrip?: (sent: number, received: number, serverReceived: number, serverSent: number) => void;
  reset?: () => void; quality?: () => ClockQuality;
};
export const CLOCK_UNCERTAINTY_BUDGET_MS = 150;
export const CLOCK_STALE_MS = 30_000;
export function createServerClock(windowSize = 10): ServerClock {
  const fallback: number[] = [];
  const trips: { offset: number; rtt: number; at: number }[] = [];
  const best = () => trips.filter(sample => Date.now() - sample.at < CLOCK_STALE_MS).sort((a, b) => a.rtt - b.rtt)[0];
  const offset = () => best()?.offset ?? (fallback.length ? Math.max(...fallback) : 0);
  return {
    observe(serverNow, localNow = Date.now()) {
      if (!Number.isFinite(serverNow)) return;
      fallback.push(serverNow - localNow);
      if (fallback.length > windowSize) fallback.shift();
    },
    roundTrip(sent, received, serverReceived, serverSent) {
      if (![sent, received, serverReceived, serverSent].every(Number.isFinite) || received < sent || serverSent < serverReceived) return;
      const rtt = received - sent - (serverSent - serverReceived);
      if (rtt < 0 || rtt > 10_000) return;
      trips.push({ offset: ((serverReceived - sent) + (serverSent - received)) / 2, rtt, at: received });
      if (trips.length > windowSize) trips.shift();
    },
    reset() { fallback.length = 0; trips.length = 0; },
    quality() {
      const sample = best();
      return { rttMs: sample?.rtt ?? Infinity, uncertaintyMs: sample ? sample.rtt / 2 : Infinity,
        ageMs: sample ? Date.now() - sample.at : Infinity, degraded: !sample || sample.rtt / 2 > CLOCK_UNCERTAINTY_BUDGET_MS };
    },
    offset, now: () => Date.now() + offset(),
  };
}
