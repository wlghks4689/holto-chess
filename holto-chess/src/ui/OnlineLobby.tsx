import { useState } from "react";
import type { PlayerView, SessionCredential } from "../shared/protocol";
import { MatchHistoryPage } from "./MatchHistory";
import { OnlineEntryFrame } from "./OnlineEntryFrame";
export { OnlineEntryFrame } from "./OnlineEntryFrame";

export function MultiplayerLobby({ nickname, onNickname, roomCode, onRoomCode, busy, error, sessions, onJoin, onResume, onHome }: {
  nickname: string; onNickname: (value: string) => void; roomCode: string; onRoomCode: (value: string) => void;
  busy: boolean; error: string; sessions: SessionCredential[]; onJoin: (create: boolean) => void;
  onResume: (session: SessionCredential) => void; onHome: () => void;
}) {
  const [panel, setPanel] = useState<"create" | "join" | "history" | null>(null);
  if (panel === "history") return <MatchHistoryPage onBack={() => setPanel(null)} />;
  return <OnlineEntryFrame title="멀티플레이 로비" eyebrow="MULTIPLAYER">
    <p className="entry-description">다른 플레이어와 아레나에 참가하세요.</p>
    <div className="entry-choices">
      <button className="primary" disabled={busy} aria-expanded={panel === "create"} aria-controls="room-entry-form" onClick={() => setPanel("create")}>새 방 만들기 <span aria-hidden="true">＋</span></button>
      <button className="secondary" disabled={busy} aria-expanded={panel === "join"} aria-controls="room-entry-form" onClick={() => setPanel("join")}>방 찾기 <span>방 코드로 참가</span></button>
      <button className="secondary entry-history-button" disabled={busy} onClick={() => setPanel("history")}>대전 기록 <span>완료한 경기 보기</span></button>
    </div>
    {panel && <form id="room-entry-form" className="entry-form" onSubmit={(event) => { event.preventDefault(); if (!busy) onJoin(panel === "create"); }}>
      <h2>{panel === "create" ? "새 아레나 만들기" : "방 참가하기"}</h2>
      {panel === "join" && <label>방 코드<input autoFocus aria-label="방 코드" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCDEF" maxLength={6} pattern="[A-Z2-9]{6}" required value={roomCode} disabled={busy} onChange={(e) => onRoomCode(e.target.value.toUpperCase())} /><small>초대받은 6자리 코드를 입력하세요.</small></label>}
      <label>닉네임<input autoFocus={panel === "create"} aria-label="닉네임" autoComplete="nickname" maxLength={16} required placeholder="플레이어" value={nickname} disabled={busy} onChange={(e) => onNickname(e.target.value)} /></label>
      <div className="entry-form-actions"><button className="primary" type="submit" disabled={busy || (panel === "join" && !/^[A-Z2-9]{6}$/.test(roomCode.trim()))}>{busy ? "입장 중…" : panel === "create" ? "방 만들기" : "참가하기"}</button><button className="secondary" type="button" disabled={busy} onClick={() => setPanel(null)}>취소</button></div>
    </form>}
    {error && <p className="room-error" role="alert">{error}</p>}
    {sessions.length > 0 && <section className="entry-recent" aria-label="최근 참여한 아레나"><h2>최근 참여한 아레나</h2><p>저장된 좌석으로 돌아갑니다. 진행 중인 게임도 이어서 참가할 수 있습니다.</p>{sessions.map((session) => <div key={session.roomId}><code>{session.roomId}</code><button className="secondary" disabled={busy} onClick={() => onResume(session)}>다시 참가<span className="sr-only"> · {session.roomId}</span></button></div>)}</section>}
    <button className="entry-back" disabled={busy} onClick={onHome}>← 홈으로</button>
  </OnlineEntryFrame>;
}

export function RoomWaitingRoom({ view, status, connected, pending, error, onReady, onLeave, onRetry, onReturn }: {
  view: PlayerView; status: string; connected: boolean; pending: boolean; error: string;
  onReady: () => void; onLeave: () => void; onRetry: () => void; onReturn: () => void;
}) {
  const [copyFeedback, setCopyFeedback] = useState("");
  const humans = view.players.filter((player) => player.human && !player.departed);
  const ready = humans.find((player) => player.playerId === view.me.playerId)?.ready;
  const copy = async () => {
    try { await navigator.clipboard.writeText(view.roomId); setCopyFeedback("방 코드가 복사되었습니다."); }
    catch { setCopyFeedback("복사할 수 없습니다. 위 방 코드를 직접 선택해 복사해 주세요."); }
  };
  return <OnlineEntryFrame title="방 대기실" eyebrow="PRIVATE ARENA">
    <div className="waiting-connection" role="status">{status}</div>
    <section className="waiting-code" aria-label="초대 코드"><span>ROOM CODE</span><strong data-testid="room-id">{view.roomId}</strong><button className="secondary" onClick={() => void copy()}>코드 복사</button><p role="status">{copyFeedback || "함께할 플레이어에게 방 코드를 알려주세요."}</p></section>
    <section className="waiting-players" aria-label="참가자"><h2>PLAYERS <span>{humans.length} / {view.capacity}</span></h2><ul>{humans.map((player) => <li key={player.playerId}><span className={player.connected ? "waiting-dot connected" : "waiting-dot"} aria-label={player.connected ? "접속 중" : "연결 끊김"} /><b>{player.name}{player.playerId === view.me.playerId && <small>나</small>}</b><span className={player.ready ? "ready" : ""}>{player.ready ? "READY" : "WAITING"}</span></li>)}</ul></section>
    {error && <p className="room-error" role="alert">{error}</p>}
    <div className="waiting-actions"><button className="primary" disabled={!connected || pending || ready} onClick={onReady}>{ready ? "✓ 준비 완료" : "READY · 준비 완료"}</button><p>{ready ? "다른 사용자의 준비를 기다리고 있습니다." : "최소 2명이 참가하고 모든 참가자가 준비하면 자동으로 시작합니다."}</p><small>게임 시작 시 빈 좌석은 AI 플레이어가 채웁니다.</small></div>
    {!connected && <div className="entry-recovery"><button className="secondary" onClick={onRetry}>연결 다시 시도</button><button className="secondary" onClick={onReturn}>로비로 돌아가기 · 방 유지</button></div>}
    <button className="entry-back" disabled={!connected || pending} onClick={onLeave}>{pending ? "처리 중…" : "방 나가기"}</button>
  </OnlineEntryFrame>;
}
