import { describe, expect, it } from "vitest";
import { BALANCE } from "../game/config";
import { createGame } from "../game/engine";
import { advanceLocalNextRound } from "./localRoundTransition";

describe("local NEXT_ROUND presentation shortcut", () => {
  it("keeps the engine phase but advances setup exactly once without an interstitial", () => {
    const source = createGame(501);
    source.phase = "NEXT_ROUND";
    const startingStacks = source.players.map((player) => player.stackBB);

    const advanced = advanceLocalNextRound(source);

    expect(source.phase).toBe("NEXT_ROUND");
    expect(advanced.round).toBe(2);
    expect(advanced.phase).toBe("DRAFT_ORDER");
    expect(advanced.draft?.picks).toEqual([]);
    expect(advanced.players.map((player, index) => player.stackBB - startingStacks[index]!)).toEqual(Array(8).fill(BALANCE.roundIncomeBB));
    expect(advanceLocalNextRound(advanced)).toBe(advanced);
  });

  it.each(["ROUND_RESULT", "SURVIVAL_READY"] as const)("does not skip the meaningful %s phase", (phase) => {
    const state = { ...createGame(502), phase };
    expect(advanceLocalNextRound(state)).toBe(state);
  });
});
