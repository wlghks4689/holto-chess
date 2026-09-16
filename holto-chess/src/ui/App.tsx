import { useMemo, useState } from "react";
import { assertPoolIntegrity } from "../game/cardPool";
import { BALANCE } from "../game/config";
import {
  beginSecondary, buyCard, chooseAugment, confirmSelection, createGame, finalStandings, leaveRoundResult,
  getCard, getCardPrice, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary,
  sellCard, startNextRound, toggleSelectedCard, toggleShopLock,
} from "../game/engine";
import type { HoltoChessGameState, MatchResult, Phase } from "../game/types";
import { ShopCard } from "./ShopCard";
import { CardView } from "./CardView";
import { ShowdownHand } from "./ShowdownHand";
import { madeTone } from "./madeTone";

const ROUND_COPY = {
  1: { title: "TWO HAND", rule: "홀 2 + 매치별 보드 5 · Hold’em", cap: 2 },
  2: { title: "RUN IT TWICE", rule: "3장 중 2장 선택 · 매치별 두 보드", cap: 3 },
  3: { title: "OMAHA", rule: "홀 정확히 2 + 보드 정확히 3", cap: 4 },
  4: { title: "BEST FIVE", rule: "홀 5 + 보드 5 중 자유 BEST 5", cap: 5 },
  5: { title: "THE LAST HAND", rule: "커뮤니티 보드 없이 보유 7장", cap: 7 },
} as const;

const PHASE_LABEL: Record<Phase, string> = {
  SHOP: "상점", DECK_SELECT: "출전 카드 선택", SHOWDOWN_PRIMARY: "1차 쇼다운", GROUP_ASSIGNMENT: "그룹 배정",
  SHOWDOWN_SECONDARY: "2차 쇼다운", ROUND_RESULT: "라운드 결과", AUGMENT: "증강 선택", NEXT_ROUND: "라운드 전환", GAME_RESULT: "최종 결과",
};

function PoolMeter({ state }: { state: HoltoChessGameState }) {
  const counts = state.ownershipCardPool.reduce((acc, entry) => ({ ...acc, [entry.state]: acc[entry.state] + 1 }), { AVAILABLE: 0, RESERVED_IN_SHOP: 0, OWNED: 0 });
  const valid = (() => { try { return assertPoolIntegrity(state); } catch { return false; } })();
  return <div className="pool-meter">
    <span className={`integrity ${valid ? "ok" : "bad"}`}>{valid ? "✓ 52 UNIQUE" : "! POOL ERROR"}</span>
    <span><i className="dot available" /> 가용 {counts.AVAILABLE}</span>
    <span><i className="dot reserved" /> 예약 {counts.RESERVED_IN_SHOP}</span>
    <span><i className="dot owned" /> 소유 {counts.OWNED}</span>
  </div>;
}

function PlayerStrip({ state }: { state: HoltoChessGameState }) {
  return <div className="player-strip">{state.players.map((player) => <div key={player.id} className={`player-chip ${player.id === "p1" ? "me" : ""} ${player.eliminated ? "out" : ""}`}>
    <span className="player-avatar">{player.eliminated ? "×" : player.id === "p1" ? "♔" : player.id.slice(1)}</span>
    <span><b>{player.name}</b><small>{player.eliminated ? `R${player.eliminatedRound} OUT` : `${player.stackBB}BB · ${player.points}P`}</small></span>
  </div>)}</div>;
}

function ShopPanel({ state, act }: { state: HoltoChessGameState; act: (fn: (s: HoltoChessGameState) => HoltoChessGameState) => void }) {
  const me = state.players[0]!; const cap = BALANCE.handLimits[state.round];
  return <section className="shop-layout">
    <div className="inventory panel">
      <header><div><span className="eyebrow">PRIVATE INVENTORY</span><h2>내 카드 <em>{me.ownedCardIds.length} / {cap}</em></h2></div><div className="stat-block"><small>사용 BB</small><strong>{me.stackBB}<i>BB</i></strong></div></header>
      <div className="card-row owned-row">{me.ownedCardIds.map((id) => <CardView key={id} card={getCard(state, id)} onClick={() => act((s) => sellCard(s, me.id, id))} footer="판매" />)}
        {Array.from({ length: Math.max(0, cap - me.ownedCardIds.length) }, (_, i) => <div className="empty-card" key={i}><span>+</span><small>EMPTY</small></div>)}</div>
      <p className="hint">카드를 누르면 기준가의 {me.augments.some((a) => a.id === "sell_bonus") ? "80" : "60"}%에 판매합니다. 판매 후에도 라운드 구매 횟수는 복구되지 않습니다.</p>
    </div>
    <div className="market panel">
      <header><div><span className="eyebrow">RESERVED FOR YOU</span><h2>카드 마켓 <em>{me.shopCardIds.length} / {me.shopSize}</em></h2></div><span className="purchase-count">구매 {me.purchasesThisRound}/{BALANCE.maxPurchasesPerRound}</span></header>
      <div className="card-row market-row">{me.shopCardIds.map((id) => <ShopCard key={id} card={getCard(state, id)} price={getCardPrice(state, me.id, id)} locked={me.lockedShopCardIds?.includes(id) ?? false} onBuy={() => act((s) => buyCard(s, me.id, id))} onLock={() => act((s) => toggleShopLock(s, me.id, id))} />)}
        {!me.shopCardIds.length ? <p className="market-empty">상점 카드가 모두 소진되었습니다.</p> : null}</div>
      <div className="market-actions"><button className="secondary" onClick={() => act((s) => rerollShop(s, me.id))}>↻ 리롤 <b>{Math.max(0, BALANCE.rerollCostBB - (me.augments.some((a) => a.id === "reroll_discount") ? 2 : 0))}BB</b></button><span className="hint">카드별 잠금 3BB · 해제 무료</span></div>
    </div>
  </section>;
}

function SelectPanel({ state, act }: { state: HoltoChessGameState; act: (fn: (s: HoltoChessGameState) => HoltoChessGameState) => void }) {
  const me = state.players[0]!;
  return <section className="panel select-panel"><span className="eyebrow">ROUND 2 · LOADOUT</span><h2>Run It Twice에 사용할 2장을 선택하세요</h2><p>선택하지 않은 카드는 계속 소유합니다. 두 보드와 Sudden Death에서도 같은 홀카드를 사용합니다.</p><div className="card-row centered">{me.ownedCardIds.map((id) => <CardView key={id} card={getCard(state, id)} selected={me.selectedCardIds.includes(id)} onClick={() => act((s) => toggleSelectedCard(s, me.id, id))} footer={me.selectedCardIds.includes(id) ? "선택됨" : "선택"} />)}</div></section>;
}

function MatchCard({ state, match, matchNumber }: { state: HoltoChessGameState; match: MatchResult; matchNumber: number }) {
  const winnerNames = match.winnerIds.map((id) => state.players.find((p) => p.id === id)!.name).join(", ");
  return <article className="match-card">
    <header><span>{match.stage === "primary" ? "PRIMARY" : match.stage === "secondary" ? "SECONDARY" : "FINAL"}</span><b>♔ {winnerNames}</b>{match.suddenDeathCount ? <em>SD ×{match.suddenDeathCount}</em> : null}</header>
    {match.boards.length ? <div className={`boards ${match.boards.length > 1 ? "multi-board" : ""}`}>{match.boards.map((board, boardIndex) => {
      const winners = match.boardWinnerIds[boardIndex] ?? [];
      const winnerUsed = new Set((match.boardResults[boardIndex] ?? []).filter((result) => winners.includes(result.playerId)).flatMap((result) => result.usedCardIds));
      const label = boardIndex < match.runoutCount ? (match.runoutCount > 1 ? `BOARD ${boardIndex + 1}` : "COMMUNITY BOARD") : `SUDDEN DEATH ${boardIndex - match.runoutCount + 1}`;
      return <div className={`board made-${madeTone((match.boardResults[boardIndex] ?? []).find((r) => winners.includes(r.playerId))?.hand.displayName ?? "")} ${boardIndex >= match.runoutCount ? "sudden-board" : ""}`} key={`${match.id}-board-${boardIndex}`}><small>{label} - MATCH {matchNumber}</small><div className="card-row centered">{board.map((card) => <CardView key={card.id} card={card} compact glow={winnerUsed.has(card.id)} dimmed={!winnerUsed.has(card.id)} />)}</div></div>;
    })}</div> : <div className="no-board">NO COMMUNITY · THE LAST HAND</div>}
    <div className={`combatants ${match.playerIds.length > 2 ? "multi" : ""}`}>{[...match.results].sort((a, b) => a.place - b.place).map((result) => {
      const player = state.players.find((p) => p.id === result.playerId)!; const winner = match.winnerIds.includes(player.id); const shownIds = state.round === 2 ? player.selectedCardIds : player.ownedCardIds;
      return <div key={player.id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{player.name}</b></div><ShowdownHand cards={shownIds.map((id) => getCard(state, id))} usedCardIds={result.usedCardIds} winner={winner} displayName={result.hand.displayName} category={result.hand.category} kickers={result.hand.kickers} /></div>;
    })}</div>
  </article>;
}

function ShowdownPanel({ state }: { state: HoltoChessGameState }) {
  if (!state.roundResults.length) return <section className="arena-empty panel"><span className="arena-mark">♞</span><h2>쇼다운 준비 완료</h2><p>각 매치는 참가자가 소유한 모든 카드를 제외한 독립 Showdown Deck으로 진행됩니다.</p></section>;
  return <section className="matches">{state.roundResults.map((match, index) => <MatchCard state={state} match={match} matchNumber={index + 1} key={match.id} />)}</section>;
}

function AugmentPanel({ state, act }: { state: HoltoChessGameState; act: (fn: (s: HoltoChessGameState) => HoltoChessGameState) => void }) {
  return <section className="panel augment-panel"><span className="eyebrow">AUGMENT DRAFT</span><h2>전략을 바꿀 증강 하나를 선택하세요</h2><div className="augment-grid">{state.augmentChoices.map((augment, index) => <button key={augment.id} onClick={() => act((s) => chooseAugment(s, "p1", augment.id))}><span>0{index + 1}</span><b>{augment.name}</b><p>{augment.description}</p><em>선택하기 →</em></button>)}</div></section>;
}

function FinalPanel({ state }: { state: HoltoChessGameState }) {
  const standings = finalStandings(state);
  return <section className="final-panel panel"><span className="eyebrow">FINAL SCORE</span><h2>{state.players.find((p) => p.id === standings[0]?.playerId)?.name} 우승</h2><p className="formula">누적 승점 + 족보 점수 + ⌊보유 BB ÷ 10⌋</p><div className="standings">{standings.map((row, index) => <div className={`standing ${index === 0 ? "champion" : ""}`} key={row.playerId}><strong>{index + 1}</strong><span><b>{state.players.find((p) => p.id === row.playerId)?.name}</b><small>{row.hand?.displayName}</small></span><span>{row.points}<small>승점</small></span><span>{row.handScore}<small>족보</small></span><span>{row.stackScore}<small>스택</small></span><em>{row.total} P</em></div>)}</div></section>;
}

function ActionBar({ state, act, reset }: { state: HoltoChessGameState; act: (fn: (s: HoltoChessGameState) => HoltoChessGameState) => void; reset: () => void }) {
  const me = state.players[0]!; let label = "계속"; let fn: ((s: HoltoChessGameState) => HoltoChessGameState) | null = null;
  if (state.phase === "SHOP") { label = `구성 확정 · R${state.round} 쇼다운`; fn = prepareShowdown; }
  if (state.phase === "DECK_SELECT") { label = `선택 확정 (${me.selectedCardIds.length}/2)`; fn = confirmSelection; }
  if (state.phase === "SHOWDOWN_PRIMARY") { label = state.round === 5 ? "The Last Hand 공개" : "1차 쇼다운 공개"; fn = resolvePrimary; }
  if (state.phase === "GROUP_ASSIGNMENT") { label = "브래킷 확인 · 2차전"; fn = beginSecondary; }
  if (state.phase === "SHOWDOWN_SECONDARY") { label = "새 매치 보드 공개"; fn = resolveSecondary; }
  if (state.phase === "ROUND_RESULT") { label = state.round === 2 || state.round === 4 ? "증강 드래프트" : "라운드 마감"; fn = leaveRoundResult; }
  if (state.phase === "NEXT_ROUND") { label = `R${state.round + 1} 상점으로`; fn = startNextRound; }
  return <div className="action-bar"><div><small>NEXT ACTION</small><b>{fn ? label : "게임 종료"}</b></div>{fn ? <button className="primary" onClick={() => act(fn!)} disabled={state.phase === "DECK_SELECT" && me.selectedCardIds.length !== 2}>{label}<span>→</span></button> : <button className="primary" onClick={reset}>새 게임<span>↻</span></button>}</div>;
}

export function App() {
  const [state, setState] = useState(() => createGame()); const [error, setError] = useState<string | null>(null);
  const act = (fn: (s: HoltoChessGameState) => HoltoChessGameState) => { try { setState(fn(state)); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "작업을 완료하지 못했습니다."); } };
  const round = ROUND_COPY[state.round]; const alive = state.players.filter((player) => !player.eliminated).length;
  const progress = useMemo(() => Array.from({ length: 5 }, (_, index) => index + 1), []);
  return <main>
    <nav><a className="brand" href="#top"><span>H</span><div><b>HOLTO CHESS</b><small>POKER AUTOBATTLER · PROTOTYPE 01</small></div></a><div className="round-progress">{progress.map((n) => <span key={n} className={`${n === state.round ? "active" : ""} ${n < state.round ? "done" : ""}`}><i>{n < state.round ? "✓" : n}</i><small>R{n}</small></span>)}</div><div className="survivors"><small>SURVIVORS</small><b>{alive}<i>/ 8</i></b></div></nav>
    <div id="top" className="page-shell">
      <header className="round-header"><div><span className="round-number">ROUND 0{state.round}</span><h1>{round.title}</h1><p>{round.rule}</p></div><div className="phase-badge"><small>CURRENT PHASE</small><b>{PHASE_LABEL[state.phase]}</b><span>{state.round === 5 ? "COMMUNITY OFF" : "MATCH-SCOPED BOARD"}</span></div></header>
      <PoolMeter state={state} />
      <PlayerStrip state={state} />
      {error ? <div className="error-toast" role="alert"><span>!</span>{error}<button onClick={() => setError(null)}>×</button></div> : null}
      {state.phase === "SHOP" ? state.players[0]!.eliminated ? <section className="panel transition-panel"><span>OUT</span><h2>관전 모드</h2><p>내 카드는 공용 풀로 반환되었습니다. 남은 플레이어의 매치별 Community Board와 토너먼트 결과를 계속 확인할 수 있습니다.</p></section> : <ShopPanel state={state} act={act} /> : null}
      {state.phase === "DECK_SELECT" ? <SelectPanel state={state} act={act} /> : null}
      {["SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT"].includes(state.phase) ? <ShowdownPanel state={state} /> : null}
      {state.phase === "AUGMENT" ? <AugmentPanel state={state} act={act} /> : null}
      {state.phase === "NEXT_ROUND" ? <section className="panel transition-panel"><span>R{state.round}</span><h2>라운드 종료</h2><p>{alive}명이 다음 라운드로 진출합니다. 탈락자의 모든 소유·예약 카드는 공용 풀로 반환되었습니다.</p></section> : null}
      {state.phase === "GAME_RESULT" ? <FinalPanel state={state} /> : null}
      <ActionBar state={state} act={act} reset={() => setState(createGame())} />
      <section className="event-log"><header><span className="eyebrow">MATCH FEED</span><b>최근 이벤트</b></header>{state.logs.map((entry) => <p key={entry.id} className={entry.tone}><i>0{entry.id}</i>{entry.message}</p>)}</section>
    </div>
  </main>;
}
