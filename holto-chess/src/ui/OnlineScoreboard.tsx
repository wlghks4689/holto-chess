import { useRef } from "react";
import type { PlayerView } from "../shared/protocol";

export function OnlineScoreboard({ view }: { view: PlayerView }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const rows = [...view.players].sort((a, b) => b.points - a.points || b.stackBB - a.stackBB || a.playerId.localeCompare(b.playerId));
  return <section className="online-scoreboard">
    <button className="secondary score-toggle" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">플레이어 순위 <span>{view.players.filter((p) => p.alive).length}명 생존 · 펼치기 ▾</span></button>
    <dialog ref={dialog} className="online-score-dialog" aria-labelledby="online-score-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="score-dialog-content"><header><h2 id="online-score-title">플레이어 순위</h2><button className="secondary" autoFocus onClick={() => dialog.current?.close()} aria-label="순위표 닫기">닫기 ×</button></header>
        <p>현재 승점순 · 동점 시 보유 BB순 (최종 순위와 다를 수 있습니다)</p>
        <table><thead><tr><th scope="col">순위</th><th scope="col">플레이어</th><th scope="col">보유 BB</th><th scope="col">승점</th></tr></thead><tbody>{rows.map((player, index) => <tr key={player.playerId} className={player.playerId === view.me.playerId ? "is-me" : ""}><td>{index + 1}등</td><th scope="row">{player.name}<small>{player.playerId === view.me.playerId ? "나 · " : ""}{!player.alive ? "탈락" : player.departed ? "AI 대행" : player.human ? "플레이어" : "AI"}</small></th><td>{Number(player.stackBB.toFixed(2))}</td><td>{Number(player.points.toFixed(2))}</td></tr>)}</tbody></table>
      </div>
    </dialog>
  </section>;
}
