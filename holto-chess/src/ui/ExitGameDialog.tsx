import "./exit-dialog.css";

/**
 * Leaving means different things per mode, so the copy says what actually happens: a single game is
 * discarded, while a multiplayer seat keeps playing through the bot and can be taken back by
 * reconnecting from the lobby.
 */
export function ExitGameDialog({ mode, busy = false, onCancel, onConfirm }: {
  mode: "single" | "multi"; busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const multi = mode === "multi";
  return <div className="exit-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title" onClick={onCancel}>
    <section className="exit-dialog panel" onClick={(event) => event.stopPropagation()}>
      <span className="eyebrow">{multi ? "LEAVE MATCH" : "LEAVE GAME"}</span>
      <h2 id="exit-dialog-title">게임에서 나갈까요?</h2>
      {multi
        ? <><p>지금 진행 중인 라운드부터 <b>AI가 내 좌석을 대신 플레이</b>합니다. 남은 플레이어들은 그대로 게임을 이어갑니다.</p>
          <p className="exit-dialog-hint">로비의 재접속 목록에서 이 방으로 돌아오면 좌석을 다시 가져옵니다. AI가 진행한 결과는 그대로 남습니다.</p></>
        : <><p>이 게임은 <b>종료되고 기록은 남지 않습니다.</b> 홈 화면으로 돌아갑니다.</p>
          <p className="exit-dialog-hint">AI와의 싱글 플레이라 다른 플레이어에게 영향을 주지 않습니다.</p></>}
      <div className="exit-dialog-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>계속 플레이</button>
        <button type="button" className="primary" onClick={onConfirm} disabled={busy}>{busy ? "나가는 중…" : multi ? "나가기 · AI에게 맡기기" : "나가기"}</button>
      </div>
    </section>
  </div>;
}
