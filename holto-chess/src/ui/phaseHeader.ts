import type { Phase } from "../game/types";

/**
 * Phases whose round header is centred like the shop and draft screens. Every in-round screen uses the
 * centred title; only the round/final results keep their own header.
 */
export const CENTERED_HEADER_PHASES: readonly string[] = [
  "DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT", "FINAL_AUCTION", "FINAL_LOADOUT", "OPPONENT_SELECT", "SURVIVAL_READY", "GROUP_ASSIGNMENT",
] satisfies readonly Phase[];
