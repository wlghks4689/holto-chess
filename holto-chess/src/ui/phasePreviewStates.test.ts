import { describe, expect, it } from "vitest";
import { phasePreviewStates } from "./phasePreviewStates";

describe("phase preview states", () => {
  for (const sixRounds of [true, false]) it(`captures legal complete ${sixRounds ? 6 : 5}-round games`, () => {
    const states = phasePreviewStates(sixRounds);
    expect(new Set(states.map(s => s.round)).size).toBe(sixRounds ? 6 : 5);
    expect(states[0]!.phase).toBe("ABILITY_DEAL");
    expect(states.at(-1)!.phase).toBe("GAME_RESULT");
    for (const phase of ["ABILITY_REVEAL", "SHOP", "DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT", "FINAL_AUCTION", "ROUND_RESULT", "NEXT_ROUND", "SHOWDOWN_PRIMARY"]) {
      expect(states.some(s => s.phase === phase), phase).toBe(true);
    }
    if (sixRounds) {
      expect(states.some(s => s.phase === "OPPONENT_SELECT")).toBe(true);
      expect(states.some(s => s.round === 3 && s.phase === "OPEN_DRAFT")).toBe(true);
      expect(states.some(s => s.round === 6 && s.phase === "RUN_LOADOUT")).toBe(true);
    }
    else for (const phase of ["FINAL_LOADOUT", "DECK_SELECT", "SURVIVAL_READY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY"]) expect(states.some(s => s.phase === phase), phase).toBe(true);
    expect(states.filter(s => s.phase === "FINAL_AUCTION").every(s => !!s.finalAuction)).toBe(true);
    expect(states.every(s => s.players[0]!.id === "p1" && !s.players[0]!.eliminated)).toBe(true);
  });
});
