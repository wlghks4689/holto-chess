import { expect, it } from "vitest";
import { autoStep } from "../tutorial/practiceState";
import { ABILITY_IDS, TARGET_SNIPER_WIN_BB } from "./abilities";
import { autoPickAbility, createAbilityGame, finishAbilitySelection, openAbilitySelection } from "./engine";
import type { PorenaGameState } from "./types";

/** Plays a bot game with Target Sniper on p2 until the R4 group stage has resolved. */
function throughR4Groups(seed: number): PorenaGameState {
  let g = openAbilitySelection(createAbilityGame(seed));
  while (g.phase === "ABILITY_PICK") g = autoPickAbility(g);
  const rest = ABILITY_IDS.filter((id) => id !== "target-sniper");
  g.players.forEach((p, i) => { p.abilityId = i === 1 ? "target-sniper" : rest[i]!; });
  let s = finishAbilitySelection(g);
  for (let k = 0; k < 400 && !(s.round === 4 && s.phase === "ROUND_RESULT") && s.phase !== "GAME_RESULT"; k++) s = autoStep(s);
  return s;
}

it("pays Target Sniper for an outright R4 group win with the first card in the BEST 5", () => {
  let checked = 0;
  for (let seed = 1; seed <= 40 && checked < 2; seed++) {
    const s = throughR4Groups(seed);
    const sniper = s.players[1]!;
    for (const match of s.roundResults.filter((m) => m.stage === "secondary" && m.playerIds.includes(sniper.id))) {
      const result = match.boardResults[0]!.find((r) => r.playerId === sniper.id)!;
      const winners = match.boardWinnerIds[0]!;
      const eligible = winners.length === 1 && winners[0] === sniper.id && result.hand.bestFive.some((c) => c.id === sniper.firstCardId);
      const paid = (s.abilityEvents ?? []).filter((e) => e.matchId === match.id && e.reason === "won-with-first-card");
      expect(paid.map((e) => e.bb)).toEqual(eligible ? [TARGET_SNIPER_WIN_BB] : []);
      if (eligible) { checked++; expect(match.rewards!.find((r) => r.playerId === sniper.id)!.deltaBB).toBeGreaterThanOrEqual(TARGET_SNIPER_WIN_BB); }
    }
  }
  expect(checked).toBeGreaterThan(0);
}, 300_000);
