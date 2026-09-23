import { useCallback, useEffect, useState } from "react";
import { assertPoolIntegrity, ownershipCounts } from "../game/cardPool";
import { BALANCE, purchaseLimitFor, regularShopSizeFor, rerollLimitFor } from "../game/config";
import {
  beginSecondary, buyCard, chooseAugment, confirmSelection, createGame, finalStandings, leaveRoundResult,
  getCard, getCardPrice, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary,
  sellCard, startNextRound, toggleSelectedCard, toggleShopLock,
} from "../game/engine";
import type { PorenaGameState, MatchResult, Phase } from "../game/types";
import { createMatchView } from "../game/matchView";
import { HighCardDrawResult } from "./HighCardDraw";
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
import { preloadFinalArena } from "./finalShowdownPresentation";
import { ExitGameDialog } from "./ExitGameDialog";
import { preloadShowdownStage } from "./showdownStage";
import { openDraft, autoPickDraft, pickDraftCard, setRunLoadout, lockRunLoadouts, resolveSurvival } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { RunLoadoutPanel, TimedOpenDraftPanel } from "./OpenDraft";
import type { GameAction } from "../shared/protocol";
import { LocalResultWindow } from "./LocalResultWindow";
import { playerEventFeed } from "./playerEventFeed";
import { FinalStandingRow, FinalStandingsHeader } from "./FinalStandingRow";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { useLocalCountdown } from "./useLocalCountdown";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";
const pauseLocalResultTimer = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("pauseRoundResultTimer");

const ROUND_COPY = {
  1: { title: "TWO HAND", rule: "홀 2 + 매치별 보드 5 · Hold’em", cap: 2 },
  2: { title: "RUN IT TWICE", rule: "3장 중 2장 선택 · 매치별 두 보드", cap: 3 },
  3: { title: "OMAHA SWISS", rule: "보유 4장 · Swiss 3경기 · 홀 2 + 보드 3", cap: 4 },
  4: { title: "BEST FIVE", rule: "홀 5 + 보드 5 중 자유 BEST 5", cap: 5 },
  5: { title: "THE LAST HAND", rule: "커뮤니티 보드 없이 보유 7장", cap: 7 },
} as const;

const PHASE_LABEL: Record<Phase, string> = {
  DRAFT_ORDER: "드래프트 순서 공개", OPEN_DRAFT: "공개 드래프트", RUN_LOADOUT: "RUN 카드 배치", SURVIVAL_READY: "생존 타이브레이크",
  SHOP: "상점", DECK_SELECT: "출전 카드 선택", SHOWDOWN_PRIMARY: "", GROUP_ASSIGNMENT: "그룹 배정",
  SHOWDOWN_SECONDARY: "", ROUND_RESULT: "라운드 결과", AUGMENT: "증강 선택", NEXT_ROUND: "라운드 전환", GAME_RESULT: "최종 결과",
};

function PoolMeter({ state }: { state: PorenaGameState }) {
  const counts = ownershipCounts(state);
  const valid = (() => { try { return assertPoolIntegrity(state); } catch { return false; } })();
  return <div className="pool-meter">
    <span className={`integrity ${valid ? "ok" : "bad"}`}><i className="pool-icon cards" aria-hidden="true" /><span><strong>{valid ? "52" : "!"} <em>{valid ? "UNIQUE" : "POOL ERROR"}</em></strong></span></span>
    <span title="미보유 카드 전체: 상점 예약 카드 포함"><i className="pool-icon deck" aria-hidden="true" /><span><strong>남은 카드 <em>{counts.remaining}</em></strong></span></span>
    <span title="각 플레이어가 현재 보유 중인 카드만 집계합니다"><i className="pool-icon player" aria-hidden="true" /><span><strong>플레이어 보유 <em>{counts.owned}</em></strong></span></span>
  </div>;
}

function LocalRunLoadoutStage({ view, send }: {
  view: ReturnType<typeof createPlayerView>; send: (action: GameAction) => void;
}) {
  const seconds = useLocalCountdown(30);
  return <RunLoadoutPanel view={view} send={send} disabled={false} seconds={seconds} />;
}

function LocalShowdownPrep({ state }: { state: PorenaGameState }) {
  const seconds = useLocalCountdown(BARRIER_TIMEOUT_MS.MATCH_SETUP / 1000);
  const playerName = state.players.find((player) => player.id === "p1")?.name ?? "나";
  return <ShowdownPrepPanel round={state.round} playerName={playerName} seconds={seconds} secondary={state.phase === "SHOWDOWN_SECONDARY"} />;
}

function ShopPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  const me = state.players[0]!; const cap = BALANCE.handLimits[state.round];
  const purchaseLimit = purchaseLimitFor(state.round); const rerollLimit = rerollLimitFor(state.round);
  const shopSize = state.rulesVersion === 2 ? regularShopSizeFor(state.round) : me.shopSize;
  const lockedShopCardCount = me.shopCardIds.filter((id) => me.lockedShopCardIds?.includes(id)).length;
  const allShopCardsLocked = shopSize > 0 && lockedShopCardCount >= shopSize;
  const canSell = canSellWithoutBlocking({ ownedCount: me.ownedCardIds.length, purchases: me.purchasesThisRound,
    purchaseLimit, handLimit: cap });
  return <section className="shop-layout">
    <div className="inventory panel">
      <header><div className="shop-heading"><h2>내 카드</h2><strong className="shop-count">{me.ownedCardIds.length} / {cap}</strong></div><div className="stat-block"><small>스택 :</small><strong>{me.stackBB}<i>BB</i></strong></div></header>
      <div className="card-row owned-row">{me.ownedCardIds.map((id) => <CardView key={id} card={getCard(state, id)} onClick={canSell ? () => act((s) => sellCard(s, me.id, id)) : undefined} footer={canSell ? "판매" : "판매 불가"} />)}
        {Array.from({ length: Math.max(0, cap - me.ownedCardIds.length) }, (_, i) => <div className="empty-card" key={i}><span>+</span><small>EMPTY</small></div>)}</div>
    </div>
    <div className="market panel">
      <header><div className="shop-heading"><h2>카드 마켓</h2><strong className="shop-count">{me.shopCardIds.length} / {shopSize}</strong></div><span className="purchase-count">구매 {me.purchasesThisRound} / {purchaseLimit}</span></header>
      <div className="card-row market-row">{me.shopCardIds.map((id, index) => <ShopCard key={id} dealIndex={index} card={getCard(state, id)} price={getCardPrice(state, me.id, id)} locked={me.lockedShopCardIds?.includes(id) ?? false} onBuy={() => act((s) => buyCard(s, me.id, id))} onLock={() => act((s) => toggleShopLock(s, me.id, id))} />)}
        {!me.shopCardIds.length ? <p className="market-empty">상점 카드가 모두 소진되었습니다.</p> : null}</div>
      <div className="market-actions"><button className="secondary" disabled={allShopCardsLocked || (me.rerollsUsed ?? 0) >= rerollLimit || me.stackBB < Math.max(0, BALANCE.rerollCostBB - (me.augments.some((a) => a.id === "reroll_discount") ? 2 : 0))} onClick={() => act((s) => rerollShop(s, me.id))}>↻ 리롤 <b>{Math.max(0, BALANCE.rerollCostBB - (me.augments.some((a) => a.id === "reroll_discount") ? 2 : 0))}BB</b> · {me.rerollsUsed ?? 0} / {rerollLimit}</button><span className="hint">{allShopCardsLocked ? "모든 카드가 잠겨 리롤할 수 없습니다." : "카드별 잠금 3BB · 해제 무료"}</span></div>
    </div>
  </section>;
}

function SelectPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  const me = state.players[0]!;
  return <section className="panel select-panel"><span className="eyebrow">ROUND 2 · LOADOUT</span><h2>Run It Twice에 사용할 2장을 선택하세요</h2><p>선택하지 않은 카드는 계속 소유합니다. 두 보드와 Sudden Death에서도 같은 홀카드를 사용합니다.</p><div className="card-row centered">{me.ownedCardIds.map((id) => { const chosen = me.selectedCardIds.includes(id); return <CardView key={id} card={getCard(state, id)} selected={chosen} onClick={() => act((s) => toggleSelectedCard(s, me.id, id))} footer={chosen ? "선택됨" : "선택"} />; })}</div></section>;
}

function MatchCard({ state, match, matchNumber }: { state: PorenaGameState; match: MatchResult; matchNumber: number }) {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const winnerNames = match.winnerIds.map((id) => state.players.find((p) => p.id === id)!.name).join(", ");
  const stageLabel = match.matchday ? `MATCH ${match.matchday}/3 · ${state.round === 3 && match.matchday === 1 ? "SEED GROUP" : "SWISS PAIRING"}` : match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : match.stage === "final" ? "최종전" : match.group === "winner" ? "승자조" : match.group === "loser" ? "생존전" : match.stage === "secondary" ? "2차전" : "1차전";
  const outcomeLabel = match.stage === "final" ? "최종 1위" : match.group === "loser" ? "생존" : "승리";
  return <article className="match-card">
    {match.highCardDraw && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    <header><span>매치 {matchNumber} · {stageLabel}</span><b>{match.runCards ? "RUN 1 · RUN 2 독립 결과" : `♔ ${winnerNames} ${outcomeLabel}`}</b>{match.suddenDeathCount ? <em>타이브레이크 {match.suddenDeathCount}회</em> : null}</header>
    {match.boards.length ? <div className={`boards ${match.boards.length > 1 ? "multi-board" : ""}`}>{match.boards.map((board, boardIndex) => {
      const winners = match.boardWinnerIds[boardIndex] ?? [];
      const winnerUsed = new Set((match.boardResults[boardIndex] ?? []).filter((result) => winners.includes(result.playerId)).flatMap((result) => result.usedCardIds));
      const label = boardIndex < match.runoutCount ? (match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : "보드") : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      return <div className={`board made-${madeTone((match.boardResults[boardIndex] ?? []).find((r) => winners.includes(r.playerId))?.hand.displayName ?? "")} ${boardIndex >= match.runoutCount ? "sudden-board" : ""}`} key={`${match.id}-board-${boardIndex}`}><small>{label}</small><div className="card-row centered">{board.map((card) => <CardView key={card.id} card={card} compact glow={winnerUsed.has(card.id)} dimmed={!winnerUsed.has(card.id)} />)}</div>{match.runoutCount === 2 && <RunWinner winners={winners.map(name)} />}</div>;
    })}</div> : <div className="no-board">NO COMMUNITY · THE LAST HAND</div>}
    <div className={`combatants ${match.playerIds.length > 2 ? "multi" : ""}`}>{[...match.results].sort((a, b) => a.place - b.place).map((result) => {
      const player = state.players.find((p) => p.id === result.playerId)!; const winner = match.winnerIds.includes(player.id); const shownIds = match.runCards?.[player.id]?.[1] ?? match.revealedCardIds[player.id] ?? [];
      const reward = match.rewards?.find((entry) => entry.playerId === player.id);
      return <div key={player.id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{player.name}</b>{reward && <em>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))}P</em>}</div>{reward?.detail?.includes("ICM") && <p className="combatant-detail">{reward.detail}</p>}<ShowdownHand cards={shownIds.map((id) => getCard(state, id))} usedCardIds={result.usedCardIds} winner={winner} displayName={result.hand.displayName} category={result.hand.category} kickers={result.hand.kickers} /></div>;
    })}</div>
  </article>;
}

function ShowdownPanel({ state, secondsLeft }: { state: PorenaGameState; secondsLeft: number | null }) {
  if (["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(state.phase)) return <LocalShowdownPrep state={state} />;
  if (!state.roundResults.length) return null;
  return <RoundResults round={state.round} rows={createRoundSummary(state)} viewerId="p1" showBrackets={state.round === 4 && state.phase === "GROUP_ASSIGNMENT"} secondsLeft={state.phase === "ROUND_RESULT" ? secondsLeft : null}>{roundMatches(state).filter((match) => match.playerIds.includes("p1")).map((match, index) => <MatchCard state={state} match={match} matchNumber={index + 1} key={match.id} />)}</RoundResults>;
}

function AugmentPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  return <section className="panel augment-panel"><span className="eyebrow">AUGMENT DRAFT</span><h2>전략을 바꿀 증강 하나를 선택하세요</h2><div className="augment-grid">{state.augmentChoices.map((augment, index) => <button key={augment.id} onClick={() => act((s) => chooseAugment(s, "p1", augment.id))}><span>0{index + 1}</span><b>{augment.name}</b><p>{augment.description}</p><em>선택하기 →</em></button>)}</div></section>;
}

function FinalPanel({ state }: { state: PorenaGameState }) {
  const standings = finalStandings(state);
  return <section className="final-panel panel"><span className="eyebrow">FINAL SCORE</span><h2>{state.players.find((p) => p.id === standings[0]?.playerId)?.name} 우승</h2><div className="standings"><FinalStandingsHeader />{standings.map((row) => <FinalStandingRow key={row.playerId} row={{ ...row, displayName: row.hand?.displayName ?? "" }} name={state.players.find((p) => p.id === row.playerId)?.name ?? row.playerId} />)}</div></section>;
}

function EventLog({ state }: { state: PorenaGameState }) {
  const entries = playerEventFeed(state, "p1");
  return <details className="event-log"><summary><span><i className="eyebrow">PLAYER LOG</i><b>내 최근 이벤트</b></span><em>{entries.length}개 · 펼쳐보기</em></summary><div className="event-log-drawer">{entries.map((entry) => <p key={entry.id} className={entry.tone}>{entry.message}</p>)}</div></details>;
}

function ActionBar({ state, act, reset }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void; reset: () => void }) {
  const me = state.players[0]!; let label = "계속"; let fn: ((s: PorenaGameState) => PorenaGameState) | null = null;
  if (state.phase === "SHOP") { label = `구성 확정 · R${state.round} 쇼다운`; fn = prepareShowdown; }
  if (state.phase === "DECK_SELECT") { label = `선택 확정 (${me.selectedCardIds.length}/2)`; fn = confirmSelection; }
  if (state.phase === "GROUP_ASSIGNMENT") { label = "브래킷 확인 · 2차전"; fn = beginSecondary; }
  if (state.phase === "SURVIVAL_READY") { label = "생존 타이브레이크 시작"; fn = resolveSurvival; }
  if (state.phase === "ROUND_RESULT") { label = state.round === 2 || state.round === 4 ? "증강 드래프트" : "라운드 마감"; fn = leaveRoundResult; }
  if (state.phase === "NEXT_ROUND") { label = `R${state.round + 1} ${state.rulesVersion === 2 && [1, 3].includes(state.round) ? "드래프트로" : "상점으로"}`; fn = startNextRound; }
  const requiredSelection = 2;
  if (state.phase === "GAME_RESULT" || (!fn && !me.eliminated)) return null;
  return <div className="action-bar action-only">{fn ? <button className="primary" onClick={() => act(fn!)} disabled={state.phase === "DECK_SELECT" && me.selectedCardIds.length !== requiredSelection}>{label}<span>→</span></button> : <button className="primary" onClick={reset}>새 게임<span>↻</span></button>}</div>;
}

export function App({ onHome }: { onHome: () => void }) {
  const [state, setState] = useState(() => createGame()); const [error, setError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [gameVersion, setGameVersion] = useState(0);
  const [dismissedGuide, setDismissedGuide] = useState<string | null>(null);
  const expireResult = useCallback(() => setState((current) => current.phase === "ROUND_RESULT" ? leaveRoundResult(current) : current), []);
  const draftPickIndex = state.draft?.picks.length ?? 0;
  const draftPickerId = state.draft?.order[draftPickIndex]?.playerId;
  const guideKey = `${gameVersion}:${state.round}`;
  const guideOpen = dismissedGuide !== guideKey;
  useEffect(() => {
    const phase = state.phase;
    if (guideOpen) return;
    if (!["DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(phase)) return;
    const delay = phase === "DRAFT_ORDER" ? BARRIER_TIMEOUT_MS.DRAFT_DEAL_IN
      : phase === "RUN_LOADOUT" ? BARRIER_TIMEOUT_MS.RUN_LOADOUT
      : phase === "SHOWDOWN_PRIMARY" || phase === "SHOWDOWN_SECONDARY" ? BARRIER_TIMEOUT_MS.MATCH_SETUP
      : draftPickerId === "p1" ? 20_000 : BARRIER_TIMEOUT_MS.BOT_DRAFT_PICK;
    const timer = setTimeout(() => setState((s) => phase === "DRAFT_ORDER" ? openDraft(s)
      : phase === "RUN_LOADOUT" ? lockRunLoadouts(s)
      : phase === "SHOWDOWN_PRIMARY" ? resolvePrimary(s)
      : phase === "SHOWDOWN_SECONDARY" ? resolveSecondary(s)
      : autoPickDraft(s)), delay);
    return () => clearTimeout(timer);
  }, [state.phase, draftPickIndex, draftPickerId, guideOpen]);
  useEffect(() => { if (state.round === 5) preloadFinalArena(); else preloadShowdownStage(state.round); }, [state.round]);
  const act = (fn: (s: PorenaGameState) => PorenaGameState) => { try { setState(fn(state)); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "작업을 완료하지 못했습니다."); } };
  const round = ROUND_COPY[state.round]; const alive = state.players.filter((player) => !player.eliminated).length;
  const prep = getPrepPresentation(state.round, state.phase);
  const myMatches = state.roundResults.filter((match) => match.playerIds.includes("p1"));
  const cinematicMatches = (myMatches.length ? myMatches : state.roundResults).map((match) => createMatchView(state, match));
  const draftView = createPlayerView({ schema: 1, roomId: "LOCAL", revision: 0, status: "PLAYING", game: state, sessions: [{ playerId: "p1", tokenHash: "local", requests: [] }], readyIds: [], endedShopIds: [], augmentChoices: {} }, "p1");
  const draftAction = (a: GameAction) => {
    if (a.type === "DRAFT_PICK") act((s) => pickDraftCard(s, "p1", a.cardId));
    if (a.type === "RUN_LOADOUT") act((s) => setRunLoadout(s, "p1", a.cardIds));
    if (a.type === "LOCK_RUN_LOADOUT") act(lockRunLoadouts);
  };
  const reset = () => { setGameVersion((value) => value + 1); setState(createGame()); };
  return <CinematicGate key={gameVersion} matches={cinematicMatches} profiles={state.players.map((p) => ({ playerId: p.id, name: p.name, points: p.points, alive: !p.eliminated }))} viewerId="p1"><LocalResultWindow key={`${state.round}:${state.phase}`} active={state.phase === "ROUND_RESULT" && !pauseLocalResultTimer} onExpire={expireResult}>{(resultSecondsLeft) => <main className="game-arena">
    {guideOpen ? <RoundGuide round={state.round} onClose={() => setDismissedGuide(guideKey)} /> : null}
    <nav><a className="brand" href="#top"><span><img src="/assets/brand/porena-mark.webp" alt="" width="38" height="38" /></span><div><b>PORENA</b><small>TACTICAL POKER AUTOBATTLER</small></div></a><RoundProgress round={state.round} prep={prep} /><div className="nav-status"><div className="survivors"><small>SURVIVORS</small><b>{alive}<i>/ 8</i></b></div><button type="button" className="secondary nav-exit" onClick={() => setExiting(true)}>나가기</button></div></nav>
      {exiting && <ExitGameDialog mode="single" onCancel={() => setExiting(false)} onConfirm={onHome} />}
    <div id="top" className={`page-shell ${state.phase === "SHOP" ? "shop-page" : ""}`}>
      {prep ? <PrepRoundHeader prep={prep} /> : <header className="round-header"><div><span className="round-number">ROUND 0{state.round}</span><h1>{state.phase === "GAME_RESULT" ? "FINAL STANDINGS" : round.title}</h1></div>{PHASE_LABEL[state.phase] && <div className="phase-badge"><b>{PHASE_LABEL[state.phase]}</b></div>}</header>}
      {state.phase === "SHOP" && <PoolMeter state={state} />}
      {state.phase === "RUN_LOADOUT" && <LocalRunLoadoutStage key={state.phase} view={draftView} send={draftAction} />}
      {!guideOpen && ["DRAFT_ORDER", "OPEN_DRAFT"].includes(state.phase) && <TimedOpenDraftPanel key={`${state.phase}:${draftPickIndex}`} view={draftView} send={draftAction} disabled={false} seconds={null} durationSeconds={state.phase === "DRAFT_ORDER" ? 3 : draftPickerId === "p1" ? 20 : 2} />}
      {error ? <div className="error-toast" role="alert"><span>!</span>{error}<button onClick={() => setError(null)}>×</button></div> : null}
      {state.phase === "SHOP" ? state.players[0]!.eliminated ? <section className="panel transition-panel"><span>OUT</span><h2>관전 모드</h2><p>내 카드는 공용 풀로 반환되었습니다. 남은 플레이어의 매치별 Community Board와 토너먼트 결과를 계속 확인할 수 있습니다.</p></section> : <ShopPanel state={state} act={act} /> : null}
      {state.phase === "DECK_SELECT" ? <SelectPanel state={state} act={act} /> : null}
      {["SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT"].includes(state.phase) ? <ShowdownPanel state={state} secondsLeft={resultSecondsLeft} /> : null}
      {state.phase === "AUGMENT" ? <AugmentPanel state={state} act={act} /> : null}
      {state.phase === "NEXT_ROUND" ? <section className="panel transition-panel"><span>R{state.round}</span><h2>라운드 종료</h2><p>{alive}명이 다음 라운드로 진출합니다. 탈락자의 카드는 공용 풀로 반환됩니다.</p></section> : null}
      {state.phase === "GAME_RESULT" ? <FinalPanel state={state} /> : null}
      {state.phase === "GAME_RESULT" && <section className="final-exit-actions" aria-label="최종 결과 다음 작업"><button className="primary" onClick={reset}>새 게임 시작 <span>↻</span></button><button className="secondary" onClick={onHome}>홈으로 <span>→</span></button></section>}
      <ActionBar state={state} act={act} reset={reset} />
      <EventLog state={state} />
    </div>
  </main>}</LocalResultWindow></CinematicGate>;
}
