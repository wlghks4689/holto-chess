import { isSurvivalParticipant } from "./survivalReadyPresentation";

type Props = {
  playerIds: string[];
  eliminateCount: number;
  viewerId: string;
  name: (playerId: string) => string;
};

export function SurvivalReadyPanel({ playerIds, eliminateCount, viewerId, name }: Props) {
  const participant = isSurvivalParticipant(playerIds, viewerId);
  return <section className="panel transition-panel survival-ready-panel" aria-label="타이 브레이크 안내">
    <h2>동점자가 발생하여 타이 브레이크 경기를 진행합니다.</h2>
    <p>{playerIds.map(name).join(" · ")}</p>
    <strong>{playerIds.length - eliminateCount}명 생존 · {eliminateCount}명 탈락</strong>
    {!participant && <p>타이 브레이크 대상자가 아닙니다. 동점자들의 경기를 관전합니다.</p>}
  </section>;
}
