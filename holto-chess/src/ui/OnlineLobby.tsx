import { useState } from "react";
import type { PlayerView, SessionCredential } from "../shared/protocol";
import { MatchHistoryPage } from "./MatchHistory";
import { OnlineEntryFrame } from "./OnlineEntryFrame";
import { invitedRoom, roomInviteUrl } from "./roomInvite";
import { useTranslation } from "../i18n";
export { OnlineEntryFrame } from "./OnlineEntryFrame";

export function MultiplayerLobby({ nickname, onNickname, roomCode, onRoomCode, busy, error, sessions, onJoin, onResume, onHome }: {
  nickname: string; onNickname: (value: string) => void; roomCode: string; onRoomCode: (value: string) => void;
  busy: boolean; error: string; sessions: SessionCredential[]; onJoin: (create: boolean) => void;
  onResume: (session: SessionCredential) => void; onHome: () => void;
}) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState<"create" | "join" | "history" | null>(() => invitedRoom(typeof location === "undefined" ? "" : location.search) ? "join" : null);
  if (panel === "history") return <MatchHistoryPage onBack={() => setPanel(null)} />;
  return <OnlineEntryFrame title={t("online.lobby")} eyebrow="MULTIPLAYER">
    <p className="entry-description">{t("online.lobbyDescription")}</p>
    <div className="entry-choices">
      <button className="primary" disabled={busy} aria-expanded={panel === "create"} aria-controls="room-entry-form" onClick={() => setPanel("create")}>{t("online.createRoom")} <span aria-hidden="true">＋</span></button>
      <button className="secondary" disabled={busy} aria-expanded={panel === "join"} aria-controls="room-entry-form" onClick={() => setPanel("join")}>{t("online.findRoom")} <span>{t("online.joinByCode")}</span></button>
      <button className="secondary entry-history-button" disabled={busy} onClick={() => setPanel("history")}>{t("online.matchHistory")} <span>{t("online.completedMatches")}</span></button>
    </div>
    {panel && <form id="room-entry-form" className="entry-form" onSubmit={(event) => { event.preventDefault(); if (!busy) onJoin(panel === "create"); }}>
      <h2>{panel === "create" ? t("online.createArena") : t("online.joinRoom")}</h2>
      {panel === "join" && <label>{t("online.roomCodeLabel")}<input autoFocus aria-label={t("online.roomCodeLabel")} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCDEF" maxLength={6} pattern="[A-Z2-9]{6}" required value={roomCode} disabled={busy} onChange={(e) => onRoomCode(e.target.value.toUpperCase())} /><small>{t("online.roomCodeHelp")}</small></label>}
      <label>{t("online.nickname")}<input autoFocus={panel === "create"} aria-label={t("online.nickname")} autoComplete="nickname" maxLength={8} required placeholder={t("online.playerPlaceholder")} value={nickname} disabled={busy} onChange={(e) => onNickname(e.target.value)} /></label>
      <div className="entry-form-actions"><button className="primary" type="submit" disabled={busy || (panel === "join" && !/^[A-Z2-9]{6}$/.test(roomCode.trim()))}>{busy ? t("online.joining") : panel === "create" ? t("online.createRoom") : t("online.join")}</button><button className="secondary" type="button" disabled={busy} onClick={() => setPanel(null)}>{t("common.cancel")}</button></div>
    </form>}
    {error && <p className="room-error" role="alert">{error}</p>}
    {sessions.length > 0 && <section className="entry-recent" aria-label={t("online.recentRooms")}><h2>{t("online.recentRooms")}</h2><p>{t("online.recentRoomsHelp")}</p>{sessions.map((session) => <div key={session.roomId}><code>{session.roomId}</code><button className="secondary" disabled={busy} onClick={() => onResume(session)}>{t("online.resume")}<span className="sr-only"> · {session.roomId}</span></button></div>)}</section>}
    <button className="entry-back" disabled={busy} onClick={onHome}>{t("online.home")}</button>
  </OnlineEntryFrame>;
}

export function RoomWaitingRoom({ view, status, connected, pending, error, onReady, onLeave, onRetry, onReturn }: {
  view: PlayerView; status: string; connected: boolean; pending: boolean; error: string;
  onReady: () => void; onLeave: () => void; onRetry: () => void; onReturn: () => void;
}) {
  const { t } = useTranslation();
  const [copyFeedback, setCopyFeedback] = useState("");
  const humans = view.players.filter((player) => player.human && !player.departed);
  const ready = humans.find((player) => player.playerId === view.me.playerId)?.ready;
  const copy = async () => {
    try { await navigator.clipboard.writeText(view.roomId); setCopyFeedback(t("online.codeCopied")); }
    catch { setCopyFeedback(t("online.codeCopyFallback")); }
  };
  const inviteUrl = roomInviteUrl(typeof location === "undefined" ? "https://porena.kr" : location.origin, view.roomId);
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); setCopyFeedback(t("online.inviteCopied")); }
    catch { setCopyFeedback(t("online.inviteCopyFallback")); }
  };
  return <OnlineEntryFrame title={t("online.waitingRoom")} eyebrow="PRIVATE ARENA">
    <div className="waiting-connection" role="status">{status}</div>
    <section className="waiting-code" aria-label={t("online.inviteCode")}><span>ROOM CODE</span><strong data-testid="room-id">{view.roomId}</strong><button className="secondary" onClick={() => void copy()}>{t("online.copyCode")}</button><button className="secondary" onClick={() => void copyInvite()}>{t("online.copyInvite")}</button><input className="invite-link" aria-label={t("online.inviteLink")} readOnly value={inviteUrl} onFocus={(event) => event.target.select()} /><p role="status">{copyFeedback || t("online.inviteHelp")}</p></section>
    <section className="waiting-players" aria-label={t("online.players")}><h2>{t("online.players")} <span>{humans.length} / {view.capacity}</span></h2><ul>{humans.map((player) => <li key={player.playerId}><span className={player.connected ? "waiting-dot connected" : "waiting-dot"} aria-label={player.connected ? t("connection.connected") : t("connection.disconnected")} /><b>{player.name}{player.playerId === view.me.playerId && <small>{t("round.you")}</small>}</b><span className={player.ready ? "ready" : ""}>{player.ready ? "READY" : "WAITING"}</span></li>)}</ul></section>
    {error && <p className="room-error" role="alert">{error}</p>}
    <div className="waiting-actions"><button className="primary" disabled={!connected || pending || ready} onClick={onReady}>{ready ? t("online.readyDone") : t("online.readyAction")}</button><p>{ready ? t("online.waitingForOthers") : t("online.readyStartHelp")}</p><small>{t("online.aiFillHelp")}</small></div>
    {!connected && <div className="entry-recovery"><button className="secondary" onClick={onRetry}>{t("connection.retry")}</button><button className="secondary" onClick={onReturn}>{t("online.returnLobbyKeepRoom")}</button></div>}
    <button className="entry-back" disabled={!connected || pending} onClick={onLeave}>{pending ? t("online.processing") : t("online.leaveRoom")}</button>
  </OnlineEntryFrame>;
}
