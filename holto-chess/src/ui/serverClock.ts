/**
 * Estimates the server clock from `serverNow` stamps on incoming views. Transit delay only ever
 * makes a sample (serverNow − local receive time) read low, so the largest recent sample is the
 * one with the least delay and the best estimate. A short window absorbs local clock changes.
 */
export type ServerClock = { observe: (serverNow: number, localNow?: number) => void; offset: () => number; now: () => number };

export function createServerClock(windowSize = 10): ServerClock {
  const samples: number[] = [];
  const offset = () => samples.length ? Math.max(...samples) : 0;
  return {
    observe(serverNow, localNow = Date.now()) {
      if (!Number.isFinite(serverNow)) return;
      samples.push(serverNow - localNow);
      if (samples.length > windowSize) samples.shift();
    },
    offset,
    now: () => Date.now() + offset(),
  };
}
