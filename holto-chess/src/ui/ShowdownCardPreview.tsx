import { useState } from "react";
import { makeDeck } from "../core/poker/cards";
import type { MatchView } from "../shared/protocol";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { ShowdownCinematic } from "./ShowdownCinematic";

const deck = makeDeck();
const players = [
  { playerId: "p1", name: "나 · YOU", points: 12, alive: true },
  { playerId: "p2", name: "블러프 캣", points: 10, alive: true },
  { playerId: "p3", name: "턴 샤크", points: 8, alive: true },
  { playerId: "p4", name: "다이아 바이퍼", points: 6, alive: true },
];

function fixture(round: 1 | 2 | 3 | 4 | 5): MatchView {
  const participantIds = round === 4 ? ["p1", "p2", "p3"] : round === 5 ? ["p1", "p2", "p3", "p4"] : ["p1", "p2"];
  const handSize = round === 1 ? 2 : round === 2 ? 3 : round === 3 ? 4 : round === 4 ? 5 : 7;
  const revealedCards = Object.fromEntries(participantIds.map((id, index) => [id, deck.slice(index * 7, index * 7 + handSize)]));
  const boards = round === 5 ? [] : round === 2 ? [deck.slice(35, 40), deck.slice(40, 45)] : [deck.slice(35, 40)];
  const boardWinnerIds = boards.map((_, index) => [participantIds[index % participantIds.length]!]);
  const results = participantIds.map((playerId, index) => ({
    playerId,
    place: index + 1,
    category: "PAIR" as const,
    kickers: [14, 12, 9, 6],
    displayName: "원 페어",
    usedCardIds: (revealedCards[playerId] ?? []).slice(0, 2).map((card) => card.id),
  }));
  const view: MatchView = {
    id: `card-size-preview-r${round}`,
    round,
    matchNumber: 1,
    stage: round === 5 ? "final" : round === 4 ? "secondary" : "primary",
    group: round === 4 ? "winner" : undefined,
    participantIds,
    winnerIds: [participantIds[0]!],
    boards,
    boardWinnerIds,
    boardResults: boards.map(() => results),
    results,
    runoutCount: boards.length,
    suddenDeathCount: 0,
    rewards: [],
    revealedCards,
  };
  if (round === 2) view.runCards = Object.fromEntries(participantIds.map((id) => [id, [revealedCards[id]!, revealedCards[id]!]]));
  return view;
}

export function ShowdownCardPreview() {
  const [round, setRound] = useState<1 | 2 | 3 | 4 | 5>(1);
  const match = fixture(round);
  const frame = cinematicTimeline(match).at(-1)!;
  return <main style={{ minHeight: "100svh", padding: "12px", background: "#030b12", color: "#e8f4f1" }}>
    <nav aria-label="미리보기 라운드" style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", margin: "0 auto 12px" }}>
      {([1, 2, 3, 4, 5] as const).map((number) => <button className={round === number ? "primary" : "secondary"} key={number} onClick={() => setRound(number)}>ROUND {number}</button>)}
    </nav>
    <ShowdownCinematic match={match} profiles={players} viewerId="p1" onComplete={() => {}} elapsedMs={frame.at} />
  </main>;
}
