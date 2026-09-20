import type { HighCardDraw } from "../game/types";

const rankLabel = (rank: number) => ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] ?? String(rank);

export function HighCardDrawResult({ draw, name, survival }: {
  draw: HighCardDraw; name: (id: string) => string; survival: boolean;
}) {
  return <section className="high-card-result" aria-label="하이카드 드로우 결과">
    <h3>하이카드 드로우</h3>
    <div className="high-card-players">{draw.draws.map((entry) => <div key={entry.playerId} className={(draw.survivorIds ?? [draw.winnerId]).includes(entry.playerId) ? "draw-winner" : ""}>
      <b>{name(entry.playerId)}</b><strong>{rankLabel(entry.rank)}</strong>
      <span>{(draw.survivorIds ?? [draw.winnerId]).includes(entry.playerId) ? survival ? "생존" : "승리" : survival ? "탈락" : "패배"}</span>
    </div>)}</div>
    <p>족보 무승부 · {(draw.survivorIds ?? [draw.winnerId]).map(name).join(", ")} 하이카드 드로우 {survival ? "생존" : "승리"}</p>
  </section>;
}

export function HighCardDrawNotice({ survival, seconds, surviveCount = 1 }: { survival: boolean; seconds: number; surviveCount?: number }) {
  return <div className="high-card-backdrop"><section className="high-card-notice" role="alertdialog" aria-modal="true" aria-labelledby="high-card-title" aria-describedby="high-card-rules">
    <small>추가 타이브레이크 2회 · 동률 한도 도달</small>
    <h2 id="high-card-title">하이카드 드로우</h2>
    <div id="high-card-rules"><p>동률인 플레이어가 서로 다른 숫자 카드 1장씩을 뽑습니다.</p>
      <strong>{survival ? `높은 카드 순으로 ${surviveCount}명이 생존합니다. 나머지 플레이어는 탈락합니다.` : "가장 높은 카드를 뽑은 플레이어가 승리합니다."}</strong>
      <p>A가 가장 높고, 2가 가장 낮습니다.<br />이 카드는 보유 카드와 족보 점수에 포함되지 않습니다.</p>
    </div><b role="timer">{seconds}초 후 카드 자동 공개</b>
  </section></div>;
}
