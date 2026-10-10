import { useMemo, useState } from "react";
import { App } from "./App";
import { phasePreviewStates } from "./phasePreviewStates";
import { ShowdownCinematic } from "./ShowdownCinematic";
import { createMatchView } from "../game/matchView";
import { cinematicTimeline } from "./cinematicTimeline";

export function PhasePreview() {
  const [sixRounds, setSixRounds] = useState(true);
  const states = useMemo(() => phasePreviewStates(sixRounds), [sixRounds]);
  const [selected, setSelected] = useState(0);
  const [revision, setRevision] = useState(0);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [frameIndex, setFrameIndex] = useState(0);
  const game = states[selected] ?? states[0]!;
  const match = matchIndex >= 0 && game.roundResults[matchIndex] ? createMatchView(game, game.roundResults[matchIndex]!) : null;
  const frames = match ? cinematicTimeline(match) : [];
  const select = (index: number) => { setSelected(index); setMatchIndex(-1); setFrameIndex(0); };
  return <>
    <div style={{ position: "fixed", top: 8, left: 8, zIndex: 10000, maxWidth: "calc(100vw - 16px)" }}>
      <details open className="panel" style={{ padding: 10 }}>
        <summary>페이즈 미리보기 · 자동 진행 중지</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <label>규칙 <select value={String(sixRounds)} onChange={e => { setSixRounds(e.target.value === "true"); select(0); }}><option value="true">현재 6라운드</option><option value="false">기존 5라운드</option></select></label>
          <label>라운드·페이즈 <select value={selected} onChange={e => select(Number(e.target.value))}>{states.map((state, index) => <option key={index} value={index}>R{state.round} · {state.phase}{state.phase === "FINAL_AUCTION" && state.finalAuction?.settledAt !== null || state.phase === "OPPONENT_SELECT" && state.opponentSelect?.opponentId ? " · 결과 공개" : ""}</option>)}</select></label>
          <button className="secondary" disabled={selected === 0} onClick={() => select(selected - 1)}>이전</button>
          <button className="secondary" disabled={selected >= states.length - 1} onClick={() => select(selected + 1)}>다음</button>
          <button className="secondary" onClick={() => setRevision(value => value + 1)}>초기화</button>
          {!!game.roundResults.length && <label>쇼다운 <select value={matchIndex} onChange={e => { setMatchIndex(Number(e.target.value)); setFrameIndex(0); }}><option value={-1}>페이즈 화면</option>{game.roundResults.map((result, index) => <option key={result.id} value={index}>경기 {index + 1} · {result.stage}</option>)}</select></label>}
          {!!frames.length && <label>연출 단계 <select value={frameIndex} onChange={e => setFrameIndex(Number(e.target.value))}>{frames.map((frame, index) => <option key={index} value={index}>{frame.boardIndex + 1} · {frame.phase}</option>)}</select></label>}
        </div>
        <small>실제 엔진 상태를 사용합니다. 기존 5라운드는 구버전 카드 선택과 조건부 생존전 예시를 포함합니다. 화면 조작 후 다른 페이즈를 선택하면 원래 상태로 돌아갑니다.</small>
      </details>
    </div>
    {match ? <ShowdownCinematic key={`${selected}:${matchIndex}`} match={match} profiles={game.players.map(p => ({ playerId: p.id, name: p.name, abilityId: p.abilityId }))} viewerId="p1" elapsedMs={frames[frameIndex]?.at ?? 0} onComplete={() => {}} />
      : <App key={`${sixRounds}:${selected}:${revision}`} previewState={game} onHome={() => { location.href = "/"; }} />}
  </>;
}
