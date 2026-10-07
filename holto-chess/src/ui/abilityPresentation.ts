import type { AbilityId } from "./abilityCatalog";
import type { AbilityCue } from "../game/abilities";
import type { MatchView } from "../shared/protocol";
import { cinematicTimeline, isFinalMatch } from "../shared/presentationTimeline";

export const abilityUx = {
  "royal-blood": { mode: "PASSIVE", metric: "saved" }, "first-class": { mode: "PASSIVE", metric: "order" },
  "golden-hand": { mode: "PASSIVE", metric: "sale" }, trader: { mode: "PASSIVE", metric: "saved" },
  "target-sniper": { mode: "TRIGGERED", metric: "bb" }, architect: { mode: "TRIGGERED", metric: "bb" },
  predator: { mode: "TRIGGERED", metric: "bb" }, capitalism: { mode: "TRIGGERED", metric: "bb" },
  "zero-risk": { mode: "TRIGGERED", metric: "bb" }, underdog: { mode: "TRIGGERED", metric: "points" },
  "quad-core": { mode: "TRIGGERED", metric: "points" }, "front-runner": { mode: "TRIGGERED", metric: "points" },
} as const satisfies Record<AbilityId, { mode: "PASSIVE" | "TRIGGERED"; metric: string }>;

export const ABILITY_CUE_MS = 1200;
export function abilityCueStart(match: MatchView, cue: AbilityCue): number | undefined {
  const frames = match.disclosure?.frames ?? cinematicTimeline(match);
  return frames.find(frame => isFinalMatch(match) ? frame.phase === "FINAL_WINNER" :
    frame.boardIndex === (cue.run ? cue.run - 1 : 0) && ["RUN_RESULT", "RESULT"].includes(frame.phase))?.at;
}
export function activeAbilityCues(match: MatchView, elapsed: number) {
  return (match.abilityCues ?? []).flatMap(cue => {
    const at = abilityCueStart(match, cue);
    return at !== undefined && elapsed >= at && elapsed < at + ABILITY_CUE_MS ? [{ cue, age: elapsed - at }] : [];
  });
}
export function cueAmount(cue: AbilityCue): string {
  return [cue.bb ? `+${cue.bb}BB` : "", cue.points ? `+${cue.points}P` : ""].filter(Boolean).join(" · ");
}
