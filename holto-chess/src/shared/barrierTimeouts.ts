/**
 * How long each synchronized phase waits before the server advances it. The
 * values cover player decisions, shared presentation beats, and result review.
 * Lives in shared so the client can size countdowns without bundling the engine.
 */
export const BARRIER_TIMEOUT_MS = {
  SHOP: 60_000,
  DEFAULT: 30_000,
  RESULTS: 30_000,
  DRAFT_DEAL_IN: 3_000,
  MATCH_SETUP: 3_000,
  GROUP_REVIEW: 10_000,
  RUN_LOADOUT: 30_000,
  BOT_DRAFT_PICK: 1_800,
} as const;
export function barrierTimeoutMs(phase: string): number {
  if (phase === "OPEN_DRAFT") return 20_000;
  if (phase === "DRAFT_ORDER") return BARRIER_TIMEOUT_MS.DRAFT_DEAL_IN;
  if (phase === "RUN_LOADOUT") return BARRIER_TIMEOUT_MS.RUN_LOADOUT;
  if (["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(phase)) return BARRIER_TIMEOUT_MS.MATCH_SETUP;
  if (phase === "GROUP_ASSIGNMENT") return BARRIER_TIMEOUT_MS.GROUP_REVIEW;
  if (phase === "ROUND_RESULT") return BARRIER_TIMEOUT_MS.RESULTS;
  return phase === "SHOP" ? BARRIER_TIMEOUT_MS.SHOP : BARRIER_TIMEOUT_MS.DEFAULT;
}
