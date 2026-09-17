import { useEffect, useRef, useState } from "react";
import type { GameAction, MatchView, PlayerView, ServerMessage, SessionCredential } from "../shared/protocol";
import { CinematicGate } from "./ShowdownCinematic";
import { ShopCard } from "./ShopCard";
import { CardView } from "./CardView";
import { ShowdownHand } from "./ShowdownHand";
import { RunWinner } from "./RunItTwiceResult";
import { madeTone } from "./madeTone";
import { canSellWithoutBlocking } from "../game/shopRules";

const SESSION_KEY = "holto-room-session-v1";
const displayPoints = (value: number) => Number(value.toFixed(2));
function savedSession(): SessionCredential | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
    return v && /^[A-Z2-9]{6}$/.test(v.roomId) && /^[a-f0-9]{64}$/.test(v.token) ? v : null;
  } catch { return null; }
}
const titles = ["", "TWO HAND", "RUN IT TWICE", "OMAHA DOUBLE", "BEST FIVE", "THE LAST HAND"];
const phases: Record<string, string> = { LOBBY: "입장 대기", SHOP: "상점", SHOWDOWN_PRIMARY: "1차 쇼다운 준비", GROUP_ASSIGNMENT: "그룹 배정", SHOWDOWN_SECONDARY: "2차 쇼다운 준비", ROUND_RESULT: "라운드 결과", AUGMENT: "증강 선택", NEXT_ROUND: "다음 라운드", GAME_RESULT: "최종 결과" };

function OnlineMatch({ match, view }: { match: MatchView; view: PlayerView }) {
  const name = (id: string) => view.players.find((p) => p.playerId === id)?.name ?? id;
  const matchNumber = match.matchNumber;
  const stageLabel = match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : match.stage === "final" ? "최종전" : match.group === "winner" ? "승자조" : match.group === "loser" ? "생존전" : match.stage === "secondary" ? "2차전" : "1차전";
  const outcomeLabel = match.stage === "final" ? "최종 1위" : match.group === "loser" ? "생존" : "승리";
  return <article className="match-card">
    <header><span>매치 {matchNumber} · {stageLabel}</span><b>♔ {match.winnerIds.map(name).join(", ")} {outcomeLabel}</b><em>{match.suddenDeathCount ? `타이브레이크 ${match.suddenDeathCount}회` : ""}</em></header>
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
      return result ? <div key={id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{name(id)}</b>{reward && <em>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))}P</em>}</div>{reward?.detail?.includes("ICM") && <p className="combatant-detail">{reward.detail}</p>}<ShowdownHand cards={match.revealedCards[id] ?? []} usedCardIds={result.usedCardIds} winner={winner} displayName={result.displayName} category={result.category} kickers={result.kickers} /></div> : null;
    })}</div>
  </article>;
}
function Selection({ view, send, disabled }: { view: PlayerView; send: (a: GameAction) => void; disabled: boolean }) {
  const [selected, setSelected] = useState(view.me.selectedCardIds);
  const required = view.round === 3 ? 4 : 2;
  return <section className="panel select-panel"><h2>{view.round === 3 ? "R3 · Game 1 / Game 2 카드 분할" : "R2 출전 카드 2장"}</h2>{view.round === 3 && <p>먼저 고른 2장은 Game 1, 다음 2장은 Game 2에 배정됩니다.</p>}<div className="card-row centered">{view.me.ownedCards.map((card) => { const index = selected.indexOf(card.id); const footer = index < 0 ? "선택" : view.round === 3 ? index < 2 ? "GAME 1" : "GAME 2" : "선택됨"; return <CardView key={card.id} card={card} selected={index >= 0} footer={footer} onClick={() => setSelected((ids) => ids.includes(card.id) ? ids.filter((id) => id !== card.id) : ids.length < required ? [...ids, card.id] : ids)} />; })}</div><button className="secondary" disabled={disabled || selected.length !== required} onClick={() => send({ type: "SELECT_CARDS", cardIds: selected })}>출전 선택 저장</button><p className="hint">서버에 저장된 선택: {view.me.selectedCardIds.join(", ") || "없음"}</p></section>;
}
export function OnlineApp() {
  const [credential, setCredential] = useState<SessionCredential | null>(savedSession);
  const [view, setView] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<GameAction["type"] | false>(false);
  const [connectionKey, setConnectionKey] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const pendingRequest = useRef<{ id: string; type: string; revision?: number } | null>(null);

  useEffect(() => {
    if (!credential) return;
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (disposed) return;
      setStatus("Connecting"); pendingRequest.current = null; setPending(false);
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/rooms/${credential.roomId}`);
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "JOIN_ROOM", token: credential.token }));
      ws.onmessage = (event) => {
        if (disposed) return;
        const message = JSON.parse(event.data) as ServerMessage;
        // Opt-in local diagnostics: exact received views, never session credentials.
        if (import.meta.env.DEV && new URLSearchParams(location.search).has("inspect") && message.type === "PLAYER_VIEW") console.debug("[Holto WS received]", JSON.stringify(message));
        if (message.type === "ROOM_JOINED") { setStatus("Connected"); attempts = 0; setError(""); }
        if (message.type === "PLAYER_VIEW") {
          setView(message.payload);
          if (pendingRequest.current?.revision !== undefined && message.payload.revision >= pendingRequest.current.revision) { pendingRequest.current = null; setPending(false); }
        }
        if (message.type === "ACK" && pendingRequest.current?.id === message.requestId) pendingRequest.current.revision = message.revision;
        if (message.type === "ERROR") { if (!message.requestId || message.requestId === pendingRequest.current?.id) { pendingRequest.current = null; setPending(false); } setError(message.message); }
      };
      ws.onclose = (event) => {
        if (disposed) return;
        setStatus("Disconnected"); pendingRequest.current = null; setPending(false);
        if (event.code === 1008 || event.code === 4001 || attempts >= 5) return;
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
      };
      ws.onerror = () => { if (!disposed) setError("연결을 확인하고 재접속하세요."); };
    };
    connect();
    return () => { disposed = true; clearTimeout(timer); socket.current?.close(1000, "Leaving view"); socket.current = null; };
  }, [credential, connectionKey]);

  const join = async (create: boolean) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(create ? "/api/rooms" : `/api/rooms/${roomCode.trim().toUpperCase()}/join`, { method: "POST" });
      if (!response.ok) throw new Error(response.status === 404 ? "방을 찾을 수 없습니다." : "방이 시작되었거나 입장할 수 없습니다.");
      const session = await response.json() as SessionCredential;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setView(null); setCredential(session);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "입장 실패"); }
    finally { setBusy(false); }
  };
  const send = (action: GameAction) => {
    if (!view || socket.current?.readyState !== WebSocket.OPEN || status !== "Connected" || pendingRequest.current) return;
    const requestId = crypto.randomUUID();
    pendingRequest.current = { id: requestId, type: action.type };
    setPending(action.type); setError("");
    try { socket.current.send(JSON.stringify({ ...action, requestId, turnKey: view.turnKey })); }
    catch { pendingRequest.current = null; setPending(false); setError("전송하지 못했습니다. 재접속하세요."); }
  };
  const disabled = status !== "Connected" || !!pending;
  const canSell = view ? canSellWithoutBlocking({ ownedCount: view.me.ownedCards.length, purchases: view.me.purchases,
    purchaseLimit: view.me.purchaseLimit, handLimit: view.me.handLimit }) : false;
  return <CinematicGate key={credential?.roomId ?? "lobby"} matches={view?.matches ?? []} profiles={view?.players ?? []} viewerId={view?.me.playerId ?? ""}><main><nav><a className="brand" href="#top"><span>H</span><div><b>HOLTO CHESS</b><small>ONLINE · PROTOTYPE</small></div></a><div className="survivors"><small>CONNECTION</small><b>{status}</b></div></nav>
    <div className="page-shell" id="top">
      <section className="panel room-panel"><h2>온라인 게임방</h2>{!credential ? <div className="room-controls"><button className="primary" disabled={busy} onClick={() => void join(true)}>Create Room</button><label>Room Code<input aria-label="Room Code" value={roomCode} maxLength={6} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="AB12CD" /></label><button className="secondary" disabled={busy || !/^[A-Z2-9]{6}$/.test(roomCode.trim())} onClick={() => void join(false)}>Join Room</button></div> : <><p>Room ID: <strong data-testid="room-id">{credential.roomId}</strong> · Player ID: <strong data-testid="player-id">{credential.playerId}</strong> · Players {view?.humanCount ?? "…"} / 8</p><div className="room-controls"><button className="secondary" onClick={() => setConnectionKey((n) => n + 1)}>재접속</button><button className="secondary" onClick={() => { sessionStorage.removeItem(SESSION_KEY); setCredential(null); setView(null); setStatus("Disconnected"); }}>세션 지우기</button></div></>}
        <p className="hint">실제 사용자 2~8명 · 시작 시 빈 좌석은 AI가 채웁니다. 같은 방 코드를 다른 탭이나 브라우저에 입력하세요. 재접속 정보는 이 탭에만 저장됩니다.</p></section>
      {error && <p className="room-error" role="alert">{error}</p>}
      {view && <>
        <header className="round-header"><div><span className="round-number">ROUND 0{view.round}</span><h1>{titles[view.round]}</h1></div><div className="phase-badge"><b>{phases[view.phase] ?? view.phase}</b></div></header>
        <div className="player-strip">{view.players.map((p) => <div className={`player-chip ${p.playerId === view.me.playerId ? "me" : ""} ${!p.alive ? "out" : ""}`} key={p.playerId}><span className="player-avatar">{p.playerId.slice(1)}</span><span><b>{p.name} {p.human ? "" : "AI"}</b><small>{p.alive ? `${p.stackBB}BB · ${displayPoints(p.points)}P` : "OUT"} {p.ready ? "✓" : ""}</small></span></div>)}</div>
        {view.phase === "LOBBY" ? <section className="panel transition-panel"><h2>모두 준비하면 시작합니다</h2><p>최소 2명의 사용자와 각자의 준비 완료가 필요합니다.</p><button className="primary" disabled={disabled || view.players.find((p) => p.playerId === view.me.playerId)?.ready} onClick={() => send({ type: "READY" })}>READY · 준비 완료</button></section> : null}
        {view.phase === "SHOP" && view.me.alive && <><section className="shop-layout"><div className="inventory panel"><header><h2>내 카드 <em>{view.me.ownedCards.length} / {view.me.handLimit}</em></h2><div className="stat-block"><strong>{view.me.stackBB}<i>BB</i></strong></div></header><div className="card-row owned-row">{view.me.ownedCards.map((card) => <CardView key={card.id} card={card} onClick={!disabled && !view.me.committed && canSell ? () => send({ type: "SELL_CARD", cardId: card.id }) : undefined} footer={canSell ? "판매" : "판매 불가"} />)}</div><p className="hint">{canSell ? `판매 환급 ${view.me.sellPercent}% · 판매 후 구매 횟수는 복구되지 않습니다.` : "남은 구매 횟수로 필수 보유 장수를 복구할 수 없어 더 이상 판매할 수 없습니다."}</p></div><div className="market panel"><header><h2>카드 마켓</h2><span className="purchase-count">구매 {view.me.purchases}/{view.me.purchaseLimit}</span></header><div className="card-row market-row">{view.me.shopCards.map(({ card, price }) => <ShopCard key={card.id} card={card} price={price} locked={view.me.lockedShopCardIds?.includes(card.id) ?? false} disabled={disabled || view.me.committed} onBuy={() => send({ type: "BUY_CARD", cardId: card.id })} onLock={() => send({ type: "LOCK_SHOP", cardId: card.id })} />)}</div><div className="market-actions"><button className="secondary" disabled={disabled || view.me.committed || view.me.rerollsUsed >= view.me.rerollLimit || view.me.stackBB < view.me.rerollCost} onClick={() => send({ type: "REROLL" })}>{pending === "REROLL" ? "REFRESHING…" : `리롤 ${view.me.rerollCost}BB`} · {Math.max(0, view.me.rerollLimit - view.me.rerollsUsed)} / {view.me.rerollLimit}</button><span className="hint">카드별 잠금 3BB · 해제 무료</span></div></div></section>
          {(view.round === 2 || view.round === 3) && <Selection key={`${view.round}:${view.me.ownedCards.map((c) => c.id).join()}`} view={view} send={send} disabled={disabled || view.me.committed} />}
          <div className="action-bar"><p>{view.me.committed ? "다른 플레이어의 구성 확정을 기다립니다." : "구성을 확정하면 이번 상점에서는 더 행동할 수 없습니다."}</p><button className="primary" disabled={disabled || view.me.committed} onClick={() => send({ type: "END_SHOP_PHASE" })}>구성 확정</button></div></>}
        <section className="matches">{view.matches.map((m) => <OnlineMatch key={m.id} match={m} view={view} />)}</section>
        {view.phase === "AUGMENT" && <section className="panel augment-panel"><h2>{view.me.augmentChoices.length ? "증강 하나를 선택하세요" : "다른 플레이어의 선택을 기다립니다"}</h2><div className="augment-grid">{view.me.augmentChoices.map((a) => <button key={a.id} disabled={disabled} onClick={() => send({ type: "SELECT_AUGMENT", augmentId: a.id })}><b>{a.name}</b><p>{a.description}</p></button>)}</div></section>}
        {!view.me.alive && <p className="hint">탈락했습니다. 재입장해도 동일한 좌석과 탈락 상태가 유지됩니다.</p>}
        {!["LOBBY", "SHOP", "AUGMENT", "GAME_RESULT"].includes(view.phase) && <div className="action-bar"><b>{phases[view.phase]}</b><button className="primary" disabled={disabled || view.players.find((p) => p.playerId === view.me.playerId)?.ready || (!view.me.alive && view.players.some((p) => p.human && p.alive))} onClick={() => send({ type: "READY" })}>확인 · 다음 단계</button></div>}
        {view.phase === "GAME_RESULT" && <section className="panel final-panel"><h2>최종 결과</h2><p className="formula">누적 승점 + 족보 점수 + ⌊BB ÷ 10⌋</p><div className="standings">{view.standings.map((s, i) => <div className={`standing ${i === 0 ? "champion" : ""}`} key={s.playerId}><strong>{i + 1}</strong><span><b>{view.players.find((p) => p.playerId === s.playerId)?.name}</b><small>{s.displayName}</small></span><span>{displayPoints(s.points)}<small>승점</small></span><span>{s.handScore}<small>족보</small></span><span>{s.stackScore}<small>스택</small></span><em>{displayPoints(s.total)} P</em></div>)}</div></section>}
      </>}
    </div>
  </main></CinematicGate>;
}
