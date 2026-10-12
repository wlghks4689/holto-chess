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

export function streetEquityJob(match: MatchView, run: number, count: number): EquityJob[] {
  if (!match.boards.length) return [];
  const hands = match.participantIds.map(id => match.runCards?.[id]?.[run] ?? match.revealedCards[id] ?? []);
  if (hands.some(h => !h.length || h.some(c => c.hidden))) return [];
  const dead = [...Object.values(match.revealedCards).flat(), ...Object.values(match.blockCards ?? {}).flat()].filter(c => !c.hidden);
  if (count) return [{ kind: "street", hands, board: (match.boards[run] ?? []).slice(0, count), omaha: match.round === 3, dead }];
  if (match.final && match.round === 6) return [{ kind: "final", hands, dead }];
  if (hands.length === 3 && match.round === 4) return [{ kind: "threeWay", hands }];
  return hands.length === 2 ? [{ kind: "headsUp", round: match.runCards ? 2 : match.round, hands, dead: match.runCards ? dead : [] }] : [];
}
