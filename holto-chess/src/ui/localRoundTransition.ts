import { startNextRound } from "../game/engine";
import { lastRoundFor } from "../game/config";
import type { PorenaGameState } from "../game/types";

/** Local-only presentation shortcut. The engine phase remains intact and continues to own round setup. */
export function advanceLocalNextRound(state: PorenaGameState): PorenaGameState {
  return state.phase === "NEXT_ROUND" && state.round < lastRoundFor(state) ? startNextRound(state) : state;
}
