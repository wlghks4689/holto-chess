export function RunWinner({ winners }: { winners: string[] }) {
  return <p className="run-winner">{winners.length > 1 ? "무승부" : winners.length === 1 ? `${winners[0]} 승리` : "결과 대기"}</p>;
}
