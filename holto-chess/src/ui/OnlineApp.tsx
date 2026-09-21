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
import { formatCountdown } from "./countdown";
import { preloadFinalArena } from "./finalShowdownPresentation";
import { ExitGameDialog } from "./ExitGameDialog";
import { preloadShowdownStage } from "./showdownStage";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { FinalResultsPanel } from "./FinalResultsPanel";
import { HighCardDrawResult } from "./HighCardDraw";
import { makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { OpenDraftPanel, RunLoadoutPanel } from "./OpenDraft";

/** How long a sent action may stay in flight before the UI unlocks itself. */
const ACTION_TIMEOUT_MS = 10_000;
const titles = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "THE LAST HAND"];
const phases: Record<string, string> = { LOBBY: "입장 대기", SHOP: "상점", SHOWDOWN_PRIMARY: "1차 쇼다운 준비", GROUP_ASSIGNMENT: "그룹 배정", SHOWDOWN_SECONDARY: "2차 쇼다운 준비", ROUND_RESULT: "라운드 결과", AUGMENT: "증강 선택", NEXT_ROUND: "다음 라운드", GAME_RESULT: "최종 결과" };
Object.assign(phases, { DRAFT_ORDER: "드래프트 순서 공개", OPEN_DRAFT: "공개 드래프트", RUN_LOADOUT: "RUN 카드 배치", SURVIVAL_READY: "탈락선 생존 타이브레이크" });
const storedNickname = () => [...(localStorage.getItem("porena-nickname") ?? "플레이어")].slice(0, 8).join("");

function OnlineMatch({ match, view }: { match: MatchView; view: PlayerView }) {
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? id;
  const matchNumber = match.matchNumber;
  const stageLabel = match.matchday ? `MATCH ${match.matchday}/3 · ${match.round === 3 && match.matchday === 1 ? "SEED GROUP" : "SWISS PAIRING"}` : match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : match.stage === "final" ? "최종전" : match.group === "winner" ? "승자조" : match.group === "loser" ? "생존전" : match.stage === "secondary" ? "2차전" : "1차전";
  const outcomeLabel = match.stage === "final" ? "최종 1위" : match.group === "loser" ? "생존" : "승리";
  return <article className="match-card">
    {match.highCardDraw && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    <header><span>매치 {matchNumber} · {stageLabel}</span><b>{match.runCards ? "RUN 1 · RUN 2 독립 결과" : `♔ ${match.winnerIds.map(name).join(", ")} ${outcomeLabel}`}</b><em>{match.suddenDeathCount ? `타이브레이크 ${match.suddenDeathCount}회` : ""}</em></header>
    <div className={`boards ${match.boards.length > 1 ? "multi-board" : ""}`}>
      {match.boards.map((board, i) => {
        const used = new Set(match.boardResults[i]?.filter((r) => match.boardWinnerIds[i]?.includes(r.playerId)).flatMap((r) => r.usedCardIds));
        return <div className={`board made-${madeTone(match.boardResults[i]?.find((r) => match.boardWinnerIds[i]?.includes(r.playerId))?.displayName ?? "")}`} key={i}><small>{i >= match.runoutCount ? `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${i - match.runoutCount + 1}` : match.runoutCount === 2 ? `RUN ${i + 1}` : "보드"}</small><div className="card-row centered">{board.map((card) => <CardView key={card.id} card={card} compact glow={used.has(card.id)} dimmed={!used.has(card.id)} />)}</div>
          {match.runoutCount === 2 && <RunWinner winners={(match.boardWinnerIds[i] ?? []).map(name)} />}
          {match.boardResults[i]?.map((r) => <p className="hint" key={r.playerId}>{name(r.playerId)} · #{r.place} · {r.displayName}</p>)}
        </div>;
      })}
    </div>
    {!match.boards.length && <div className="no-board">NO COMMUNITY · THE LAST HAND</div>}
    <div className={`combatants ${match.participantIds.length > 2 ? "multi" : ""}`}>{match.participantIds.map((id) => {
      const result = match.results.find((r) => r.playerId === id);
      const winner = match.winnerIds.includes(id);
      const reward = match.rewards.find((entry) => entry.playerId === id);
      return result ? <div key={id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{name(id)}</b>{reward && <em>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))}P</em>}</div>{reward?.detail?.includes("ICM") && <p className="combatant-detail">{reward.detail}</p>}<ShowdownHand cards={match.runCards?.[id]?.[1] ?? match.revealedCards[id] ?? []} usedCardIds={result.usedCardIds} winner={winner} displayName={result.displayName} category={result.category} kickers={result.kickers} /></div> : null;
    })}</div>
  </article>;
}
function Selection({ view, send, disabled }: { view: PlayerView; send: (a: GameAction) => void; disabled: boolean }) {
  const selected = view.me.selectedCardIds;
  const required = 2;
  return <section className="panel select-panel"><h2>R2 출전 카드 2장 · {selected.length}/2</h2><div className="card-row centered">{view.me.ownedCards.map((card) => { const chosen = selected.includes(card.id); return <CardView key={card.id} card={card} selected={chosen} footer={chosen ? "선택됨" : "선택"} onClick={disabled ? undefined : () => send({ type: "SELECT_CARDS", cardIds: chosen ? selected.filter((id) => id !== card.id) : [...selected.slice(-(required - 1)), card.id] })} />; })}</div><p className="hint">{selected.length === required ? "출전 카드 2장이 저장되었습니다." : "출전 카드 2장을 선택하세요. 선택은 자동 저장됩니다."}</p></section>;
}
export function OnlineApp({ onHome }: { onHome: () => void }) {
  const [credential, setCredential] = useState<SessionCredential | null>(null);
  const [resumable, setResumable] = useState<SessionCredential[]>(storedSessions);
  const [view, setView] = useState<PlayerView | null>(null);
  // Fetch this round's showdown artwork (R5: the Final Arena) during its shop so the showdown opens on it.
  useEffect(() => { if (view?.round === 5) preloadFinalArena(); else preloadShowdownStage(view?.round); }, [view?.round]);
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState("");
  const [roomCode, setRoomCode] = useState(() => invitedRoom(typeof location === "undefined" ? "" : location.search) ?? "");
  const [nickname, setNickname] = useState(storedNickname);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<GameAction["type"] | false>(false);
  const [connectionKey, setConnectionKey] = useState(0);
  const [spectating, setSpectating] = useState(false);
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
        if (message.type === "ROOM_JOINED") { setStatus("Connected"); attempts = 0; setError(""); }
        if (message.type === "PLAYER_VIEW") {
          serverClock.observe(message.payload.serverNow);
          if (message.payload.phase === "GAME_RESULT" && archivedGameId.current !== message.payload.gameId) {
            archivedGameId.current = message.payload.gameId;
            try { saveFinalResult(makeSavedFinalResult(message.payload)); } catch { /* The result screen remains usable without local storage. */ }
            forgetSession(message.payload.roomId);
            setResumable(storedSessions());
          } else if (message.payload.phase !== "GAME_RESULT" && archivedGameId.current) {
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
        if (message.type === "ERROR") { if (!message.requestId || message.requestId === pendingRequest.current?.id) clearPending(); setError(message.message); }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        setStatus("Disconnected"); clearPending();
        if (event.code === 4001) { setError("다른 탭에서 같은 좌석에 접속했습니다. 이 탭의 연결을 종료합니다."); return; }
        if (event.code === 1008 || attempts >= 5) { setError("연결을 복구하지 못했습니다. 다시 연결하거나 로비에서 다른 방에 참가하세요."); return; }
        setStatus("Reconnecting");
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
      };
      ws.onerror = () => { if (!disposed) setError("연결을 확인하고 재접속하세요."); };
    };
    connect();
    return () => { disposed = true; clearTimeout(timer); clearPending(); socket.current?.close(1000, "Leaving view"); socket.current = null; };
  }, [credential, connectionKey, serverClock]);

  const join = async (create: boolean) => {
    if (!/^[\p{L}\p{N} _-]{1,8}$/u.test(nickname.trim())) { setError("닉네임은 문자·숫자 1~8자로 입력하세요."); return; }
    localStorage.setItem("porena-nickname", nickname.trim());
    setBusy(true); setError("");
    try {
      if (!create) {
        const previous = storedSessions().find((session) => session.roomId === roomCode.trim().toUpperCase());
        if (previous) {
          const check = await fetch(`/api/rooms/${previous.roomId}/session`, { method: "POST", headers: { "X-Porena-Session": previous.token } });
          if (check.ok) { resume(previous); return; }
          if ([401, 404, 410].includes(check.status)) forgetSession(previous.roomId);
          else throw new Error("기존 좌석을 확인할 수 없습니다. 잠시 후 다시 시도하세요.");
        }
      }
      const response = await fetch(create ? "/api/rooms" : `/api/rooms/${roomCode.trim().toUpperCase()}/join`, { method: "POST" });
      if (!response.ok) throw new Error(response.status === 429 ? "요청이 많습니다. 잠시 후 다시 시도하세요." : response.status === 404 ? "방을 찾을 수 없습니다." : "방이 시작되었거나 입장할 수 없습니다.");
      const session = await response.json() as SessionCredential;
      rememberSession(session);
      setView(null); setCredential(session); setResumable(storedSessions().filter((s) => s.roomId !== session.roomId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "입장 실패"); }
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
      setError("서버 응답이 없습니다. 다시 시도하거나 재접속하세요.");
    }, ACTION_TIMEOUT_MS);
    pendingRequest.current = { id: requestId, type: action.type, timer };
    setPending(action.type); setError("");
    try { socket.current.send(JSON.stringify({ ...action, requestId, turnKey: view.turnKey })); }
    catch { clearPending(); setError("전송하지 못했습니다. 재접속하세요."); }
  };
  const leaveRoom = () => {
    send({ type: "LEAVE_ROOM" });
  };
  const [exiting, setExiting] = useState(false);
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
  const statusLabel = status === "Connected" ? "접속됨" : status === "Connecting" ? "접속 중…" : status === "Reconnecting" ? "재접속 중…" : "연결 끊김";
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
  const interactionDisabled = disabled || isSpectatingPlayer;
  const canSell = displayView ? canSellWithoutBlocking({ ownedCount: displayView.me.ownedCards.length, purchases: displayView.me.purchases,
    purchaseLimit: displayView.me.purchaseLimit, handLimit: displayView.me.handLimit }) : false;
  const allShopCardsLocked = !!displayView?.me.shopCards.length && displayView.me.shopCards.every(({ card }) => displayView.me.lockedShopCardIds?.includes(card.id));
  const screen = onlineScreen(credential, view);
  if (screen === "lobby") return <MultiplayerLobby nickname={nickname} onNickname={setNickname} roomCode={roomCode} onRoomCode={setRoomCode} busy={busy} error={error} sessions={resumable} onJoin={(create) => void join(create)} onResume={resume} onHome={onHome} />;
  if (screen === "connecting" || screen === "departed") return <OnlineEntryFrame title={screen === "departed" ? "퇴장한 방입니다" : "방에 연결하고 있습니다"} eyebrow="PRIVATE ARENA"><p className="entry-description">{credential?.roomId} · {statusLabel}</p>{error && <p className="room-error" role="alert">{error}</p>}<div className="entry-recovery">{screen === "connecting" && <button className="secondary" onClick={() => setConnectionKey((n) => n + 1)}>연결 다시 시도</button>}<button className="secondary" onClick={() => { if (screen === "departed" && credential) forgetSession(credential.roomId); returnToLobby(); }}>로비로 돌아가기</button></div></OnlineEntryFrame>;
  if (!view) return null;
  if (screen === "waiting") return <RoomWaitingRoom view={view} status={statusLabel} connected={status === "Connected"} pending={!!pending} error={error} onReady={() => send({ type: "READY" })} onLeave={leaveRoom} onRetry={() => setConnectionKey((n) => n + 1)} onReturn={returnToLobby} />;
  if (!displayView) return null;
  const observedName = displayView.players.find((player) => player.playerId === displayView.me.playerId)?.name;
  return <CinematicGate key={`${credential?.roomId ?? "lobby"}:${displayView.me.playerId}`} matches={displayView.matches} profiles={displayView.players} viewerId={displayView.me.playerId} presentation={displayView.presentation} clock={serverClock}><main className={displayView.phase !== "LOBBY" ? "game-arena" : "arena-lobby"}><nav><button className="brand brand-home" type="button" onClick={onHome} aria-label="PORENA 메인 화면으로 이동"><span><img src="/assets/brand/porena-mark.webp" alt="" width="38" height="38" /></span><div><b>PORENA</b><small>ONLINE · TACTICAL POKER AUTOBATTLER</small></div></button>{displayView.phase !== "LOBBY" ? <RoundProgress round={displayView.round} prep={null} /> : <span />}<div className="survivors"><small>CONNECTION</small><b className={credential ? `conn-${status.toLowerCase()}` : "conn-lobby"}>{credential ? statusLabel : "로비"}</b></div><button type="button" className="secondary nav-exit" disabled={!!pending} onClick={() => setExiting(true)}>나가기</button></nav>
      {exiting && <ExitGameDialog mode="multi" busy={!!pending} onCancel={() => setExiting(false)} onConfirm={() => { setExiting(false); leaveRoom(); }} />}
    <div className="page-shell" id="top">
      {error && <p className="room-error" role="alert">{error}</p>}
      {status !== "Connected" && <div className="entry-recovery" role="status"><span>{statusLabel}</span><button className="secondary" onClick={() => setConnectionKey((n) => n + 1)}>연결 다시 시도</button><button className="secondary" onClick={returnToLobby}>로비로 돌아가기 · 방 유지</button></div>}
      <>
        {!view.me.alive && !view.players.find((p) => p.playerId === view.me.playerId)?.departed && <section className="panel eliminated-panel eliminated-priority" role="alert"><span className="eyebrow">TOURNAMENT OUT</span><h2>이번 게임에서 탈락했습니다</h2><p>R{view.round} 결과로 탈락이 확정되었습니다. 남은 경기는 다른 플레이어의 화면으로 관전할 수 있습니다.</p><div className="room-controls">{spectating ? <button className="secondary" onClick={() => { setSpectating(false); setSpectatedPlayerId(null); }}>관전 화면 닫기</button> : <button className="primary" disabled={!view.spectatorViews?.length} onClick={() => { setSpectating(true); setSpectatedPlayerId(view.spectatorViews?.[0]?.playerId ?? null); }}>다른 플레이어 관전</button>}<button className="secondary" disabled={disabled} onClick={leaveRoom}>방 나가기</button></div></section>}
        {isSpectatingPlayer && <section className="spectator-banner" role="status"><div><span>관전 중</span><b>{observedName} 화면</b><small>읽기 전용</small></div><div className="spectator-picker" role="group" aria-label="관전할 플레이어 선택">{view.spectatorViews?.map((candidate) => <button key={candidate.playerId} className={candidate.playerId === effectiveSpectatedPlayerId ? "active" : ""} aria-pressed={candidate.playerId === effectiveSpectatedPlayerId} onClick={() => setSpectatedPlayerId(candidate.playerId)}>{view.players.find((player) => player.playerId === candidate.playerId)?.name ?? candidate.playerId}</button>)}</div></section>}
        <header className="round-header"><div><span className="round-number">ROUND 0{displayView.round}</span><h1>{displayView.phase === "GAME_RESULT" ? "FINAL STANDINGS" : titles[displayView.round]}</h1></div><div className="phase-badge"><b>{phases[displayView.phase] ?? displayView.phase}</b>{displayView.phase === "GAME_RESULT" && <span>TOURNAMENT COMPLETE</span>}</div></header>
        {["DRAFT_ORDER", "OPEN_DRAFT"].includes(displayView.phase) && <OpenDraftPanel view={displayView} send={send} disabled={interactionDisabled} seconds={secondsLeft} />}
        {displayView.phase === "RUN_LOADOUT" && <RunLoadoutPanel view={displayView} send={send} disabled={interactionDisabled} seconds={secondsLeft} />}
        {displayView.phase === "SURVIVAL_READY" && displayView.survival && <section className="panel"><h2>누적 승점 탈락선 동률</h2><p>{displayView.survival.playerIds.map((id) => displayView.players.find((p) => p.playerId === id)?.name).join(" · ")}</p><strong>{displayView.survival.playerIds.length - displayView.survival.eliminateCount}명 생존 · {displayView.survival.eliminateCount}명 탈락</strong><p>보유 4장 중 정확히 2장 + 새 보드 3장으로 판정합니다. 승점·BB 보상은 없습니다. 다른 플레이어는 관전합니다.</p></section>}
        {displayView.phase === "SHOP" && displayView.me.alive && <><section className="shop-layout"><div className="inventory panel"><header><h2>{isSpectatingPlayer ? `${observedName} 카드` : "내 카드"} <em>{displayView.me.ownedCards.length} / {displayView.me.handLimit}</em></h2><div className="stat-block"><small>현재 스택</small><strong>{displayView.me.stackBB}<i>BB</i></strong></div></header><div className="card-row owned-row">{displayView.me.ownedCards.map((card) => <CardView key={card.id} card={card} onClick={!interactionDisabled && !displayView.me.committed && canSell ? () => send({ type: "SELL_CARD", cardId: card.id }) : undefined} footer={isSpectatingPlayer ? undefined : canSell ? "판매" : "판매 불가"} />)}<EmptyHandSlots count={displayView.me.ownedCards.length} limit={displayView.me.handLimit} /></div><p className="hint">{isSpectatingPlayer ? "관전 화면에서는 카드를 조작할 수 없습니다." : canSell ? `판매 환급 ${displayView.me.sellPercent}% · 판매 후 구매 횟수는 복구되지 않습니다.` : "남은 구매 횟수로 필수 보유 장수를 복구할 수 없어 더 이상 판매할 수 없습니다."}</p></div><div className="market panel"><header><div><h2>카드 마켓</h2></div><span className="purchase-count">구매 {displayView.me.purchases} / {displayView.me.purchaseLimit}</span></header><div className="card-row market-row">{displayView.me.shopCards.map(({ card, price }, index) => <ShopCard key={card.id} dealIndex={index} card={card} price={price} locked={displayView.me.lockedShopCardIds?.includes(card.id) ?? false} disabled={interactionDisabled || displayView.me.committed} onBuy={() => send({ type: "BUY_CARD", cardId: card.id })} onLock={() => send({ type: "LOCK_SHOP", cardId: card.id })} />)}</div><div className="market-actions"><button className="secondary" disabled={interactionDisabled || displayView.me.committed || allShopCardsLocked || displayView.me.rerollsUsed >= displayView.me.rerollLimit || displayView.me.stackBB < displayView.me.rerollCost} onClick={() => send({ type: "REROLL" })}>{pending === "REROLL" ? "REFRESHING…" : `리롤 ${displayView.me.rerollCost}BB`} · {displayView.me.rerollsUsed} / {displayView.me.rerollLimit}</button><span className="hint">{allShopCardsLocked ? "모든 카드가 잠겨 리롤할 수 없습니다." : "카드별 잠금 3BB · 해제 무료"}</span></div></div></section>
          {(displayView.round === 2) && <Selection key={`${displayView.round}:${displayView.me.playerId}:${displayView.me.ownedCards.map((c) => c.id).join()}`} view={displayView} send={send} disabled={interactionDisabled || displayView.me.committed} />}
          <div className="action-bar shop-ready-bar">
            <div className="shop-ready-copy"><p>{displayView.me.committed
              ? `다른 플레이어를 기다립니다 · 준비 ${readyHumans}/${totalHumans}`
              : `준비를 누르면 이번 상점에서는 더 행동할 수 없습니다 · 준비 ${readyHumans}/${totalHumans}`}</p>
              <small className="hint">전원이 준비하면 상점이 종료되고 쇼다운 확인 단계로 이동합니다.</small></div>
            {displayView.barrierEndsAt !== undefined && <ShopCountdown endsAt={displayView.barrierEndsAt} totalMs={BARRIER_TIMEOUT_MS.SHOP} now={now} committed={displayView.me.committed} />}
            <button className={displayView.me.committed ? "secondary" : "primary"} disabled={interactionDisabled || (!displayView.me.committed && (displayView.me.ownedCards.length !== displayView.me.handLimit || (displayView.round === 2 && displayView.me.selectedCardIds.length !== 2)))} onClick={() => send(displayView.me.committed ? { type: "CANCEL_SHOP_READY" } : { type: "END_SHOP_PHASE" })}>{displayView.me.committed ? "덱 준비 취소 · 다시 수정" : "준비 완료 · 구성 확정"}</button></div></>}
        {displayView.phase === "GAME_RESULT" && <><FinalResultsPanel view={displayView} /><section className="panel rematch-panel"><span className="eyebrow">NEXT GAME</span><h2>다음 선택</h2><p>새 게임은 현재 참가자의 준비가 끝나면 같은 방에서 시작됩니다.</p><div className="final-exit-actions"><button className="primary" disabled={disabled || meReadyForRematch || rematchHumans.length < 2} onClick={() => send({ type: "REMATCH_READY" })}>{meReadyForRematch ? `새 게임 대기 중 · ${rematchReady}/${rematchHumans.length}` : "새 게임 시작"}</button><button className="secondary" type="button" onClick={onHome}>홈으로</button></div></section></>}
        <RoundResults round={displayView.round} rows={displayView.roundSummary ?? []} viewerId={displayView.me.playerId} showBrackets={displayView.round === 4 && displayView.phase === "GROUP_ASSIGNMENT"} secondsLeft={displayView.phase === "ROUND_RESULT" ? secondsLeft : null}>{(displayView.roundHistory ?? displayView.matches).map((m) => <OnlineMatch key={m.id} match={m} view={displayView} />)}</RoundResults>
        {displayView.phase === "AUGMENT" && <section className="panel augment-panel"><header className="augment-heading"><h2>{displayView.me.augmentChoices.length ? "증강 하나를 선택하세요" : "다른 플레이어의 선택을 기다립니다"}</h2>{secondsLeft !== null && <div className="action-countdown" role="timer" aria-label={`${phases[displayView.phase]} 남은 시간 ${secondsLeft}초`}><small>남은 시간</small><strong>{formatCountdown(secondsLeft)}</strong></div>}</header><div className="augment-grid">{displayView.me.augmentChoices.map((a) => <button key={a.id} disabled={interactionDisabled} onClick={() => send({ type: "SELECT_AUGMENT", augmentId: a.id })}><b>{a.name}</b><p>{a.description}</p></button>)}</div></section>}
        {view.players.find((p) => p.playerId === view.me.playerId)?.departed && <p className="hint">방에서 나갔습니다. 이 좌석은 더 이상 진행을 막지 않습니다.</p>}
        {!["LOBBY", "OPEN_DRAFT", "RUN_LOADOUT", "SHOP", "AUGMENT", "GAME_RESULT"].includes(displayView.phase) && <div className="action-bar phase-ready-bar"><div className="phase-wait-copy"><b>{phases[displayView.phase]}</b><p>{displayView.phase === "NEXT_ROUND" ? "이번 라운드가 끝났습니다. 확인하면 다음 라운드 상점으로 이동합니다." : displayView.phase === "SHOWDOWN_PRIMARY" || displayView.phase === "SHOWDOWN_SECONDARY" ? "카드 구성이 확정되었습니다. 모두 확인하면 쇼다운을 시작합니다." : "결과를 확인해 주세요. 모두 확인하면 다음 단계로 이동합니다."}</p></div>{secondsLeft !== null && <div className="action-countdown" role="timer" aria-label={`${phases[displayView.phase]} 남은 시간 ${secondsLeft}초`}><small>남은 시간</small><strong>{formatCountdown(secondsLeft)}</strong></div>}<button className="primary" disabled={interactionDisabled || (displayView.phase === "SURVIVAL_READY" && !waitingOnMe) || displayView.players.find((p) => p.playerId === displayView.me.playerId)?.ready || (!view.me.alive && displayView.players.some((p) => p.human && p.alive))} onClick={() => send({ type: "READY" })}>{!waitingOnMe ? "확인 완료 · 다른 플레이어 대기" : displayView.phase === "NEXT_ROUND" ? "다음 라운드 상점으로" : displayView.phase === "SHOWDOWN_PRIMARY" || displayView.phase === "SHOWDOWN_SECONDARY" ? "쇼다운 시작 준비" : "확인 · 다음 단계"}</button></div>}
      </>
    </div>
  </main></CinematicGate>;
}
