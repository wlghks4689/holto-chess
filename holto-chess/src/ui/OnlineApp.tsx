import { useEffect, useRef, useState } from "react";
import type { GameAction, MatchView, PlayerView, ServerMessage, SessionCredential } from "../shared/protocol";
import { CinematicGate } from "./ShowdownCinematic";
import { invitedRoom } from "./roomInvite";
import { ShopCard } from "./ShopCard";
import { CardView } from "./CardView";
import { ShowdownHand } from "./ShowdownHand";
import { RunWinner } from "./RunItTwiceResult";
import { madeTone } from "./madeTone";
import { canSellWithoutBlocking } from "../game/shopRules";
import { RoundResults } from "./RoundResults";
import { forgetSession, rememberSession, storedSessions } from "./sessionStore";
import { MultiplayerLobby, OnlineEntryFrame, RoomWaitingRoom } from "./OnlineLobby";
import { onlineScreen } from "./onlineScreen";
import { EmptyHandSlots } from "./EmptyHandSlots";
import { RoundProgress } from "./PrepPhase";
import { createServerClock } from "./serverClock";
import { ShopCountdown } from "./ShopCountdown";
import { PhaseTimer } from "./PhaseTimer";
import { preloadFinalArena } from "./finalShowdownPresentation";
import { ExitGameDialog } from "./ExitGameDialog";
import { preloadShowdownStage } from "./showdownStage";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { FinalResultsPanel } from "./FinalResultsPanel";
import { HighCardDrawResult } from "./HighCardDraw";
import { makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { OpenDraftPanel, RunLoadoutPanel } from "./OpenDraft";
import { FinalRoundTransition, ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { SurvivalReadyPanel } from "./SurvivalReadyPanel";
import { isSurvivalParticipant } from "./survivalReadyPresentation";
import type { Round } from "../game/types";
import { RoundGuide } from "./RoundGuide";
import { markRoundGuideSeen, shouldAutoShowRoundGuide, useRoundGuidePreferences } from "./roundGuidePreferences";
import { getLocale, useTranslation, type TranslationKey } from "../i18n";
import { renderGameError, type ReceivedGameError } from "../i18n/gameError";
import { compactHandName } from "./handLabel";
import { localizedIcmDetail } from "./rewardDetail";

/** How long a sent action may stay in flight before the UI unlocks itself. */
const ACTION_TIMEOUT_MS = 10_000;
const titles = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "THE LAST HAND"];
const phases: Record<string, TranslationKey> = { LOBBY: "online.waitingRoom", SHOP: "shop.title", GROUP_ASSIGNMENT: "phase.groupAssignment", ROUND_RESULT: "result.round", GAME_RESULT: "history.finalResult", DRAFT_ORDER: "phase.draftOrder", OPEN_DRAFT: "draft.title", RUN_LOADOUT: "phase.runLoadout", SURVIVAL_READY: "phase.survivalCutoff" };
const clientErrorKeys: Record<string, TranslationKey> = {
  "client.otherTab": "connection.otherTab", "client.reconnectFailed": "connection.reconnectFailed", "client.checkConnection": "connection.checkConnection",
  "client.invalidNickname": "error.invalidNickname", "client.seatCheckFailed": "connection.seatCheckFailed", "client.rateLimited": "error.tryAgain",
  "client.roomNotFound": "error.roomNotFound", "client.roomUnavailable": "online.roomUnavailable", "client.joinFailed": "online.joinFailed",
  "client.noResponse": "connection.noResponse", "client.sendFailed": "connection.sendFailed",
};
const storedNickname = () => [...(localStorage.getItem("porena-nickname") ?? (getLocale() === "ko-KR" ? "플레이어" : "Player"))].slice(0, 8).join("");

function OnlineMatch({ match, view }: { match: MatchView; view: PlayerView }) {
  const { t } = useTranslation();
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? id;
  const matchNumber = match.matchNumber;
  const stageLabel = match.matchday ? `MATCH ${match.matchday}/3 · ${match.round === 3 && match.matchday === 1 ? "SEED GROUP" : "SWISS PAIRING"}` : match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : t(match.stage === "final" ? "match.final" : match.group === "winner" ? "match.winnerGroup" : match.group === "loser" ? "match.survivalGroup" : match.stage === "secondary" ? "match.second" : "match.first");
  const outcomeLabel = t(match.stage === "final" ? "match.finalFirst" : match.group === "loser" ? "match.survived" : "match.win");
  return <article className="match-card">
    {match.highCardDraw && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    <header><span>{t("match.numberStage", { number: matchNumber, stage: stageLabel })}</span><b>{match.runCards ? t("match.independentRuns") : t("match.winnerOutcome", { players: match.winnerIds.map(name).join(", "), outcome: outcomeLabel })}</b><em>{match.suddenDeathCount ? t("match.tiebreakCount", { count: match.suddenDeathCount }) : ""}</em></header>
    <div className={`boards ${match.boards.length > 1 ? "multi-board" : ""}`}>
      {match.boards.map((board, i) => {
        const used = new Set(match.boardResults[i]?.filter((r) => match.boardWinnerIds[i]?.includes(r.playerId)).flatMap((r) => r.usedCardIds));
        return <div className={`board made-${madeTone(match.boardResults[i]?.find((r) => match.boardWinnerIds[i]?.includes(r.playerId))?.displayName ?? "")}`} key={i}><small>{i >= match.runoutCount ? `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${i - match.runoutCount + 1}` : match.runoutCount === 2 ? `RUN ${i + 1}` : t("match.board")}</small><div className="card-row centered">{board.map((card) => <CardView key={card.id} card={card} compact glow={used.has(card.id)} dimmed={!used.has(card.id)} />)}</div>
          {match.runoutCount === 2 && <RunWinner winners={(match.boardWinnerIds[i] ?? []).map(name)} />}
          {match.boardResults[i]?.map((r) => <p className="hint" key={r.playerId}>{t("match.playerHandPlace", { player: name(r.playerId), place: r.place, hand: compactHandName(r.displayName, t) })}</p>)}
        </div>;
      })}
    </div>
    {!match.boards.length && <div className="no-board">NO COMMUNITY · THE LAST HAND</div>}
    <div className={`combatants ${match.participantIds.length > 2 ? "multi" : ""}`}>{match.participantIds.map((id) => {
      const result = match.results.find((r) => r.playerId === id);
      const winner = match.winnerIds.includes(id);
      const reward = match.rewards.find((entry) => entry.playerId === id);
      return result ? <div key={id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{name(id)}</b>{reward && <em>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))}P</em>}</div>{localizedIcmDetail(reward?.detail, t) && <p className="combatant-detail">{localizedIcmDetail(reward?.detail, t)}</p>}<ShowdownHand cards={match.runCards?.[id]?.[1] ?? match.revealedCards[id] ?? []} usedCardIds={result.usedCardIds} winner={winner} displayName={result.displayName} category={result.category} kickers={result.kickers} /></div> : null;
    })}</div>
  </article>;
}
function Selection({ view, send, disabled }: { view: PlayerView; send: (a: GameAction) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const selected = view.me.selectedCardIds;
  const required = 2;
  return <section className="panel select-panel"><h2>{t("online.r2SelectHeading", { count: selected.length })}</h2><div className="card-row centered">{view.me.ownedCards.map((card) => { const chosen = selected.includes(card.id); return <CardView key={card.id} card={card} selected={chosen} footer={t(chosen ? "select.chosen" : "select.choose")} onClick={disabled ? undefined : () => send({ type: "SELECT_CARDS", cardIds: chosen ? selected.filter((id) => id !== card.id) : [...selected.slice(-(required - 1)), card.id] })} />; })}</div><p className="hint">{t(selected.length === required ? "online.r2SelectSaved" : "online.r2SelectHelp")}</p></section>;
}
export function OnlineApp({ onHome }: { onHome: () => void }) {
  const { t } = useTranslation();
  const [credential, setCredential] = useState<SessionCredential | null>(null);
  const [resumable, setResumable] = useState<SessionCredential[]>(storedSessions);
  const [view, setView] = useState<PlayerView | null>(null);
  // Fetch this round's showdown artwork (R5: the Final Arena) during its shop so the showdown opens on it.
  useEffect(() => { if (view?.round === 5) preloadFinalArena(); else preloadShowdownStage(view?.round); }, [view?.round]);
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState<string | ReceivedGameError>("");
  const [roomCode, setRoomCode] = useState(() => invitedRoom(typeof location === "undefined" ? "" : location.search) ?? "");
  const [nickname, setNickname] = useState(storedNickname);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<GameAction["type"] | false>(false);
  const [connectionKey, setConnectionKey] = useState(0);
  const [spectating, setSpectating] = useState(false);
  const [tiebreakSpectating, setTiebreakSpectating] = useState(false);
  const [spectatedPlayerId, setSpectatedPlayerId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const socket = useRef<WebSocket | null>(null);
  const archivedGameId = useRef<string | null>(null);
  // One clock per tab: every received view refines the server-time estimate used by the cinematic.
  const [serverClock] = useState(createServerClock);
  const pendingRequest = useRef<{ id: string; type: string; revision?: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const clearPending = () => {
    if (pendingRequest.current) clearTimeout(pendingRequest.current.timer);
    pendingRequest.current = null;
    setPending(false);
  };

  useEffect(() => {
    let cancelled = false;
    const sessions = storedSessions();
    if (!sessions.length) return;
    void Promise.all(sessions.map(async (session) => {
      try {
        const response = await fetch(`/api/rooms/${session.roomId}/session`, { method: "POST", headers: { "X-Porena-Session": session.token } });
        if ([401, 404, 410].includes(response.status)) { forgetSession(session.roomId); return null; }
      } catch { /* Keep the seat when offline; a transient failure is not proof the room ended. */ }
      return session;
    })).then((checked) => { if (!cancelled) setResumable(checked.filter((session): session is SessionCredential => !!session)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (view?.barrierEndsAt === undefined) return;
    // Deadlines are server epoch ms: read them against the server clock, not this device's.
    const id = setInterval(() => setNow(serverClock.now()), 250);
    return () => clearInterval(id);
  }, [view?.barrierEndsAt, serverClock]);

  useEffect(() => {
    if (!credential) return;
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const probes = new Map<string, number>();
    let burst: ReturnType<typeof setTimeout> | undefined;
    const probe = () => {
      if (socket.current?.readyState !== WebSocket.OPEN) return;
      const nonce = crypto.randomUUID();
      const at = Date.now();
      for (const [id, sent] of probes) if (at - sent > 10_000) probes.delete(id);
      probes.set(nonce, at);
      socket.current.send(JSON.stringify({ type: "SYNC_CLOCK", nonce }));
    };
    const resync = () => { if (!document.hidden) { serverClock.reset?.(); probe(); clearTimeout(burst); burst = setTimeout(probe, 1000); } };
    const probeTimer = setInterval(probe, 10_000);
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    const connect = () => {
      if (disposed) return;
      setStatus("Connecting"); clearPending();
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/rooms/${credential.roomId}`);
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "JOIN_ROOM", token: credential.token, nickname: storedNickname() }));
      ws.onmessage = (event) => {
        if (disposed) return;
        const message = JSON.parse(event.data) as ServerMessage;
        // Opt-in local diagnostics: exact received views, never session credentials.
        if (import.meta.env.DEV && new URLSearchParams(location.search).has("inspect") && message.type === "PLAYER_VIEW") console.debug("[PORENA WS received]", JSON.stringify(message));
        if (message.type === "ROOM_JOINED") { setStatus("Connected"); attempts = 0; setError(""); resync(); }
        if (message.type === "CLOCK_SYNC") {
          const sent = probes.get(message.nonce);
          if (sent !== undefined) serverClock.roundTrip?.(sent, Date.now(), message.receivedAt, message.sentAt);
          probes.delete(message.nonce);
        }
        if (message.type === "PLAYER_VIEW") {
          serverClock.observe(message.payload.serverNow);
          if (message.payload.phase !== "SURVIVAL_READY") setTiebreakSpectating(false);
          if (message.payload.phase !== "GAME_RESULT" && archivedGameId.current) {
            archivedGameId.current = null;
            rememberSession(credential);
            setResumable(storedSessions().filter((session) => session.roomId !== credential.roomId));
          }
          setView(message.payload);
          if (pendingRequest.current?.revision !== undefined && message.payload.revision >= pendingRequest.current.revision) clearPending();
        }
        if (message.type === "ACK" && pendingRequest.current?.id === message.requestId) {
          if (pendingRequest.current.type === "LEAVE_ROOM") {
            // The seat stays ours: the bot plays it until we reconnect, so keep the session listed.
            rememberSession(credential);
            clearPending(); setCredential(null); setView(null); setStatus("Disconnected"); setError(""); setResumable(storedSessions());
          } else pendingRequest.current.revision = message.revision;
        }
        if (message.type === "ERROR") { if (!message.requestId || message.requestId === pendingRequest.current?.id) clearPending(); setError({ code: message.code, params: message.params, message: message.message }); }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        setStatus("Disconnected"); clearPending();
        if (event.code === 4001) { setError("client.otherTab"); return; }
        if (event.code === 1008 || attempts >= 5) { setError("client.reconnectFailed"); return; }
        setStatus("Reconnecting");
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
      };
      ws.onerror = () => { if (!disposed) setError("client.checkConnection"); };
    };
    connect();
    return () => { disposed = true; clearTimeout(timer); clearTimeout(burst); clearInterval(probeTimer); document.removeEventListener("visibilitychange", resync); window.removeEventListener("online", resync); clearPending(); socket.current?.close(1000, "Leaving view"); socket.current = null; };
  }, [credential, connectionKey, serverClock]);

  const join = async (create: boolean) => {
    if (!/^[\p{L}\p{N} _-]{1,8}$/u.test(nickname.trim())) { setError("client.invalidNickname"); return; }
    localStorage.setItem("porena-nickname", nickname.trim());
    setBusy(true); setError("");
    try {
      if (!create) {
        const previous = storedSessions().find((session) => session.roomId === roomCode.trim().toUpperCase());
        if (previous) {
          const check = await fetch(`/api/rooms/${previous.roomId}/session`, { method: "POST", headers: { "X-Porena-Session": previous.token } });
          if (check.ok) { resume(previous); return; }
          if ([401, 404, 410].includes(check.status)) forgetSession(previous.roomId);
          else throw new Error("client.seatCheckFailed");
        }
      }
      const response = await fetch(create ? "/api/rooms" : `/api/rooms/${roomCode.trim().toUpperCase()}/join`, { method: "POST" });
      if (!response.ok) throw new Error(response.status === 429 ? "client.rateLimited" : response.status === 404 ? "client.roomNotFound" : "client.roomUnavailable");
      const session = await response.json() as SessionCredential;
      rememberSession(session);
      setView(null); setCredential(session); setResumable(storedSessions().filter((s) => s.roomId !== session.roomId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "client.joinFailed"); }
    finally { setBusy(false); }
  };
  const send = (action: GameAction) => {
    if (!view || socket.current?.readyState !== WebSocket.OPEN || status !== "Connected" || pendingRequest.current) return;
    const requestId = crypto.randomUUID();
    // A lost ACK must not disable every control for the rest of the session, so
    // the in-flight lock always carries a deadline that releases it.
    const timer = setTimeout(() => {
      if (pendingRequest.current?.id !== requestId) return;
      clearPending();
      setError("client.noResponse");
    }, ACTION_TIMEOUT_MS);
    pendingRequest.current = { id: requestId, type: action.type, timer };
    setPending(action.type); setError("");
    try { socket.current.send(JSON.stringify({ ...action, requestId, turnKey: view.turnKey })); }
    catch { clearPending(); setError("client.sendFailed"); }
  };
  const leaveRoom = () => {
    send({ type: "LEAVE_ROOM" });
  };
  const finalViewed = () => {
    if (!view || !view.standings.length || status !== "Connected") return;
    if (!view.finalResultsReleased) {
      const finalists = view.players.filter(player => player.alive && player.human && !player.departed);
      if (view.me.alive || !finalists.length) send({ type: "FINAL_RESULTS_VIEWED" });
      return;
    }
    if (archivedGameId.current === view.gameId) return;
    try { saveFinalResult(makeSavedFinalResult(view)); } catch { /* Manual save remains available. */ }
    archivedGameId.current = view.gameId;
    forgetSession(view.roomId);
    setResumable(storedSessions());
  };
  const [exiting, setExiting] = useState(false);
  const [manualGuideRound, setManualGuideRound] = useState<Round | null>(null);
  const roundGuidePreferences = useRoundGuidePreferences();
  const resume = (session: SessionCredential) => {
    rememberSession(session);
    setError(""); setView(null); setCredential(session);
    setResumable(storedSessions().filter((s) => s.roomId !== session.roomId));
  };
  const returnToLobby = () => {
    clearPending(); setError(""); setSpectating(false);
    setCredential(null); setView(null); setStatus("Disconnected");
    setResumable(storedSessions());
  };
  const statusLabel = t(status === "Connected" ? "connection.connected" : status === "Connecting" ? "connection.connecting" : status === "Reconnecting" ? "connection.reconnecting" : "connection.disconnected");
  const visibleError = error ? typeof error === "string" ? clientErrorKeys[error] ? t(clientErrorKeys[error]) : error : renderGameError(error, t) : "";
  const phaseLabel = (phase: string) => phases[phase] ? t(phases[phase]) : phase;
  const disabled = status !== "Connected" || !!pending;
  const secondsLeft = view?.barrierEndsAt === undefined ? null : Math.max(0, Math.ceil((view.barrierEndsAt - now) / 1000));
  const waitingOnMe = !!view && view.waitingOn.includes(view.me.playerId);
  const waitingHumans = view ? view.players.filter((p) => p.human && p.alive && !p.departed) : [];
  const totalHumans = waitingHumans.length;
  const readyHumans = waitingHumans.filter((p) => p.ready).length;
  const rematchHumans = view ? view.players.filter((player) => player.human && !player.departed) : [];
  const rematchReady = rematchHumans.filter((player) => player.ready).length;
  const meReadyForRematch = !!view?.players.find((player) => player.playerId === view.me.playerId)?.ready;
  const effectiveSpectatedPlayerId = view?.spectatorViews?.some((candidate) => candidate.playerId === spectatedPlayerId)
    ? spectatedPlayerId : view?.spectatorViews?.[0]?.playerId ?? null;
  const spectatorPerspective = spectating ? view?.spectatorViews?.find((candidate) => candidate.playerId === effectiveSpectatedPlayerId) : undefined;
  const displayView = view && spectatorPerspective ? { ...view, me: spectatorPerspective.me, matches: spectatorPerspective.matches,
    roundHistory: spectatorPerspective.roundHistory, presentation: spectatorPerspective.presentation } : view;
  const isSpectatingPlayer = !!spectatorPerspective;
  const survivalSpectator = displayView?.phase === "SURVIVAL_READY" && !!displayView.survival
    && !isSurvivalParticipant(displayView.survival.playerIds, view?.me.playerId ?? "");
  const interactionDisabled = disabled || isSpectatingPlayer;
  const canSell = displayView ? canSellWithoutBlocking({ ownedCount: displayView.me.ownedCards.length, purchases: displayView.me.purchases,
    purchaseLimit: displayView.me.purchaseLimit, handLimit: displayView.me.handLimit }) : false;
  const lockedShopCardCount = displayView?.me.shopCards.filter(({ card }) => displayView.me.lockedShopCardIds?.includes(card.id)).length ?? 0;
  const allShopCardsLocked = !!displayView?.me.shopSize && lockedShopCardCount >= displayView.me.shopSize;
  const screen = onlineScreen(credential, view);
  if (screen === "lobby") return <MultiplayerLobby nickname={nickname} onNickname={setNickname} roomCode={roomCode} onRoomCode={setRoomCode} busy={busy} error={visibleError} sessions={resumable} onJoin={(create) => void join(create)} onResume={resume} onHome={onHome} />;
  if (screen === "connecting" || screen === "departed") return <OnlineEntryFrame title={t(screen === "departed" ? "online.departedRoom" : "online.connectingRoom")} eyebrow="PRIVATE ARENA"><p className="entry-description">{credential?.roomId} · {statusLabel}</p>{error && <p className="room-error" role="alert">{visibleError}</p>}<div className="entry-recovery">{screen === "connecting" && <button className="secondary" onClick={() => setConnectionKey((n) => n + 1)}>{t("connection.retry")}</button>}<button className="secondary" onClick={() => { if (screen === "departed" && credential) forgetSession(credential.roomId); returnToLobby(); }}>{t("online.returnLobby")}</button></div></OnlineEntryFrame>;
  if (!view) return null;
  if (screen === "waiting") return <RoomWaitingRoom view={view} status={statusLabel} connected={status === "Connected"} pending={!!pending} error={visibleError} onReady={() => send({ type: "READY" })} onLeave={leaveRoom} onRetry={() => setConnectionKey((n) => n + 1)} onReturn={returnToLobby} />;
  if (!displayView) return null;
  const autoSpectating = !view.me.alive && !isSpectatingPlayer && !!view.presentation
    && !view.matches.some(match => match.participantIds.includes(view.me.playerId));
  const observedName = displayView.players.find((player) => player.playerId === (autoSpectating ? effectiveSpectatedPlayerId : displayView.me.playerId))?.name;
  const isShowdownPrep = ["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(displayView.phase);
  const autoGuideRound = displayView.phase !== "LOBBY" && shouldAutoShowRoundGuide(roundGuidePreferences.autoEnabled, roundGuidePreferences.seenRounds, displayView.round)
    ? displayView.round : null;
  const guideRound = manualGuideRound ?? autoGuideRound;
  const clockQuality = serverClock.quality?.();
  return <>{(status !== "Connected" || error || isSpectatingPlayer || autoSpectating || clockQuality?.degraded) && <aside className="online-session-overlay" aria-label={t("online.connectionSpectatorAria")}>
    {status !== "Connected" && <div role="status"><b>{statusLabel}</b><span>{t("connection.resumeAfterReconnect")}</span><button className="secondary" onClick={() => setConnectionKey(n => n + 1)}>{t("connection.retry")}</button><button className="secondary" onClick={returnToLobby}>{t("online.returnLobbyKeepRoom")}</button></div>}
    {error && <p role="alert">{visibleError}</p>}
    {status === "Connected" && clockQuality?.degraded && <small role="status">{Number.isFinite(clockQuality.uncertaintyMs) ? t("connection.delayUncertainty", { ms: Math.ceil(clockQuality.uncertaintyMs) }) : t("connection.syncingClock")}</small>}
    {(isSpectatingPlayer || autoSpectating) && <details><summary>{t(autoSpectating ? "spectator.autoViewing" : "spectator.viewing", { player: observedName ?? "" })} <small>{t("spectator.changeTarget")}</small></summary><div className="spectator-picker" role="group" aria-label={t("spectator.choosePlayer")}>{view.spectatorViews?.map(candidate => <button key={candidate.playerId} aria-pressed={candidate.playerId === effectiveSpectatedPlayerId} onClick={() => { setSpectating(true); setSpectatedPlayerId(candidate.playerId); }}>{view.players.find(player => player.playerId === candidate.playerId)?.name ?? candidate.playerId}</button>)}{isSpectatingPlayer && <button onClick={() => setSpectating(false)}>{t("spectator.close")}</button>}</div></details>}
  </aside>}{guideRound !== null && <RoundGuide round={guideRound} onClose={() => { markRoundGuideSeen(guideRound); setManualGuideRound(null); }} confirmLabel={t("round.returnToGame")} timerNotice={t("round.onlineTimerNotice")} />}<CinematicGate key={`${credential?.roomId ?? "lobby"}:${displayView.me.playerId}`} soundSessionId={`online:${view.gameId}`} matches={displayView.matches} profiles={displayView.players} viewerId={displayView.me.playerId} identityId={view.me.playerId} receivedAt={view.serverNow} presentation={displayView.presentation} clock={serverClock}><main className={displayView.phase !== "LOBBY" ? "game-arena" : "arena-lobby"}><nav><button className="brand brand-home" type="button" onClick={onHome} aria-label={t("nav.homeAria")}><span><img src="/assets/brand/porena-mark.webp" alt="" width="38" height="38" /></span><div><b>PORENA</b><small>ONLINE · TACTICAL POKER AUTOBATTLER</small></div></button>{displayView.phase !== "LOBBY" ? <RoundProgress round={displayView.round} prep={null} /> : <span />}<div className="nav-status"><div className="survivors"><small>CONNECTION</small><b className={credential ? `conn-${status.toLowerCase()}` : "conn-lobby"}>{credential ? statusLabel : t("online.lobbyShort")}</b></div><div className="nav-actions"><button type="button" className="secondary round-guide-trigger" aria-label={t("nav.roundRulesAria", { round: displayView.round })} onClick={() => setManualGuideRound(displayView.round)}>?</button><button type="button" className="secondary nav-exit" disabled={!!pending} onClick={() => setExiting(true)}>{t("exit.leave")}</button></div></div></nav>
      {exiting && <ExitGameDialog mode="multi" busy={!!pending} onCancel={() => setExiting(false)} onConfirm={() => { setExiting(false); leaveRoom(); }} />}
    <div className={`page-shell ${displayView.phase === "SHOP" ? "shop-page" : ""} ${displayView.phase === "GAME_RESULT" ? "final-results-page" : ""}`} id="top">
      <>
        {!view.me.alive && !view.players.find((p) => p.playerId === view.me.playerId)?.departed && <section className="panel eliminated-panel eliminated-priority" role="alert"><span className="eyebrow">TOURNAMENT OUT</span><h2>{t("online.eliminatedHeading")}</h2><p>{t("online.eliminatedDescription", { round: view.round })}</p><div className="room-controls">{spectating ? <button className="secondary" onClick={() => { setSpectating(false); setSpectatedPlayerId(null); }}>{t("online.closeSpectator")}</button> : <button className="primary" disabled={!view.spectatorViews?.length} onClick={() => { setSpectating(true); setSpectatedPlayerId(view.spectatorViews?.[0]?.playerId ?? null); }}>{t("online.watchOthers")}</button>}<button className="secondary" disabled={disabled} onClick={leaveRoom}>{t("online.leaveRoom")}</button></div></section>}
        {!isShowdownPrep && <header className="round-header"><div>{displayView.phase !== "GAME_RESULT" && <span className="round-number">{displayView.round === 2 && ["DRAFT_ORDER", "OPEN_DRAFT"].includes(displayView.phase) ? "ROUND 2 · DRAFT PHASE" : `ROUND 0${displayView.round}`}</span>}<h1>{displayView.phase === "GAME_RESULT" ? "FINAL STANDINGS" : titles[displayView.round]}</h1></div>{displayView.phase !== "GAME_RESULT" && <div className="phase-badge"><b>{phaseLabel(displayView.phase)}</b></div>}</header>}
        {["DRAFT_ORDER", "OPEN_DRAFT"].includes(displayView.phase) && <OpenDraftPanel view={displayView} send={send} disabled={interactionDisabled} seconds={secondsLeft} />}
        {displayView.phase === "RUN_LOADOUT" && <RunLoadoutPanel view={displayView} send={send} disabled={interactionDisabled} seconds={secondsLeft} />}
        {displayView.phase === "SURVIVAL_READY" && displayView.survival && <SurvivalReadyPanel {...displayView.survival} viewerId={view.me.playerId} name={(id) => displayView.players.find((player) => player.playerId === id)?.name ?? id} />}
        {displayView.phase === "SHOP" && displayView.me.alive && <><section className="shop-layout"><div className="inventory panel"><header><div className="shop-heading"><h2>{isSpectatingPlayer ? t("online.observedCards", { player: observedName ?? "" }) : t("shop.myCards")}</h2><strong className="shop-count">{displayView.me.ownedCards.length} / {displayView.me.handLimit}</strong></div><div className="stat-block"><small>{t("shop.stack")}</small><strong>{displayView.me.stackBB}<i>BB</i></strong></div></header><div className="card-row owned-row">{displayView.me.ownedCards.map((card) => <CardView key={card.id} card={card} onClick={!interactionDisabled && !displayView.me.committed && canSell ? () => send({ type: "SELL_CARD", cardId: card.id }) : undefined} footer={isSpectatingPlayer ? undefined : canSell ? t("shop.sell") : t("shop.cannotSell")} />)}<EmptyHandSlots count={displayView.me.ownedCards.length} limit={displayView.me.handLimit} /></div></div><div className="market panel"><header><div className="shop-heading"><h2>{t("shop.market")}</h2><strong className="shop-count">{displayView.me.shopCards.length} / {displayView.me.shopSize}</strong></div><span className="purchase-count">{t("shop.purchases", { used: displayView.me.purchases, limit: displayView.me.purchaseLimit })}</span></header><div className="card-row market-row">{displayView.me.shopCards.map(({ card, price }, index) => <ShopCard key={card.id} dealIndex={index} card={card} price={price} locked={displayView.me.lockedShopCardIds?.includes(card.id) ?? false} disabled={interactionDisabled || displayView.me.committed} onBuy={() => send({ type: "BUY_CARD", cardId: card.id })} onLock={() => send({ type: "LOCK_SHOP", cardId: card.id })} />)}</div><div className="market-actions"><button className="secondary" disabled={interactionDisabled || displayView.me.committed || allShopCardsLocked || displayView.me.rerollsUsed >= displayView.me.rerollLimit || displayView.me.stackBB < displayView.me.rerollCost} onClick={() => send({ type: "REROLL" })}>{pending === "REROLL" ? "REFRESHING…" : t("shop.rerollStatus", { cost: displayView.me.rerollCost, used: displayView.me.rerollsUsed, limit: displayView.me.rerollLimit })}</button></div></div></section>
          {(displayView.round === 2) && <Selection key={`${displayView.round}:${displayView.me.playerId}:${displayView.me.ownedCards.map((c) => c.id).join()}`} view={displayView} send={send} disabled={interactionDisabled || displayView.me.committed} />}
          <div className="action-bar shop-ready-bar">
            <div className="shop-ready-copy"><p>{displayView.me.committed
              ? t("online.readyWaiting", { ready: readyHumans, total: totalHumans })
              : t("online.readyWarning", { ready: readyHumans, total: totalHumans })}</p>
              <small className="hint">{t("online.readyHint")}</small></div>
            {displayView.barrierEndsAt !== undefined && <ShopCountdown endsAt={displayView.barrierEndsAt} totalMs={BARRIER_TIMEOUT_MS.SHOP} now={now} committed={displayView.me.committed} />}
            <button className={displayView.me.committed ? "secondary" : "primary"} disabled={interactionDisabled || (!displayView.me.committed && (displayView.me.ownedCards.length !== displayView.me.handLimit || (displayView.round === 2 && displayView.me.selectedCardIds.length !== 2)))} onClick={() => send(displayView.me.committed ? { type: "CANCEL_SHOP_READY" } : { type: "END_SHOP_PHASE" })}>{t(displayView.me.committed ? "online.cancelReady" : "online.confirmReady")}</button></div></>}
        {displayView.phase === "GAME_RESULT" && <><FinalResultsPanel view={view} onViewed={finalViewed} /><section className="panel rematch-panel"><span className="eyebrow">NEXT GAME</span><h2>{t("online.nextChoice")}</h2><p>{t("online.rematchHint")}</p><div className="final-exit-actions"><button className="primary" disabled={disabled || !view.finalResultsReleased || meReadyForRematch || rematchHumans.length < 2} onClick={() => send({ type: "REMATCH_READY" })}>{meReadyForRematch ? t("online.rematchWaiting", { ready: rematchReady, total: rematchHumans.length }) : t("action.startNewGame")}</button><button className="secondary" type="button" onClick={onHome}>{t("action.home")}</button></div></section></>}
        {isShowdownPrep && (displayView.round === 5
          ? <FinalRoundTransition />
          : <ShowdownPrepPanel round={displayView.round} playerName={observedName ?? t("results.player")} seconds={secondsLeft} secondary={displayView.phase === "SHOWDOWN_SECONDARY"} matchup={displayView.showdownPrep} />)}
        {!isShowdownPrep && <RoundResults round={displayView.round} rows={displayView.roundSummary ?? []} viewerId={displayView.me.playerId} showBrackets={displayView.round === 4 && displayView.phase === "GROUP_ASSIGNMENT"} secondsLeft={displayView.phase === "ROUND_RESULT" ? secondsLeft : null}>{(displayView.roundHistory ?? displayView.matches).map((m) => <OnlineMatch key={m.id} match={m} view={displayView} />)}</RoundResults>}
        {view.players.find((p) => p.playerId === view.me.playerId)?.departed && <p className="hint">{t("online.departedHint")}</p>}
        {survivalSpectator && <div className="action-bar phase-ready-bar"><div className="phase-wait-copy" aria-live="polite"><b>{t("online.tiebreakSpectate")}</b><p>{t(tiebreakSpectating ? "online.tiebreakAutoOpen" : "online.tiebreakWait")}</p></div><button className="primary" disabled={tiebreakSpectating || status !== "Connected"} onClick={() => setTiebreakSpectating(true)}>{t(tiebreakSpectating ? "online.watchWaiting" : "action.spectate")}</button></div>}
        {!survivalSpectator && !["LOBBY", "DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT", "SHOP", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY", "NEXT_ROUND", "GAME_RESULT"].includes(displayView.phase) && <div className="action-bar phase-ready-bar"><div className="phase-wait-copy"><b>{phaseLabel(displayView.phase)}</b><p>{t("online.confirmResultsHint")}</p></div>{secondsLeft !== null && <PhaseTimer className="action-countdown" seconds={secondsLeft} ariaLabel={t("online.phaseTimerAria", { phase: phaseLabel(displayView.phase), seconds: secondsLeft })} />}<button className="primary" disabled={interactionDisabled || !view.me.alive || (displayView.phase === "SURVIVAL_READY" && !waitingOnMe) || displayView.players.find((p) => p.playerId === displayView.me.playerId)?.ready} onClick={() => send({ type: "READY" })}>{t(!view.me.alive ? "online.spectatorAdvance" : !waitingOnMe ? "online.otherPlayersWaiting" : displayView.phase === "SURVIVAL_READY" ? "action.startTiebreak" : "online.confirmNext")}</button></div>}
      </>
    </div>
  </main></CinematicGate></>;
}
