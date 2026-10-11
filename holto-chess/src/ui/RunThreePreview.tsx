import { useMemo, useState } from "react";
import { autoChooseOpponent, completeOpponentSelect, createAbilityGame, isOpponentRevealing, lockRunLoadouts, prepareShowdown, resolvePrimary } from "../game/engine";
import { createMatchView } from "../game/matchView";
import type { PorenaGameState } from "../game/types";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { fastForwardToRound } from "./devFastForward";
import { ShowdownCinematic } from "./ShowdownCinematic";

/** Development only: the real engine plays a six-round game to its R5 RUN IT THREE TIMES showdown. */
function playToRunThree(seed: number): PorenaGameState {
  let state = fastForwardToRound(createAbilityGame(seed), 5);
  for (let guard = 0; guard < 40; guard += 1) {
    if (state.phase === "OPPONENT_SELECT") state = isOpponentRevealing(state) ? completeOpponentSelect(state) : autoChooseOpponent(state);
    else if (state.phase === "SHOP") state = prepareShowdown(state, []);
    else if (state.phase === "RUN_LOADOUT") state = lockRunLoadouts(state, []);
    else if (state.phase === "SHOWDOWN_PRIMARY") return resolvePrimary(state);
    else break;
  }
  return state;
}

const choices = [
  [0, "FLOP_HAND", "RUN 1 진행"], [0, "RUN_RESULT", "RUN 1 결과"], [1, "CARD_SWITCH_SETTLE", "RUN 2 교체"], [1, "TURN_HAND", "RUN 2 턴"],
  [1, "RUN_RESULT", "RUN 2 결과"], [2, "FLOP_HAND", "RUN 3 진행"], [2, "RIVER", "RUN 3 리버"], [2, "COMPLETE", "최종 결과"],
] as const;

export function RunThreePreview() {
  const params = new URLSearchParams(location.search);
  const [seed, setSeed] = useState(() => Number(params.get("seed") ?? 7));
  const [selected, setSelected] = useState<number | "play">(() => Number(params.get("step") ?? 5));
  const longNames = params.has("long");
  const { match, profiles, viewerId } = useMemo(() => {
    const state = playToRunThree(seed);
    const result = state.roundResults.find((item) => item.playerIds.includes("p1")) ?? state.roundResults[0]!;
    const view = createMatchView(state, result);
    const viewer = result.playerIds.includes("p1") ? "p1" : result.playerIds[0]!;
    const opponent = result.playerIds.find((id) => id !== viewer)!;
    const rename = (id: string, name: string) => longNames ? id === viewer ? "가나다라마바사아" : id === opponent ? "LongNicknameWithoutSpaces" : name : name;
    return { match: view, viewerId: viewer,
      profiles: state.players.map((p) => ({ playerId: p.id, name: rename(p.id, p.name), points: p.points, alive: !p.eliminated, abilityId: p.abilityId })) };
  }, [seed, longNames]);
  const frames = cinematicTimeline(match);
  const choice = selected === "play" ? undefined : choices[selected]!;
  const elapsed = choice ? frames.find((frame) => frame.boardIndex === choice[0] && frame.phase === choice[1])?.at ?? 0 : undefined;
  return <main className="run-three-preview" style={{ display: "flow-root", background: "#030b12", color: "#e8f4f1", minHeight: "100dvh" }}>
    {!params.has("bare") && <div role="toolbar" aria-label="R5 쇼다운 미리보기" style={{ position: "fixed", insetInline: 0, bottom: 0, zIndex: 50, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6, padding: 5, background: "#030b12cc" }}>
      {choices.map(([, , label], index) => <button key={label} style={{ minHeight: 26, padding: "4px 7px", fontSize: 10 }} className={index === selected ? "primary" : "secondary"} onClick={() => setSelected(index)}>{label}</button>)}
      <button style={{ minHeight: 26, padding: "4px 7px", fontSize: 10 }} className={selected === "play" ? "primary" : "secondary"} onClick={() => setSelected("play")}>재생</button>
      <button style={{ minHeight: 26, padding: "4px 7px", fontSize: 10 }} className="secondary" onClick={() => setSeed((value) => value + 1)}>다른 게임 ({seed})</button>
    </div>}
    <ShowdownCinematic key={`${seed}:${selected === "play" ? "play" : "still"}`} match={match} profiles={profiles} viewerId={viewerId} onComplete={() => setSelected(choices.length - 1)} controls={selected === "play"} elapsedMs={elapsed} />
  </main>;
}
