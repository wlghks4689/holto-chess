import { useState } from "react";
import { makeDeck } from "../core/poker/cards";
import { findBestFive } from "../core/poker/evaluate";
import type { MatchView } from "../shared/protocol";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { ShowdownCinematic } from "./ShowdownCinematic";

const deck = makeDeck();
const cards = (ids: string[]) => ids.map(id => deck.find(card => card.id === id)!);
const profiles = [{ playerId: "p1", name: "나" }, { playerId: "p2", name: "상대 플레이어" }];

/** Local demonstration using the production evaluator, timeline and cinematic. */
export function MadePreview() {
  const [trips, setTrips] = useState(false);
  const [step, setStep] = useState<"TABLE_ENTER" | "FLOP_HAND" | "BEST5_GLOW">("TABLE_ENTER");
  const [replay, setReplay] = useState(0);
  const holes = {
    p1: cards(trips ? ["8h", "8d", "8c", "Ks", "2h"] : ["8h", "8d", "8c", "6s", "6h"]),
    p2: cards(["Qh", "Qd", "9c", "7s", "3h"]),
  };
  const board = cards(trips ? ["4s", "Jd", "Ac", "5c", "9h"] : ["8s", "2d", "3c", "4s", "Jh"]);
  const snapshots = (["PRE_FLOP", "FLOP", "TURN", "RIVER"] as const).map((street, index) => ({
    street, results: profiles.map(({ playerId }, position) => {
      const hand = findBestFive([...holes[playerId as keyof typeof holes], ...board.slice(0, [0, 3, 4, 5][index])]);
      return { ...hand, playerId, place: position + 1, usedCardIds: hand.bestFive.map(card => card.id) };
    }),
  }));
  const results = snapshots[3]!.results;
  const match: MatchView = {
    id: "made-preview", round: 4, matchNumber: 1, stage: "secondary", participantIds: ["p1", "p2"],
    winnerIds: ["p1"], boards: [board], boardResults: [results], boardWinnerIds: [["p1"]], results,
    streetSnapshots: [snapshots], revealedCards: holes, runoutCount: 1, suddenDeathCount: 0, rewards: [],
  };
  const elapsed = cinematicTimeline(match).find(frame => frame.phase === step)!.at;
  return <main style={{ background: "#030b12", color: "#e8f4f1", minHeight: "100dvh" }}>
    <header style={{ padding: 12, textAlign: "center", position: "relative", zIndex: 10 }}>
      <b>로컬 검토용 · 실제 게임 컴포넌트</b>
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, margin: "10px 0" }}>
        <button className={!trips ? "primary" : "secondary"} onClick={() => { setTrips(false); setStep("TABLE_ENTER"); }}>풀하우스 → 포카드</button>
        <button className={trips ? "primary" : "secondary"} onClick={() => { setTrips(true); setStep("BEST5_GLOW"); }}>트립스 주황색</button>
        {([ ["TABLE_ENTER", "① 프리플랍"], ["FLOP_HAND", "② 플랍"], ["BEST5_GLOW", "③ 최종 쇼다운"] ] as const).map(([phase, title]) =>
          <button key={phase} className={step === phase ? "primary" : "secondary"} onClick={() => { setStep(phase); setReplay(value => value + 1); }}>{title}</button>)}
      </div>
      <p style={{ margin: 0 }}>{step === "BEST5_GLOW" ? "최종 단계: 카드·프로필 메이드 연출 (선택한 버튼을 다시 누르면 재생)" : "진행 중: 족보명 색상만 변경 · 카드와 프로필 전체 연출 없음"}</p>
    </header>
    <ShowdownCinematic key={`${trips}:${step}:${replay}`} match={match} profiles={profiles} viewerId="p1" onComplete={() => {}} elapsedMs={elapsed} />
  </main>;
}
