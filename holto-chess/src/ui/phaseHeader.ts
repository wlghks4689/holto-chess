import type { Phase } from "../game/types";

/**
 * Phases whose round header is centred like the shop and draft screens. Every in-round screen and the
 * final standings use the centred title; only the round results keep their own header.
 */
export const CENTERED_HEADER_PHASES: readonly string[] = [
  "DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT", "R2_BRIEFING", "FINAL_AUCTION", "FINAL_LOADOUT", "OPPONENT_SELECT", "SURVIVAL_READY", "GROUP_ASSIGNMENT", "GAME_RESULT",
] satisfies readonly Phase[];
