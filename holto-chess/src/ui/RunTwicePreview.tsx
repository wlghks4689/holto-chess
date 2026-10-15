import { useState } from "react";
import { makeDeck } from "../core/poker/cards";
import { compareHands, evaluatePartial, findBestFive } from "../core/poker/evaluate";
import type { MatchView } from "../shared/protocol";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { ShowdownCinematic } from "./ShowdownCinematic";

const deck = makeDeck();
const cards = (ids: string[]) => ids.map(id => deck.find(card => card.id === id)!);
const profiles = [{ playerId: "p1", name: "나", abilityId: "architect" as const }, { playerId: "p2", name: "스페이드 울프", abilityId: "predator" as const }];
// R2 BEST FIVE: each seat plays the same three cards on both RUN boards.
const hands = { p1: cards(["Th", "8s", "3h"]), p2: cards(["Kh", "Ts", "3c"]) };
const runCards = { p1: [hands.p1, hands.p1], p2: [hands.p2, hands.p2] };
const boards = [cards(["Kc", "8d", "7d", "4c", "2s"]), cards(["Tc", "5c", "2h", "Qh", "Jh"])];
const boardWinnerIds = boards.map((board) => {
  const order = compareHands(findBestFive([...hands.p1, ...board]), findBestFive([...hands.p2, ...board]));
  return order > 0 ? ["p1"] : order < 0 ? ["p2"] : ["p1", "p2"];
});
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
  winnerIds: boardWinnerIds[1]!, boards, boardResults, boardWinnerIds, results: boardResults[1]!, streetSnapshots,
  runCards, revealedCards: hands,
  runoutCount: 2, suddenDeathCount: 0, rewards: [],
};
// R5 uses two hole cards per RUN, including the third board. Evaluate this fixture separately.
const tripleHands = { p1: hands.p1.slice(0, 2), p2: hands.p2.slice(0, 2) };
const tripleRunCards = { p1: [tripleHands.p1, cards(["As", "Qc"]), cards(["6d", "5h"])],
  p2: [tripleHands.p2, cards(["9s", "Jc"]), cards(["4s", "3d"])] };
const tripleBoards = [...boards, cards(["Ad", "9c", "6s", "4h", "2d"])];
const tripleWinners = tripleBoards.map((board, run) => {
  const order = compareHands(findBestFive([...tripleRunCards.p1[run]!, ...board]), findBestFive([...tripleRunCards.p2[run]!, ...board]));
  return order > 0 ? ["p1"] : order < 0 ? ["p2"] : ["p1", "p2"];
});
const tripleStreets = tripleBoards.map((board, run) => (["PRE_FLOP", "FLOP", "TURN", "RIVER"] as const).map((street, i) => ({
  street, results: profiles.map(({ playerId }) => {
    const visible = [...tripleRunCards[playerId as keyof typeof tripleRunCards][run]!, ...board.slice(0, [0, 3, 4, 5][i])];
    const hand = visible.length < 5 ? evaluatePartial(visible) : findBestFive(visible);
    return { ...hand, playerId, place: tripleWinners[run]!.includes(playerId) ? 1 : 2, usedCardIds: hand.bestFive.map(card => card.id) };
  }),
})));
const tripleResults = tripleStreets.map(streets => streets[3]!.results);
const tripleMatch: MatchView = { ...match, id: "run-three-preview", round: 5, final: false, runoutCount: 3, boards: tripleBoards,
  runCards: tripleRunCards,
  revealedCards: tripleHands, streetSnapshots: tripleStreets, boardResults: tripleResults, boardWinnerIds: tripleWinners,
  winnerIds: tripleWinners[2]!, results: tripleResults[2]!,
};
const choices = [
  [0, "FLOP_HAND", "RUN 1 진행"], [0, "RUN_RESULT", "RUN 1 결과"],
  [1, "FLOP_HAND", "RUN 2 진행"], [1, "COMPLETE", "두 RUN 최종 결과"],
  [2, "FLOP_HAND", "RUN 3 진행"], [2, "COMPLETE", "세 RUN 최종 결과"],
] as const;

export function RunTwicePreview() {
  const [selected, setSelected] = useState(3);
  const [triple, setTriple] = useState(false);
  const shownMatch = triple ? tripleMatch : match;
  const [run, phase] = choices[selected]!;
  const elapsed = cinematicTimeline(shownMatch).find(frame => frame.boardIndex === run && frame.phase === phase)!.at;
  return <main style={{ background: "#030b12", color: "#e8f4f1", minHeight: "100dvh" }}>
    <nav aria-label="RUN IT TWICE 미리보기" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", minHeight: 40, gap: 6, padding: 5 }}>
      <button className="secondary" onClick={() => { setTriple(!triple); setSelected(0); }}>{triple ? "Run It Twice 보기" : "Run It Three Times 보기"}</button>
      {choices.map(([, , label], index) => (triple ? index !== 3 : index < 4) && <button key={label} style={{ minHeight: 28, padding: "5px 7px", fontSize: 10 }} className={index === selected ? "primary" : "secondary"} onClick={() => setSelected(index)}>{label}</button>)}
    </nav>
    <ShowdownCinematic match={shownMatch} profiles={profiles} viewerId="p1" onComplete={() => {}} elapsedMs={elapsed} />
  </main>;
}
