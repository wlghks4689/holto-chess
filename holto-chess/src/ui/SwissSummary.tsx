import type { MatchView } from "../shared/protocol";

export function SwissSummary({ matches, viewerId }: { matches: MatchView[]; viewerId: string }) {
  const last = matches.filter((m) => m.matchday && m.participantIds.includes(viewerId)).at(-1);
  const record = last?.swissAfter?.[viewerId];
  if (!record) return null;
  return <section className="panel swiss-summary"><span className="eyebrow">ROUND 1 RESULT</span>
    <strong>{record.wins}W {record.draws}D {record.losses}L</strong>
    <span>POINT {last?.rewards.find((r) => r.playerId === viewerId)?.afterPoints ?? 0}</span>
    <small>3경기 완료 · 전원 다음 라운드 진출</small></section>;
}
