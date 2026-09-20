import { useEffect, useState } from "react";
import { assertPoolIntegrity } from "../game/cardPool";
import { BALANCE, purchaseLimitFor, rerollLimitFor } from "../game/config";
import {
  beginSecondary, buyCard, chooseAugment, confirmSelection, createGame, finalStandings, leaveRoundResult,
  getCard, getCardPrice, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary,
  sellCard, startNextRound, toggleSelectedCard, toggleShopLock,
} from "../game/engine";
import type { PorenaGameState, MatchResult, Phase } from "../game/types";
import { createMatchView } from "../game/matchView";
import { canSellWithoutBlocking } from "../game/shopRules";
import { CinematicGate } from "./ShowdownCinematic";
import { ShopCard } from "./ShopCard";
import { CardView } from "./CardView";
import { ShowdownHand } from "./ShowdownHand";
import { RunWinner } from "./RunItTwiceResult";
import { madeTone } from "./madeTone";
import { RoundGuide } from "./RoundGuide";
import { RoundResults } from "./RoundResults";
import { createRoundSummary, roundMatches } from "../game/roundSummary";
import { PrepRoundHeader, RoundProgress } from "./PrepPhase";
import { getPrepPresentation } from "./prepPresentation";
import { LoadoutSockets } from "./LoadoutSockets";
import { preloadFinalArena } from "./finalShowdownPresentation";
import { preloadShowdownStage } from "./showdownStage";

const displayPoints = (value: number) => Number(value.toFixed(2));

const ROUND_COPY = {
  1: { title: "TWO HAND", rule: "홀 2 + 매치별 보드 5 · Hold’em", cap: 2 },
  2: { title: "RUN IT TWICE", rule: "3장 중 2장 선택 · 매치별 두 보드", cap: 3 },
  3: { title: "OMAHA DOUBLE", rule: "4장을 2장씩 분할 · 독립 보드 2게임", cap: 4 },
  4: { title: "BEST FIVE", rule: "홀 5 + 보드 5 중 자유 BEST 5", cap: 5 },
  5: { title: "THE LAST HAND", rule: "커뮤니티 보드 없이 보유 7장", cap: 7 },
} as const;

const PHASE_LABEL: Record<Phase, string> = {
  SHOP: "상점", DECK_SELECT: "출전 카드 선택", SHOWDOWN_PRIMARY: "1차 쇼다운", GROUP_ASSIGNMENT: "그룹 배정",
  SHOWDOWN_SECONDARY: "2차 쇼다운", ROUND_RESULT: "라운드 결과", AUGMENT: "증강 선택", NEXT_ROUND: "라운드 전환", GAME_RESULT: "최종 결과",
};

function PoolMeter({ state }: { state: PorenaGameState }) {
  const counts = state.ownershipCardPool.reduce((acc, entry) => ({ ...acc, [entry.state]: acc[entry.state] + 1 }), { AVAILABLE: 0, RESERVED_IN_SHOP: 0, OWNED: 0 });
  const valid = (() => { try { return assertPoolIntegrity(state); } catch { return false; } })();
  return <div className="pool-meter">
    <span className={`integrity ${valid ? "ok" : "bad"}`}>{valid ? "✓ 52 UNIQUE" : "! POOL ERROR"}</span>
    <span><i className="dot available" /> 남은 카드 {counts.AVAILABLE}</span>
    <span><i className="dot reserved" /> 예약 {counts.RESERVED_IN_SHOP}</span>
    <span><i className="dot owned" /> 플레이어 소유 {counts.OWNED}</span>
  </div>;
}

function PlayerStrip({ state }: { state: PorenaGameState }) {
  const [open, setOpen] = useState(false);
  const me = state.players.find((player) => player.id === "p1") ?? state.players[0]!;
  const rankedPlayers = [...state.players].sort((left, right) => {
    return right.points - left.points || right.stackBB - left.stackBB || left.name.localeCompare(right.name, "ko");
  });
  return <section className={`player-scoreboard ${open ? "is-open" : ""}`}>
    <button className="player-score-summary" type="button" aria-expanded={open} aria-controls="player-score-drawer" onClick={() => setOpen((value) => !value)}>
      <span className="player-avatar">♔</span>
      <span><b>{me.name}</b><small>{me.eliminated ? `R${me.eliminatedRound} OUT` : `${me.stackBB}BB · ${displayPoints(me.points)}P`}</small></span>
      <em>{open ? "접기" : "전체 순위"}<i>{open ? "↑" : "↓"}</i></em>
    </button>
    <button className="player-score-backdrop" type="button" tabIndex={open ? 0 : -1} aria-label="플레이어 스코어 닫기" onClick={() => setOpen(false)} />
    <div className="player-score-drawer" id="player-score-drawer" role="dialog" aria-modal="true" aria-label="승점 순위표">
      <header><span>LIVE STANDINGS</span><b>승점 순위</b><button type="button" aria-label="닫기" onClick={() => setOpen(false)}>×</button></header>
      <p>현재 승점순 · 동점 시 보유 BB순 (최종 순위와 다를 수 있습니다)</p>
      <div className="chip-count-list">{rankedPlayers.map((player, index) => <div key={player.id} className={`chip-count-row ${player.id === "p1" ? "me" : ""} ${player.eliminated ? "out" : ""}`}>
        <span className="chip-count-rank">{String(index + 1).padStart(2, "0")}</span>
        <strong>{player.name}</strong>
        <span className="chip-count-stats"><b>{displayPoints(player.stackBB)} BB</b><i>승점 {displayPoints(player.points)}점</i></span>
      </div>)}</div>
    </div>
  </section>;
}

function ShopPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  const me = state.players[0]!; const cap = BALANCE.handLimits[state.round];
  const purchaseLimit = purchaseLimitFor(state.round); const rerollLimit = rerollLimitFor(state.round);
  const canSell = canSellWithoutBlocking({ ownedCount: me.ownedCardIds.length, purchases: me.purchasesThisRound,
    purchaseLimit, handLimit: cap });
  return <section className="shop-layout">
    <div className="inventory panel">
      <header><div><span className="eyebrow">PRIVATE INVENTORY</span><h2>내 카드 <em>{me.ownedCardIds.length} / {cap}</em></h2></div><div className="stat-block"><small>사용 BB</small><strong>{me.stackBB}<i>BB</i></strong></div></header>
      <div className="card-row owned-row">{me.ownedCardIds.map((id) => <CardView key={id} card={getCard(state, id)} onClick={canSell ? () => act((s) => sellCard(s, me.id, id)) : undefined} footer={canSell ? "판매" : "판매 불가"} />)}
        {Array.from({ length: Math.max(0, cap - me.ownedCardIds.length) }, (_, i) => <div className="empty-card" key={i}><span>+</span><small>EMPTY</small></div>)}</div>
      <p className="hint">{canSell ? `카드를 누르면 기준가의 ${me.augments.some((a) => a.id === "sell_bonus") ? "80" : "60"}%에 판매합니다. 판매 후에도 라운드 구매 횟수는 복구되지 않습니다.` : "남은 구매 횟수로 필수 보유 장수를 복구할 수 없어 더 이상 판매할 수 없습니다."}</p>
    </div>
    <div className="market panel">
      <header><div><span className="eyebrow">RESERVED FOR YOU</span><h2>카드 마켓 <em>{me.shopCardIds.length} / {me.shopSize}</em></h2></div><span className="purchase-count">구매 {me.purchasesThisRound}/{purchaseLimit}</span></header>
      <div className="card-row market-row">{me.shopCardIds.map((id) => <ShopCard key={id} card={getCard(state, id)} price={getCardPrice(state, me.id, id)} locked={me.lockedShopCardIds?.includes(id) ?? false} onBuy={() => act((s) => buyCard(s, me.id, id))} onLock={() => act((s) => toggleShopLock(s, me.id, id))} />)}
        {!me.shopCardIds.length ? <p className="market-empty">상점 카드가 모두 소진되었습니다.</p> : null}</div>
      <div className="market-actions"><button className="secondary" disabled={(me.rerollsUsed ?? 0) >= rerollLimit || me.stackBB < Math.max(0, BALANCE.rerollCostBB - (me.augments.some((a) => a.id === "reroll_discount") ? 2 : 0))} onClick={() => act((s) => rerollShop(s, me.id))}>↻ 리롤 <b>{Math.max(0, BALANCE.rerollCostBB - (me.augments.some((a) => a.id === "reroll_discount") ? 2 : 0))}BB</b> · {Math.max(0, rerollLimit - (me.rerollsUsed ?? 0))} / {rerollLimit}</button><span className="hint">카드별 잠금 3BB · 해제 무료</span></div>
    </div>
  </section>;
}

/** Replays an ordered loadout through the engine's own toggle, so selection rules stay in one place. */
function applyLoadout(source: PorenaGameState, playerId: string, selection: string[] | null): PorenaGameState {
  let state = source;
  for (const id of [...state.players.find((p) => p.id === playerId)!.selectedCardIds]) state = toggleSelectedCard(state, playerId, id);
  for (const id of selection ?? []) state = toggleSelectedCard(state, playerId, id);
  return state;
}

function SelectPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  const me = state.players[0]!;
  const r3 = state.round === 3;
  if (r3) return <section className="panel select-panel"><span className="eyebrow">ROUND 3 · LOADOUT</span><h2>Game 1과 Game 2 소켓에 카드를 배치하세요</h2><p>게임마다 2장씩 사용합니다. 두 게임은 서로 다른 보드로 진행됩니다.</p>
    <LoadoutSockets cards={me.ownedCardIds.map((id) => getCard(state, id))} selectedCardIds={me.selectedCardIds} onChange={(selection) => act((s) => applyLoadout(s, me.id, selection))} /></section>;
  return <section className="panel select-panel"><span className="eyebrow">ROUND {state.round} · LOADOUT</span><h2>{r3 ? "Game 1과 Game 2에 사용할 카드를 순서대로 선택하세요" : "Run It Twice에 사용할 2장을 선택하세요"}</h2><p>{r3 ? "먼저 고른 2장은 Game 1, 다음 2장은 Game 2에 배정됩니다. 두 게임은 서로 다른 보드로 진행됩니다." : "선택하지 않은 카드는 계속 소유합니다. 두 보드와 Sudden Death에서도 같은 홀카드를 사용합니다."}</p><div className="card-row centered">{me.ownedCardIds.map((id) => { const index = me.selectedCardIds.indexOf(id); const footer = index < 0 ? "선택" : r3 ? index < 2 ? "GAME 1" : "GAME 2" : "선택됨"; return <CardView key={id} card={getCard(state, id)} selected={index >= 0} onClick={() => act((s) => toggleSelectedCard(s, me.id, id))} footer={footer} />; })}</div></section>;
}

function MatchCard({ state, match, matchNumber }: { state: PorenaGameState; match: MatchResult; matchNumber: number }) {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const winnerNames = match.winnerIds.map((id) => state.players.find((p) => p.id === id)!.name).join(", ");
  const stageLabel = match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : match.stage === "final" ? "최종전" : match.group === "winner" ? "승자조" : match.group === "loser" ? "생존전" : match.stage === "secondary" ? "2차전" : "1차전";
  const outcomeLabel = match.stage === "final" ? "최종 1위" : match.group === "loser" ? "생존" : "승리";
  return <article className="match-card">
    <header><span>매치 {matchNumber} · {stageLabel}</span><b>♔ {winnerNames} {outcomeLabel}</b>{match.suddenDeathCount ? <em>타이브레이크 {match.suddenDeathCount}회</em> : null}</header>
    {match.boards.length ? <div className={`boards ${match.boards.length > 1 ? "multi-board" : ""}`}>{match.boards.map((board, boardIndex) => {
      const winners = match.boardWinnerIds[boardIndex] ?? [];
      const winnerUsed = new Set((match.boardResults[boardIndex] ?? []).filter((result) => winners.includes(result.playerId)).flatMap((result) => result.usedCardIds));
      const label = boardIndex < match.runoutCount ? (match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : "보드") : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      return <div className={`board made-${madeTone((match.boardResults[boardIndex] ?? []).find((r) => winners.includes(r.playerId))?.hand.displayName ?? "")} ${boardIndex >= match.runoutCount ? "sudden-board" : ""}`} key={`${match.id}-board-${boardIndex}`}><small>{label}</small><div className="card-row centered">{board.map((card) => <CardView key={card.id} card={card} compact glow={winnerUsed.has(card.id)} dimmed={!winnerUsed.has(card.id)} />)}</div>{match.runoutCount === 2 && <RunWinner winners={winners.map(name)} />}</div>;
    })}</div> : <div className="no-board">NO COMMUNITY · THE LAST HAND</div>}
    <div className={`combatants ${match.playerIds.length > 2 ? "multi" : ""}`}>{[...match.results].sort((a, b) => a.place - b.place).map((result) => {
      const player = state.players.find((p) => p.id === result.playerId)!; const winner = match.winnerIds.includes(player.id); const shownIds = match.revealedCardIds[player.id] ?? [];
      const reward = match.rewards?.find((entry) => entry.playerId === player.id);
      return <div key={player.id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{player.name}</b>{reward && <em>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))}P</em>}</div>{reward?.detail?.includes("ICM") && <p className="combatant-detail">{reward.detail}</p>}<ShowdownHand cards={shownIds.map((id) => getCard(state, id))} usedCardIds={result.usedCardIds} winner={winner} displayName={result.hand.displayName} category={result.hand.category} kickers={result.hand.kickers} /></div>;
    })}</div>
  </article>;
}

function ShowdownPanel({ state }: { state: PorenaGameState }) {
  if (!state.roundResults.length) return <section className="arena-empty panel"><span className="arena-mark">♞</span><h2>쇼다운 준비 완료</h2><p>각 매치는 참가자가 소유한 모든 카드를 제외한 독립 Showdown Deck으로 진행됩니다.</p></section>;
  return <RoundResults round={state.round} rows={createRoundSummary(state)} viewerId="p1">{roundMatches(state).filter((match) => match.playerIds.includes("p1")).map((match, index) => <MatchCard state={state} match={match} matchNumber={index + 1} key={match.id} />)}</RoundResults>;
}

function AugmentPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  return <section className="panel augment-panel"><span className="eyebrow">AUGMENT DRAFT</span><h2>전략을 바꿀 증강 하나를 선택하세요</h2><div className="augment-grid">{state.augmentChoices.map((augment, index) => <button key={augment.id} onClick={() => act((s) => chooseAugment(s, "p1", augment.id))}><span>0{index + 1}</span><b>{augment.name}</b><p>{augment.description}</p><em>선택하기 →</em></button>)}</div></section>;
}

function FinalPanel({ state }: { state: PorenaGameState }) {
  const standings = finalStandings(state);
  return <section className="final-panel panel"><span className="eyebrow">FINAL SCORE</span><h2>{state.players.find((p) => p.id === standings[0]?.playerId)?.name} 우승</h2><p className="formula">누적 승점 + 족보 점수 + ⌊보유 BB ÷ 10⌋ · 탈락자는 탈락 시점 기준</p><div className="standings">{standings.map((row, index) => <div className={`standing ${index === 0 ? "champion" : ""} ${row.eliminatedRound ? "eliminated" : ""}`} key={row.playerId}><strong>{row.placement}</strong><span><b>{state.players.find((p) => p.id === row.playerId)?.name}</b><small>{row.hand?.displayName}{row.eliminatedRound ? ` · R${row.eliminatedRound} 탈락` : " · FINAL"}</small></span><span>{displayPoints(row.points)}<small>승점</small></span><span>{row.handScore}<small>족보</small></span><span>{row.stackScore}<small>스택</small></span><em>{displayPoints(row.total)} P</em><i className={`rank-point ${row.rankPoints > 0 ? "positive" : row.rankPoints < 0 ? "negative" : ""}`}>{row.rankPoints > 0 ? "+" : ""}{row.rankPoints}<small>RANK</small></i></div>)}</div></section>;
}

function ActionBar({ state, act, reset }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void; reset: () => void }) {
  const me = state.players[0]!; let label = "계속"; let fn: ((s: PorenaGameState) => PorenaGameState) | null = null;
  if (state.phase === "SHOP") { label = `구성 확정 · R${state.round} 쇼다운`; fn = prepareShowdown; }
  if (state.phase === "DECK_SELECT") { const required = state.round === 3 ? 4 : 2; label = `선택 확정 (${me.selectedCardIds.length}/${required})`; fn = confirmSelection; }
  if (state.phase === "SHOWDOWN_PRIMARY") { label = state.round === 5 ? "The Last Hand 공개" : "1차 쇼다운 공개"; fn = resolvePrimary; }
  if (state.phase === "GROUP_ASSIGNMENT") { label = "브래킷 확인 · 2차전"; fn = beginSecondary; }
  if (state.phase === "SHOWDOWN_SECONDARY") { label = "새 매치 보드 공개"; fn = resolveSecondary; }
  if (state.phase === "ROUND_RESULT") { label = state.round === 2 || state.round === 4 ? "증강 드래프트" : "라운드 마감"; fn = leaveRoundResult; }
  if (state.phase === "NEXT_ROUND") { label = `R${state.round + 1} 상점으로`; fn = startNextRound; }
  const requiredSelection = state.round === 3 ? 4 : 2;
  if (!fn && !me.eliminated) return null;
  return <div className="action-bar"><div><small>NEXT ACTION</small><b>{fn ? label : "탈락"}</b></div>{fn ? <button className="primary" onClick={() => act(fn!)} disabled={state.phase === "DECK_SELECT" && me.selectedCardIds.length !== requiredSelection}>{label}<span>→</span></button> : <button className="primary" onClick={reset}>새 게임<span>↻</span></button>}</div>;
}

export function App() {
  const [state, setState] = useState(() => createGame()); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (state.round === 5) preloadFinalArena(); else preloadShowdownStage(state.round); }, [state.round]);
  const [gameVersion, setGameVersion] = useState(0);
  const [dismissedGuide, setDismissedGuide] = useState<string | null>(null);
  const act = (fn: (s: PorenaGameState) => PorenaGameState) => { try { let next = fn(state); if (next.phase === "SHOWDOWN_PRIMARY") next = resolvePrimary(next); else if (next.phase === "SHOWDOWN_SECONDARY") next = resolveSecondary(next); setState(next); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "작업을 완료하지 못했습니다."); } };
  const round = ROUND_COPY[state.round]; const alive = state.players.filter((player) => !player.eliminated).length;
  const prep = getPrepPresentation(state.round, state.phase);
  const myMatches = state.roundResults.filter((match) => match.playerIds.includes("p1"));
  const cinematicMatches = (myMatches.length ? myMatches : state.roundResults).map((match) => createMatchView(state, match));
  const guideKey = `${gameVersion}:${state.round}`;
  return <CinematicGate key={gameVersion} controls matches={cinematicMatches} profiles={state.players.map((p) => ({ playerId: p.id, name: p.name }))} viewerId="p1"><main className="game-arena">
    {dismissedGuide !== guideKey ? <RoundGuide round={state.round} onClose={() => setDismissedGuide(guideKey)} /> : null}
    <nav><a className="brand" href="#top"><span>P</span><div><b>PORENA</b><small>TACTICAL POKER AUTOBATTLER</small></div></a><RoundProgress round={state.round} prep={prep} /><div className="survivors"><small>SURVIVORS</small><b>{alive}<i>/ 8</i></b></div></nav>
    <div id="top" className="page-shell">
      {prep ? <PrepRoundHeader prep={prep} phaseLabel={PHASE_LABEL[state.phase]} /> : <header className="round-header"><div><span className="round-number">ROUND 0{state.round}</span><h1>{round.title}</h1></div><div className="phase-badge"><small>CURRENT PHASE</small><b>{PHASE_LABEL[state.phase]}</b><span>{state.round === 5 ? "COMMUNITY OFF" : "MATCH-SCOPED BOARD"}</span></div></header>}
      <PoolMeter state={state} />
      <PlayerStrip state={state} />
      {error ? <div className="error-toast" role="alert"><span>!</span>{error}<button onClick={() => setError(null)}>×</button></div> : null}
      {state.phase === "SHOP" ? state.players[0]!.eliminated ? <section className="panel transition-panel"><span>OUT</span><h2>관전 모드</h2><p>내 카드는 공용 풀로 반환되었습니다. 남은 플레이어의 매치별 Community Board와 토너먼트 결과를 계속 확인할 수 있습니다.</p></section> : <ShopPanel state={state} act={act} /> : null}
      {state.phase === "DECK_SELECT" ? <SelectPanel state={state} act={act} /> : null}
      {["SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT"].includes(state.phase) ? <ShowdownPanel state={state} /> : null}
      {state.phase === "AUGMENT" ? <AugmentPanel state={state} act={act} /> : null}
      {state.phase === "NEXT_ROUND" ? <section className="panel transition-panel"><span>R{state.round}</span><h2>라운드 종료</h2><p>{alive}명이 다음 라운드로 진출합니다. 탈락자의 카드는 공용 풀로 반환됩니다.</p></section> : null}
      {state.phase === "GAME_RESULT" ? <FinalPanel state={state} /> : null}
      <ActionBar state={state} act={act} reset={() => { setGameVersion((value) => value + 1); setState(createGame()); }} />
      <section className="event-log"><header><span className="eyebrow">MATCH FEED</span><b>최근 이벤트</b></header>{state.logs.map((entry) => <p key={entry.id} className={entry.tone}><i>0{entry.id}</i>{entry.message}</p>)}</section>
    </div>
  </main></CinematicGate>;
}
