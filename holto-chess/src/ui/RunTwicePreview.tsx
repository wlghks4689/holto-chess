import { useState } from "react";
import { makeDeck } from "../core/poker/cards";
import { evaluatePartial, findBestFive } from "../core/poker/evaluate";
import type { MatchView } from "../shared/protocol";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { ShowdownCinematic } from "./ShowdownCinematic";

const deck = makeDeck();
const cards = (ids: string[]) => ids.map(id => deck.find(card => card.id === id)!);
const profiles = [{ playerId: "p1", name: "나" }, { playerId: "p2", name: "스페이드 울프" }];
const runCards = { p1: [cards(["Th", "8s"]), cards(["Th", "3h"])], p2: [cards(["Kh", "Ts"]), cards(["Kh", "3c"])] };
const boards = [cards(["Kc", "8d", "7d", "4c", "2s"]), cards(["Tc", "5c", "2h", "Qh", "Jh"])];
const boardWinnerIds = [["p2"], ["p1"]];
const streetSnapshots = boards.map((board, run) => (["PRE_FLOP", "FLOP", "TURN", "RIVER"] as const).map((street, i) => ({
  street, results: profiles.map(({ playerId }) => {
    const visible = [...runCards[playerId as keyof typeof runCards][run]!, ...board.slice(0, [0, 3, 4, 5][i])];
    const hand = visible.length < 5 ? evaluatePartial(visible) : findBestFive(visible);
    return { ...hand, playerId, place: boardWinnerIds[run]!.includes(playerId) ? 1 : 2, usedCardIds: hand.bestFive.map(card => card.id) };
  }),
})));
const boardResults = streetSnapshots.map(streets => streets[3]!.results);
const match: MatchView = {
  id: "run-twice-preview", round: 2, matchNumber: 1, stage: "primary", participantIds: ["p1", "p2"],
  winnerIds: ["p1"], boards, boardResults, boardWinnerIds, results: boardResults[1]!, streetSnapshots,
  runCards, revealedCards: { p1: cards(["Th", "8s", "3h"]), p2: cards(["Kh", "Ts", "3c"]) },
  runoutCount: 2, suddenDeathCount: 0, rewards: [],
};
const choices = [
  [0, "FLOP_HAND", "RUN 1 진행"], [0, "RUN_RESULT", "RUN 1 결과"],
  [1, "FLOP_HAND", "RUN 2 진행"], [1, "COMPLETE", "두 RUN 최종 결과"],
] as const;

export function RunTwicePreview() {
  const [selected, setSelected] = useState(3);
  const [run, phase] = choices[selected]!;
  const elapsed = cinematicTimeline(match).find(frame => frame.boardIndex === run && frame.phase === phase)!.at;
  return <main style={{ background: "#030b12", color: "#e8f4f1", minHeight: "100dvh" }}>
    <nav aria-label="RUN 배치 미리보기" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", minHeight: 40, gap: 6, padding: 5 }}>
      {choices.map(([, , label], index) => <button key={label} style={{ minHeight: 28, padding: "5px 7px", fontSize: 10 }} className={index === selected ? "primary" : "secondary"} onClick={() => setSelected(index)}>{label}</button>)}
    </nav>
    <ShowdownCinematic match={match} profiles={profiles} viewerId="p1" onComplete={() => {}} elapsedMs={elapsed} />
  </main>;
}
