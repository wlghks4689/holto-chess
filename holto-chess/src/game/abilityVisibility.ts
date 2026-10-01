import { isRoundAbilityEvent, type AbilityBenefitView, type AbilityCue, type AbilityEvent } from "./abilities";
import type { MatchView } from "../shared/protocol";

export function abilityBenefit(events: readonly AbilityEvent[], playerId: string): AbilityBenefitView {
  const own = events.filter(event => event.playerId === playerId);
  return {
    activations: own.length, bb: own.reduce((n, e) => n + e.bb, 0),
    points: own.reduce((n, e) => n + e.points, 0), savedBB: own.reduce((n, e) => n + e.savedBB, 0),
    draftPositions: own.flatMap(e => e.originalPosition === undefined ? [] : [{ round: e.round, originalPosition: e.originalPosition }]),
  };
}

export function abilityCue(event: AbilityEvent): AbilityCue | undefined {
  // Old persisted events have no durable identity: include their totals, never replay them.
  return event.sequence === undefined ? undefined : { id: String(event.sequence), playerId: event.playerId, abilityId: event.abilityId,
    ...(event.run ? { run: event.run } : {}), bb: event.bb, points: event.points };
}

export function personalAbilityCues(cues: readonly AbilityCue[], identityId: string): AbilityCue[] {
  return cues.map(cue => cue.playerId === identityId ? { ...cue } : {
    id: cue.id, playerId: cue.playerId, abilityId: cue.abilityId, ...(cue.run ? { run: cue.run } : {}),
  });
}

export function visibleAbilityEvents(events: readonly AbilityEvent[], round: number, complete: boolean, currentMatchIds: Set<string>, matches: readonly MatchView[]): AbilityEvent[] {
  const visible = new Set(matches.flatMap(match => match.abilityCues ?? []).map(cue => cue.id));
  return events.filter(event => event.round < round || complete || (!event.matchId && !isRoundAbilityEvent(event)) ||
    (!isRoundAbilityEvent(event) && !!event.matchId && (!currentMatchIds.has(event.matchId) || visible.has(String(event.sequence)))));
}
