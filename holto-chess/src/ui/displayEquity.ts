import type { Card } from "../core/poker/cards";
import type { Round } from "../game/types";
import type { MatchView } from "../shared/protocol";

/** Only public cards needed for the current display, never a match result or future street. */
export type EquityJob =
  | { kind: "headsUp"; round: Round; hands: readonly (readonly Card[])[]; dead?: readonly Card[] }
  | { kind: "threeWay"; hands: readonly (readonly Card[])[] }
  | { kind: "final"; hands: readonly (readonly Card[])[]; dead: readonly Card[] }
  | { kind: "street"; hands: readonly (readonly Card[])[]; board: readonly Card[]; omaha: boolean; dead: readonly Card[] };
export type EquityValues = (number[] | null)[];

/**
 * Cards no board can contain: every hole card of every seat in every RUN (the real boards are drawn without them), the
 * shown hands and burn cards. A RUN still concealed from this viewer and absent from `deadCards` cannot be excluded, so the
 * caller must not show odds then; `deadCardsKnown` says whether it can.
 */
function deadCardsOf(match: MatchView): { dead: Card[]; known: boolean } {
  const runCards = Object.values(match.runCards ?? {}).flat(2);
  const all = [...Object.values(match.revealedCards).flat(), ...Object.values(match.blockCards ?? {}).flat(), ...runCards, ...(match.deadCards ?? [])];
  const dead = [...new Map(all.filter(c => !c.hidden).map(c => [c.id, c])).values()];
  return { dead, known: !!match.deadCards || !runCards.some(c => c.hidden) };
}

export function streetEquityJob(match: MatchView, run: number, count: number): EquityJob[] {
  if (!match.boards.length) return [];
  const hands = match.participantIds.map(id => match.runCards?.[id]?.[run] ?? match.revealedCards[id] ?? []);
  if (hands.some(h => !h.length || h.some(c => c.hidden))) return [];
  const { dead, known } = deadCardsOf(match);
  if (!known) return [];
  if (count) return [{ kind: "street", hands, board: (match.boards[run] ?? []).slice(0, count), omaha: match.round === 3, dead }];
  if (match.final && match.round === 6) return [{ kind: "final", hands, dead }];
  if (hands.length === 3 && match.round === 4) return [{ kind: "threeWay", hands }];
  return hands.length === 2 ? [{ kind: "headsUp", round: match.runCards ? 2 : match.round, hands, dead: match.runCards ? dead : [] }] : [];
}
