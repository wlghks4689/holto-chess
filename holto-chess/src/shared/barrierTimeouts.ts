/**
 * How long a barrier waits before bots play the outstanding seats. The shop is
 * the only phase that asks for real decisions, so it gets the longer clock.
 * Lives in shared so the client can size countdowns without bundling the engine.
 */
export const BARRIER_TIMEOUT_MS = { SHOP: 60_000, DEFAULT: 30_000, RESULTS: 30_000 } as const;
export function barrierTimeoutMs(phase: string): number {
  if (["ROUND_RESULT", "GROUP_ASSIGNMENT"].includes(phase)) return BARRIER_TIMEOUT_MS.RESULTS;
  return phase === "SHOP" ? BARRIER_TIMEOUT_MS.SHOP : BARRIER_TIMEOUT_MS.DEFAULT;
}
