import { useEffect, useRef, useState } from "react";
import type { GameAction, MatchView, PlayerView, ServerMessage, SessionCredential } from "../shared/protocol";
import { CinematicGate } from "./ShowdownCinematic";
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
import { OnlineScoreboard } from "./OnlineScoreboard";
import { EmptyHandSlots } from "./EmptyHandSlots";
import { RoundProgress } from "./PrepPhase";
import { createServerClock } from "./serverClock";
import { ShopCountdown } from "./ShopCountdown";
import { OnlineLoadout } from "./OnlineLoadout";
import { formatCountdown } from "./countdown";
import { preloadFinalArena } from "./finalShowdownPresentation";
import { preloadShowdownStage } from "./showdownStage";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { FinalResultsPanel } from "./FinalResultsPanel";
import { HighCardDrawResult } from "./HighCardDraw";
import { makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { OpenDraftPanel, RunLoadoutPanel } from "./OpenDraft";

/** How long a sent action may stay in flight before the UI unlocks itself. */
const ACTION_TIMEOUT_MS = 10_000;
const titles = ["", "TWO HAND", "RUN IT TWICE", "OMAHA DOUBLE", "BEST FIVE", "THE LAST HAND"];
const phases: Record<string, string> = { LOBBY: "입장 대기", SHOP: "상점", SHOWDOWN_PRIMARY: "1차 쇼다운 준비", GROUP_ASSIGNMENT: "그룹 배정", SHOWDOWN_SECONDARY: "2차 쇼다운 준비", ROUND_RESULT: "라운드 결과", AUGMENT: "증강 선택", NEXT_ROUND: "다음 라운드", GAME_RESULT: "최종 결과" };
Object.assign(phases, { DRAFT_ORDER: "드래프트 순서 공개", OPEN_DRAFT: "공개 드래프트", RUN_LOADOUT: "RUN 카드 배치", SURVIVAL_READY: "탈락선 생존 타이브레이크" });

function OnlineMatch({ match, view }: { match: MatchView; view: PlayerView }) {
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? id;
  const matchNumber = match.matchNumber;
  const stageLabel = match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : match.stage === "final" ? "최종전" : match.group === "winner" ? "승자조" : match.group === "loser" ? "생존전" : match.stage === "secondary" ? "2차전" : "1차전";
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
  if (view.round === 3) {
    return <section className="panel select-panel"><span className="eyebrow">ROUND 3 · LOADOUT</span><h2>Game 1과 Game 2 소켓에 카드를 배치하세요</h2><p>게임마다 2장씩 사용합니다. 두 게임은 서로 다른 보드로 진행됩니다.</p>
      <OnlineLoadout me={view.me} disabled={disabled} onChange={(slots) => send({ type: "SELECT_LOADOUT", slots })} /></section>;
  }
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
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState(() => localStorage.getItem("porena-nickname") ?? "플레이어");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<GameAction["type"] | false>(false);
  const [connectionKey, setConnectionKey] = useState(0);
  const [spectating, setSpectating] = useState(false);
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
      ws.onopen = () => ws.send(JSON.stringify({ type: "JOIN_ROOM", token: credential.token, nickname: localStorage.getItem("porena-nickname") ?? "플레이어" }));
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
          }
          setView(message.payload);
          if (pendingRequest.current?.revision !== undefined && message.payload.revision >= pendingRequest.current.revision) clearPending();
        }
        if (message.type === "ACK" && pendingRequest.current?.id === message.requestId) {
          if (pendingRequest.current.type === "LEAVE_ROOM") {
            forgetSession(credential.roomId);
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
    if (!/^[\p{L}\p{N} _-]{1,16}$/u.test(nickname.trim())) { setError("닉네임은 문자·숫자 1~16자로 입력하세요."); return; }
    localStorage.setItem("porena-nickname", nickname.trim());
    setBusy(true); setError("");
    try {
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
  const canSell = view ? canSellWithoutBlocking({ ownedCount: view.me.ownedCards.length, purchases: view.me.purchases,
    purchaseLimit: view.me.purchaseLimit, handLimit: view.me.handLimit }) : false;
  const screen = onlineScreen(credential, view);
  if (screen === "lobby") return <MultiplayerLobby nickname={nickname} onNickname={setNickname} roomCode={roomCode} onRoomCode={setRoomCode} busy={busy} error={error} sessions={resumable} onJoin={(create) => void join(create)} onResume={resume} onHome={onHome} />;
  if (screen === "connecting" || screen === "departed") return <OnlineEntryFrame title={screen === "departed" ? "퇴장한 방입니다" : "방에 연결하고 있습니다"} eyebrow="PRIVATE ARENA"><p className="entry-description">{credential?.roomId} · {statusLabel}</p>{error && <p className="room-error" role="alert">{error}</p>}<div className="entry-recovery">{screen === "connecting" && <button className="secondary" onClick={() => setConnectionKey((n) => n + 1)}>연결 다시 시도</button>}<button className="secondary" onClick={() => { if (screen === "departed" && credential) forgetSession(credential.roomId); returnToLobby(); }}>로비로 돌아가기</button></div></OnlineEntryFrame>;
  if (!view) return null;
  if (screen === "waiting") return <RoomWaitingRoom view={view} status={statusLabel} connected={status === "Connected"} pending={!!pending} error={error} onReady={() => send({ type: "READY" })} onLeave={leaveRoom} onRetry={() => setConnectionKey((n) => n + 1)} onReturn={returnToLobby} />;
  return <CinematicGate key={credential?.roomId ?? "lobby"} matches={view?.matches ?? []} profiles={view?.players ?? []} viewerId={view?.me.playerId ?? ""} presentation={view?.presentation} clock={serverClock}><main className={view && view.phase !== "LOBBY" ? "game-arena" : "arena-lobby"}><nav><button className="brand brand-home" type="button" onClick={onHome} aria-label="PORENA 메인 화면으로 이동"><span>P</span><div><b>PORENA</b><small>ONLINE · TACTICAL POKER AUTOBATTLER</small></div></button>{view && view.phase !== "LOBBY" ? <RoundProgress round={view.round} prep={null} /> : <span />}<div className="survivors"><small>CONNECTION</small><b className={credential ? `conn-${status.toLowerCase()}` : "conn-lobby"}>{credential ? statusLabel : "로비"}</b></div></nav>
    <div className="page-shell" id="top">
      {error && <p className="room-error" role="alert">{error}</p>}
      {status !== "Connected" && <div className="entry-recovery" role="status"><span>{statusLabel}</span><button className="secondary" onClick={() => setConnectionKey((n) => n + 1)}>연결 다시 시도</button><button className="secondary" onClick={returnToLobby}>로비로 돌아가기 · 방 유지</button></div>}
      {view && <>
        <header className="round-header"><div><span className="round-number">ROUND 0{view.round}</span><h1>{titles[view.round]}</h1></div><div className="phase-badge"><b>{phases[view.phase] ?? view.phase}</b></div></header>
        <OnlineScoreboard view={view} />
        {["DRAFT_ORDER", "OPEN_DRAFT"].includes(view.phase) && <OpenDraftPanel view={view} send={send} disabled={disabled} seconds={secondsLeft} />}
        {view.phase === "RUN_LOADOUT" && <RunLoadoutPanel view={view} send={send} disabled={disabled} seconds={secondsLeft} />}
        {view.phase === "SURVIVAL_READY" && view.survival && <section className="panel"><h2>누적 승점 탈락선 동률</h2><p>{view.survival.playerIds.map((id) => view.players.find((p) => p.playerId === id)?.name).join(" · ")}</p><strong>{view.survival.playerIds.length - view.survival.eliminateCount}명 생존 · {view.survival.eliminateCount}명 탈락</strong><p>보유 4장 중 정확히 2장 + 새 보드 3장으로 판정합니다. 승점·BB 보상은 없습니다. 다른 플레이어는 관전합니다.</p></section>}
        {view.phase === "SHOP" && view.me.alive && <><section className="shop-layout"><div className="inventory panel"><header><h2>내 카드 <em>{view.me.ownedCards.length} / {view.me.handLimit}</em></h2><div className="stat-block"><strong>{view.me.stackBB}<i>BB</i></strong></div></header><div className="card-row owned-row">{view.me.ownedCards.map((card) => <CardView key={card.id} card={card} onClick={!disabled && !view.me.committed && canSell ? () => send({ type: "SELL_CARD", cardId: card.id }) : undefined} footer={canSell ? "판매" : "판매 불가"} />)}<EmptyHandSlots count={view.me.ownedCards.length} limit={view.me.handLimit} /></div><p className="hint">{canSell ? `판매 환급 ${view.me.sellPercent}% · 판매 후 구매 횟수는 복구되지 않습니다.` : "남은 구매 횟수로 필수 보유 장수를 복구할 수 없어 더 이상 판매할 수 없습니다."}</p></div><div className="market panel"><header><h2>카드 마켓</h2><span className="purchase-count">구매 {view.me.purchases}/{view.me.purchaseLimit}</span></header><div className="card-row market-row">{view.me.shopCards.map(({ card, price }) => <ShopCard key={card.id} card={card} price={price} locked={view.me.lockedShopCardIds?.includes(card.id) ?? false} disabled={disabled || view.me.committed} onBuy={() => send({ type: "BUY_CARD", cardId: card.id })} onLock={() => send({ type: "LOCK_SHOP", cardId: card.id })} />)}</div><div className="market-actions"><button className="secondary" disabled={disabled || view.me.committed || view.me.rerollsUsed >= view.me.rerollLimit || view.me.stackBB < view.me.rerollCost} onClick={() => send({ type: "REROLL" })}>{pending === "REROLL" ? "REFRESHING…" : `리롤 ${view.me.rerollCost}BB`} · {Math.max(0, view.me.rerollLimit - view.me.rerollsUsed)} / {view.me.rerollLimit}</button><span className="hint">카드별 잠금 3BB · 해제 무료</span></div></div></section>
          {(view.round === 2 || view.round === 3) && <Selection key={`${view.round}:${view.me.ownedCards.map((c) => c.id).join()}`} view={view} send={send} disabled={disabled || view.me.committed} />}
          <div className="action-bar shop-ready-bar">
            <div className="shop-ready-copy"><p>{view.me.committed
              ? `다른 플레이어를 기다립니다 · 준비 ${readyHumans}/${totalHumans}`
              : `준비를 누르면 이번 상점에서는 더 행동할 수 없습니다 · 준비 ${readyHumans}/${totalHumans}`}</p>
              <small className="hint">전원이 준비하면 상점이 종료되고 쇼다운 확인 단계로 이동합니다.</small></div>
            {view.barrierEndsAt !== undefined && <ShopCountdown endsAt={view.barrierEndsAt} totalMs={BARRIER_TIMEOUT_MS.SHOP} now={now} committed={view.me.committed} />}
            <button className="primary" disabled={disabled || view.me.committed || view.me.ownedCards.length !== view.me.handLimit || (view.round === 2 && view.me.selectedCardIds.length !== 2)} onClick={() => send({ type: "END_SHOP_PHASE" })}>{view.me.committed ? "준비 완료 ✓" : "준비 완료 · 구성 확정"}</button></div></>}
        {view.phase === "GAME_RESULT" && <FinalResultsPanel view={view} />}
        <RoundResults round={view.round} rows={view.roundSummary ?? []} viewerId={view.me.playerId}>{(view.roundHistory ?? view.matches).map((m) => <OnlineMatch key={m.id} match={m} view={view} />)}</RoundResults>
        {view.phase === "AUGMENT" && <section className="panel augment-panel"><header className="augment-heading"><h2>{view.me.augmentChoices.length ? "증강 하나를 선택하세요" : "다른 플레이어의 선택을 기다립니다"}</h2>{secondsLeft !== null && <div className="action-countdown" role="timer" aria-label={`${phases[view.phase]} 남은 시간 ${secondsLeft}초`}><small>남은 시간</small><strong>{formatCountdown(secondsLeft)}</strong></div>}</header><div className="augment-grid">{view.me.augmentChoices.map((a) => <button key={a.id} disabled={disabled} onClick={() => send({ type: "SELECT_AUGMENT", augmentId: a.id })}><b>{a.name}</b><p>{a.description}</p></button>)}</div></section>}
        {!view.me.alive && !view.players.find((p) => p.playerId === view.me.playerId)?.departed && <section className="panel eliminated-panel"><h2>탈락했습니다</h2><p className="hint">남은 플레이어의 진행을 막지 않습니다. 관전하거나 방을 나갈 수 있습니다.</p><div className="room-controls">{spectating ? <span className="hint">관전 중 · 최종 결과까지 함께 볼 수 있습니다.</span> : <button className="secondary" onClick={() => setSpectating(true)}>관전하기</button>}<button className="secondary" disabled={disabled} onClick={leaveRoom}>방 나가기</button></div></section>}
        {view.players.find((p) => p.playerId === view.me.playerId)?.departed && <p className="hint">방에서 나갔습니다. 이 좌석은 더 이상 진행을 막지 않습니다.</p>}
        {!["LOBBY", "OPEN_DRAFT", "RUN_LOADOUT", "SHOP", "AUGMENT", "GAME_RESULT"].includes(view.phase) && <div className="action-bar phase-ready-bar"><div className="phase-wait-copy"><b>{phases[view.phase]}</b><p>{view.phase === "NEXT_ROUND" ? "이번 라운드가 끝났습니다. 확인하면 다음 라운드 상점으로 이동합니다." : view.phase === "SHOWDOWN_PRIMARY" || view.phase === "SHOWDOWN_SECONDARY" ? "카드 구성이 확정되었습니다. 모두 확인하면 쇼다운을 시작합니다." : "결과를 확인해 주세요. 모두 확인하면 다음 단계로 이동합니다."}</p></div>{secondsLeft !== null && <div className="action-countdown" role="timer" aria-label={`${phases[view.phase]} 남은 시간 ${secondsLeft}초`}><small>남은 시간</small><strong>{formatCountdown(secondsLeft)}</strong></div>}<button className="primary" disabled={disabled || (view.phase === "SURVIVAL_READY" && !waitingOnMe) || view.players.find((p) => p.playerId === view.me.playerId)?.ready || (!view.me.alive && view.players.some((p) => p.human && p.alive))} onClick={() => send({ type: "READY" })}>{!waitingOnMe ? "확인 완료 · 다른 플레이어 대기" : view.phase === "NEXT_ROUND" ? "다음 라운드 상점으로" : view.phase === "SHOWDOWN_PRIMARY" || view.phase === "SHOWDOWN_SECONDARY" ? "쇼다운 시작 준비" : "확인 · 다음 단계"}</button></div>}
      </>}
    </div>
  </main></CinematicGate>;
}
