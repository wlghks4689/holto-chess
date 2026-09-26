import { useCallback, useEffect, useState } from "react";
import { assertPoolIntegrity, ownershipCounts } from "../game/cardPool";
import { BALANCE, purchaseLimitFor, regularShopSizeFor, rerollLimitFor } from "../game/config";
import {
  beginSecondary, buyCard, confirmSelection, createGame, finalStandings, leaveRoundResult,
  getCard, getCardPrice, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary,
  sellCard, toggleSelectedCard, toggleShopLock,
} from "../game/engine";
import type { PorenaGameState, MatchResult, Round } from "../game/types";
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
import type { GameAction, ShowdownPrepView } from "../shared/protocol";
import { LocalResultWindow } from "./LocalResultWindow";
import { playerEventFeed, renderPlayerFeedEntry } from "./playerEventFeed";
import { classifyGameError } from "../shared/gameErrorCode";
import { renderGameError, type ReceivedGameError } from "../i18n/gameError";
import { localizedIcmDetail } from "./rewardDetail";
import { FinalStandingRow, FinalStandingsHeader } from "./FinalStandingRow";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { useLocalCountdown } from "./useLocalCountdown";
import { FinalRoundTransition, ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { SurvivalReadyPanel } from "./SurvivalReadyPanel";
import { isSurvivalParticipant } from "./survivalReadyPresentation";
import { advanceLocalNextRound } from "./localRoundTransition";
import { markRoundGuideSeen, shouldAutoShowRoundGuide, useRoundGuidePreferences } from "./roundGuidePreferences";
import { useTranslation, type TranslationKey } from "../i18n";
const pauseLocalResultTimer = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("pauseRoundResultTimer");

const ROUND_TITLES = ["", "TWO HAND", "RUN IT TWICE", "OMAHA SWISS", "BEST FIVE", "THE LAST HAND"];
const PHASE_LABEL: Partial<Record<PorenaGameState["phase"], TranslationKey>> = {
  DRAFT_ORDER: "phase.draftOrder", OPEN_DRAFT: "draft.title", RUN_LOADOUT: "phase.runLoadout", SURVIVAL_READY: "phase.survival",
  SHOP: "shop.title", DECK_SELECT: "phase.deckSelect", GROUP_ASSIGNMENT: "phase.groupAssignment", ROUND_RESULT: "result.round", GAME_RESULT: "history.finalResult",
};

function PoolMeter({ state }: { state: PorenaGameState }) {
  const { t } = useTranslation();
  const counts = ownershipCounts(state);
  const valid = (() => { try { return assertPoolIntegrity(state); } catch { return false; } })();
  return <div className="pool-meter">
    <span className={`integrity ${valid ? "ok" : "bad"}`}><i className="pool-icon cards" aria-hidden="true" /><span><strong>{valid ? "52" : "!"} <em>{valid ? "UNIQUE" : "POOL ERROR"}</em></strong></span></span>
    <span title={t("pool.remainingHelp")}><i className="pool-icon deck" aria-hidden="true" /><span><strong>{t("pool.remaining", { count: counts.remaining })}</strong></span></span>
    <span title={t("pool.ownedHelp")}><i className="pool-icon player" aria-hidden="true" /><span><strong>{t("pool.owned", { count: counts.owned })}</strong></span></span>
  </div>;
}

function LocalRunLoadoutStage({ view, send }: {
  view: ReturnType<typeof createPlayerView>; send: (action: GameAction) => void;
}) {
  const seconds = useLocalCountdown(30);
  return <RunLoadoutPanel view={view} send={send} disabled={false} seconds={seconds} />;
}

function LocalShowdownPrep({ state, matchup }: { state: PorenaGameState; matchup?: ShowdownPrepView }) {
  const { t } = useTranslation();
  const seconds = useLocalCountdown(BARRIER_TIMEOUT_MS.MATCH_SETUP / 1000);
  const playerName = state.players.find((player) => player.id === "p1")?.name ?? t("round.you");
  return <ShowdownPrepPanel round={state.round} playerName={playerName} seconds={seconds} secondary={state.phase === "SHOWDOWN_SECONDARY"} matchup={matchup} />;
}

function ShopPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  const { t } = useTranslation();
  const me = state.players[0]!; const cap = BALANCE.handLimits[state.round];
  const purchaseLimit = purchaseLimitFor(state.round); const rerollLimit = rerollLimitFor(state.round);
  const shopSize = state.rulesVersion === 2 ? regularShopSizeFor(state.round) : me.shopSize;
  const lockedShopCardCount = me.shopCardIds.filter((id) => me.lockedShopCardIds?.includes(id)).length;
  const allShopCardsLocked = shopSize > 0 && lockedShopCardCount >= shopSize;
  const canSell = canSellWithoutBlocking({ ownedCount: me.ownedCardIds.length, purchases: me.purchasesThisRound,
    purchaseLimit, handLimit: cap });
  return <section className="shop-layout">
    <div className="inventory panel">
      <header><div className="shop-heading"><h2>{t("shop.myCards")}</h2><strong className="shop-count">{me.ownedCardIds.length} / {cap}</strong></div><div className="stat-block"><small>{t("shop.stack")}</small><strong>{me.stackBB}<i>BB</i></strong></div></header>
      <div className="card-row owned-row">{me.ownedCardIds.map((id) => <CardView key={id} card={getCard(state, id)} onClick={canSell ? () => act((s) => sellCard(s, me.id, id)) : undefined} footer={t(canSell ? "shop.sell" : "shop.cannotSell")} />)}
        {Array.from({ length: Math.max(0, cap - me.ownedCardIds.length) }, (_, i) => <div className="empty-card" key={i}><span>+</span><small>EMPTY</small></div>)}</div>
    </div>
    <div className="market panel">
      <header><div className="shop-heading"><h2>{t("shop.market")}</h2><strong className="shop-count">{me.shopCardIds.length} / {shopSize}</strong></div><span className="purchase-count">{t("shop.purchases", { used: me.purchasesThisRound, limit: purchaseLimit })}</span></header>
      <div className="card-row market-row">{me.shopCardIds.map((id, index) => <ShopCard key={id} dealIndex={index} card={getCard(state, id)} price={getCardPrice(state, me.id, id)} locked={me.lockedShopCardIds?.includes(id) ?? false} onBuy={() => act((s) => buyCard(s, me.id, id))} onLock={() => act((s) => toggleShopLock(s, me.id, id))} />)}
        {!me.shopCardIds.length ? <p className="market-empty">{t("shop.soldOut")}</p> : null}</div>
      <div className="market-actions"><button className="secondary" disabled={allShopCardsLocked || (me.rerollsUsed ?? 0) >= rerollLimit || me.stackBB < BALANCE.rerollCostBB} onClick={() => act((s) => rerollShop(s, me.id))}>{t("shop.rerollStatus", { cost: BALANCE.rerollCostBB, used: me.rerollsUsed ?? 0, limit: rerollLimit })}</button></div>
    </div>
  </section>;
}

function SelectPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  const { t } = useTranslation();
  const me = state.players[0]!;
  return <section className="panel select-panel"><span className="eyebrow">ROUND 2 · LOADOUT</span><h2>{t("select.heading")}</h2><p>{t("select.help")}</p><div className="card-row centered">{me.ownedCardIds.map((id) => { const chosen = me.selectedCardIds.includes(id); return <CardView key={id} card={getCard(state, id)} selected={chosen} onClick={() => act((s) => toggleSelectedCard(s, me.id, id))} footer={t(chosen ? "select.chosen" : "select.choose")} />; })}</div></section>;
}

function MatchCard({ state, match, matchNumber }: { state: PorenaGameState; match: MatchResult; matchNumber: number }) {
  const { t } = useTranslation();
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const winnerNames = match.winnerIds.map((id) => state.players.find((p) => p.id === id)!.name).join(", ");
  const stageLabel = match.matchday ? `MATCH ${match.matchday}/3 · ${state.round === 3 && match.matchday === 1 ? "SEED GROUP" : "SWISS PAIRING"}` : match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : t(match.stage === "final" ? "match.final" : match.group === "winner" ? "match.winnerGroup" : match.group === "loser" ? "match.survivalGroup" : match.stage === "secondary" ? "match.second" : "match.first");
  const outcomeLabel = t(match.stage === "final" ? "match.finalFirst" : match.group === "loser" ? "match.survived" : "match.win");
  return <article className="match-card">
    {match.highCardDraw && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    <header><span>{t("match.numberStage", { number: matchNumber, stage: stageLabel })}</span><b>{match.runCards ? t("match.independentRuns") : t("match.winnerOutcome", { players: winnerNames, outcome: outcomeLabel })}</b>{match.suddenDeathCount ? <em>{t("match.tiebreakCount", { count: match.suddenDeathCount })}</em> : null}</header>
    {match.boards.length ? <div className={`boards ${match.boards.length > 1 ? "multi-board" : ""}`}>{match.boards.map((board, boardIndex) => {
      const winners = match.boardWinnerIds[boardIndex] ?? [];
      const winnerUsed = new Set((match.boardResults[boardIndex] ?? []).filter((result) => winners.includes(result.playerId)).flatMap((result) => result.usedCardIds));
      const label = boardIndex < match.runoutCount ? (match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : t("match.board")) : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      return <div className={`board made-${madeTone((match.boardResults[boardIndex] ?? []).find((r) => winners.includes(r.playerId))?.hand.displayName ?? "")} ${boardIndex >= match.runoutCount ? "sudden-board" : ""}`} key={`${match.id}-board-${boardIndex}`}><small>{label}</small><div className="card-row centered">{board.map((card) => <CardView key={card.id} card={card} compact glow={winnerUsed.has(card.id)} dimmed={!winnerUsed.has(card.id)} />)}</div>{match.runoutCount === 2 && <RunWinner winners={winners.map(name)} />}</div>;
    })}</div> : <div className="no-board">NO COMMUNITY · THE LAST HAND</div>}
    <div className={`combatants ${match.playerIds.length > 2 ? "multi" : ""}`}>{[...match.results].sort((a, b) => a.place - b.place).map((result) => {
      const player = state.players.find((p) => p.id === result.playerId)!; const winner = match.winnerIds.includes(player.id); const shownIds = match.runCards?.[player.id]?.[1] ?? match.revealedCardIds[player.id] ?? [];
      const reward = match.rewards?.find((entry) => entry.playerId === player.id);
      return <div key={player.id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{player.name}</b>{reward && <em>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))}P</em>}</div>{localizedIcmDetail(reward?.detail, t) && <p className="combatant-detail">{localizedIcmDetail(reward?.detail, t)}</p>}<ShowdownHand cards={shownIds.map((id) => getCard(state, id))} usedCardIds={result.usedCardIds} winner={winner} displayName={result.hand.displayName} category={result.hand.category} kickers={result.hand.kickers} /></div>;
    })}</div>
  </article>;
}

function ShowdownPanel({ state, secondsLeft, matchup }: { state: PorenaGameState; secondsLeft: number | null; matchup?: ShowdownPrepView }) {
  if (["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(state.phase)) return state.round === 5
    ? <FinalRoundTransition />
    : <LocalShowdownPrep state={state} matchup={matchup} />;
  if (!state.roundResults.length) return null;
  return <RoundResults round={state.round} rows={createRoundSummary(state)} viewerId="p1" showBrackets={state.round === 4 && state.phase === "GROUP_ASSIGNMENT"} secondsLeft={state.phase === "ROUND_RESULT" ? secondsLeft : null}>{roundMatches(state).filter((match) => match.playerIds.includes("p1")).map((match, index) => <MatchCard state={state} match={match} matchNumber={index + 1} key={match.id} />)}</RoundResults>;
}

function FinalPanel({ state }: { state: PorenaGameState }) {
  const standings = finalStandings(state);
  return <section className="final-panel"><div className="standings"><FinalStandingsHeader />{standings.map((row) => <FinalStandingRow key={row.playerId} row={{ ...row, displayName: row.hand?.displayName ?? "" }} name={state.players.find((p) => p.id === row.playerId)?.name ?? row.playerId} />)}</div></section>;
}

function EventLog({ state }: { state: PorenaGameState }) {
  const { t } = useTranslation();
  const entries = playerEventFeed(state, "p1");
  return <details className="event-log"><summary><span><i className="eyebrow">PLAYER LOG</i><b>{t("log.myEvents")}</b></span><em>{t(entries.length === 1 ? "log.expandCountOne" : "log.expandCount", { count: entries.length })}</em></summary><div className="event-log-drawer">{entries.map((entry) => <p key={entry.id} className={entry.tone}>{renderPlayerFeedEntry(entry, t)}</p>)}</div></details>;
}

function ActionBar({ state, act, reset }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void; reset: () => void }) {
  const { t } = useTranslation();
  const me = state.players[0]!; let label = t("common.continue"); let fn: ((s: PorenaGameState) => PorenaGameState) | null = null;
  if (state.phase === "SHOP") { label = t("action.confirmShop", { round: state.round }); fn = prepareShowdown; }
  if (state.phase === "DECK_SELECT") { label = t("action.confirmSelection", { count: me.selectedCardIds.length }); fn = confirmSelection; }
  if (state.phase === "GROUP_ASSIGNMENT") { label = t("action.confirmBracket"); fn = beginSecondary; }
  if (state.phase === "SURVIVAL_READY") { label = t(isSurvivalParticipant(state.survival?.playerIds ?? [], me.id) ? "action.startTiebreak" : "action.spectate"); fn = resolveSurvival; }
  if (state.phase === "ROUND_RESULT") { label = t("action.closeRound"); fn = leaveRoundResult; }
  const requiredSelection = 2;
  if (state.phase === "GAME_RESULT" || state.phase === "NEXT_ROUND" || (!fn && !me.eliminated)) return null;
  return <div className="action-bar action-only">{fn ? <button className="primary" onClick={() => act(fn!)} disabled={state.phase === "DECK_SELECT" && me.selectedCardIds.length !== requiredSelection}>{label}<span>→</span></button> : <button className="primary" onClick={reset}>{t("action.newGame")}<span>↻</span></button>}</div>;
}

export function App({ onHome }: { onHome: () => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState(() => createGame()); const [error, setError] = useState<ReceivedGameError | null>(null);
  const [exiting, setExiting] = useState(false);
  const [gameVersion, setGameVersion] = useState(0);
  const [manualGuideRound, setManualGuideRound] = useState<Round | null>(null);
  const roundGuidePreferences = useRoundGuidePreferences();
  const expireResult = useCallback(() => setState((current) => advanceLocalNextRound(current.phase === "ROUND_RESULT" ? leaveRoundResult(current) : current)), []);
  const draftPickIndex = state.draft?.picks.length ?? 0;
  const draftPickerId = state.draft?.order[draftPickIndex]?.playerId;
  const guideOpen = manualGuideRound !== null || shouldAutoShowRoundGuide(roundGuidePreferences.autoEnabled, roundGuidePreferences.seenRounds, state.round);
  const guideRound = manualGuideRound ?? state.round;
  const closeGuide = () => {
    markRoundGuideSeen(guideRound);
    setManualGuideRound(null);
  };
  useEffect(() => {
    const phase = state.phase;
    if (guideOpen) return;
    if (!["DRAFT_ORDER", "OPEN_DRAFT", "RUN_LOADOUT", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(phase)) return;
    const delay = phase === "DRAFT_ORDER" ? BARRIER_TIMEOUT_MS.DRAFT_DEAL_IN
      : phase === "RUN_LOADOUT" ? BARRIER_TIMEOUT_MS.RUN_LOADOUT
      : phase === "SHOWDOWN_PRIMARY" || phase === "SHOWDOWN_SECONDARY" ? BARRIER_TIMEOUT_MS.MATCH_SETUP
      : draftPickerId === "p1" ? 20_000 : BARRIER_TIMEOUT_MS.BOT_DRAFT_PICK;
    const timer = setTimeout(() => setState((s) => advanceLocalNextRound(phase === "DRAFT_ORDER" ? openDraft(s)
      : phase === "RUN_LOADOUT" ? lockRunLoadouts(s)
      : phase === "SHOWDOWN_PRIMARY" ? resolvePrimary(s)
      : phase === "SHOWDOWN_SECONDARY" ? resolveSecondary(s)
      : autoPickDraft(s))), delay);
    return () => clearTimeout(timer);
  }, [state.phase, draftPickIndex, draftPickerId, guideOpen]);
  useEffect(() => { if (state.round === 5) preloadFinalArena(); else preloadShowdownStage(state.round); }, [state.round]);
  const act = (fn: (s: PorenaGameState) => PorenaGameState) => { try { setState(advanceLocalNextRound(fn(state))); setError(null); } catch (caught) { const message = caught instanceof Error ? caught.message : ""; setError({ ...classifyGameError(message), message }); } };
  const alive = state.players.filter((player) => !player.eliminated).length;
  const prep = getPrepPresentation(state.round, state.phase);
  const myMatches = state.roundResults.filter((match) => match.playerIds.includes("p1"));
  const cinematicMatches = (myMatches.length ? myMatches : state.roundResults).map((match) => createMatchView(state, match));
  const draftView = createPlayerView({ schema: 1, roomId: "LOCAL", revision: 0, status: "PLAYING", game: state, sessions: [{ playerId: "p1", tokenHash: "local", requests: [] }], readyIds: [], endedShopIds: [] }, "p1");
  const isShowdownPrep = ["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(state.phase);
  const draftAction = (a: GameAction) => {
    if (a.type === "DRAFT_PICK") act((s) => pickDraftCard(s, "p1", a.cardId));
    if (a.type === "RUN_LOADOUT") act((s) => setRunLoadout(s, "p1", a.cardIds));
    if (a.type === "LOCK_RUN_LOADOUT") act(lockRunLoadouts);
  };
  const reset = () => { setGameVersion((value) => value + 1); setState(createGame()); };
  return <CinematicGate key={gameVersion} soundSessionId={`local:${gameVersion}`} matches={cinematicMatches} profiles={state.players.map((p) => ({ playerId: p.id, name: p.name, points: p.points, alive: !p.eliminated }))} viewerId="p1"><LocalResultWindow key={`${state.round}:${state.phase}`} active={state.phase === "ROUND_RESULT" && !pauseLocalResultTimer && !guideOpen} onExpire={expireResult}>{(resultSecondsLeft) => <main className="game-arena">
    {guideOpen ? <RoundGuide round={guideRound} onClose={closeGuide} confirmLabel={manualGuideRound === null ? undefined : t("round.returnToGame")} /> : null}
    <nav><a className="brand" href="#top"><span><img src="/assets/brand/porena-mark.webp" alt="" width="38" height="38" /></span><div><b>PORENA</b><small>TACTICAL POKER AUTOBATTLER</small></div></a><RoundProgress round={state.round} prep={prep} /><div className="nav-status"><div className="survivors"><small>SURVIVORS</small><b>{alive}<i>/ 8</i></b></div><div className="nav-actions"><button type="button" className="secondary round-guide-trigger" aria-label={t("nav.roundRulesAria", { round: state.round })} onClick={() => setManualGuideRound(state.round)}>?</button><button type="button" className="secondary nav-exit" onClick={() => setExiting(true)}>{t("exit.leave")}</button></div></div></nav>
      {exiting && <ExitGameDialog mode="single" onCancel={() => setExiting(false)} onConfirm={onHome} />}
    <div id="top" className={`page-shell ${state.phase === "SHOP" ? "shop-page" : ""} ${state.phase === "GAME_RESULT" ? "final-results-page" : ""}`}>
      {!isShowdownPrep && (prep ? <PrepRoundHeader prep={prep} /> : <header className="round-header"><div>{state.phase !== "GAME_RESULT" && <span className="round-number">{state.round === 2 && ["DRAFT_ORDER", "OPEN_DRAFT"].includes(state.phase) ? "ROUND 2 · DRAFT PHASE" : `ROUND 0${state.round}`}</span>}<h1>{state.phase === "GAME_RESULT" ? "FINAL STANDINGS" : ROUND_TITLES[state.round]}</h1></div>{state.phase !== "GAME_RESULT" && PHASE_LABEL[state.phase] && <div className="phase-badge"><b>{t(PHASE_LABEL[state.phase]!)}</b></div>}</header>)}
      {state.phase === "SHOP" && <PoolMeter state={state} />}
      {state.phase === "RUN_LOADOUT" && <LocalRunLoadoutStage key={state.phase} view={draftView} send={draftAction} />}
      {!guideOpen && ["DRAFT_ORDER", "OPEN_DRAFT"].includes(state.phase) && <TimedOpenDraftPanel key={`${state.phase}:${draftPickIndex}`} view={draftView} send={draftAction} disabled={false} seconds={null} durationSeconds={state.phase === "DRAFT_ORDER" ? 3 : draftPickerId === "p1" ? 20 : 2} />}
      {error ? <div className="error-toast" role="alert"><span>!</span>{renderGameError(error, t)}<button onClick={() => setError(null)}>×</button></div> : null}
      {state.phase === "SHOP" ? state.players[0]!.eliminated ? <section className="panel transition-panel"><span>OUT</span><h2>{t("spectator.mode")}</h2><p>{t("spectator.cardsReturned")}</p></section> : <ShopPanel state={state} act={act} /> : null}
      {state.phase === "DECK_SELECT" ? <SelectPanel state={state} act={act} /> : null}
      {state.phase === "SURVIVAL_READY" && state.survival ? <SurvivalReadyPanel {...state.survival} viewerId="p1" name={(id) => state.players.find((player) => player.id === id)?.name ?? id} /> : null}
      {["SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT"].includes(state.phase) ? <ShowdownPanel state={state} secondsLeft={resultSecondsLeft} matchup={draftView.showdownPrep} /> : null}
      {state.phase === "GAME_RESULT" ? <FinalPanel state={state} /> : null}
      {state.phase === "GAME_RESULT" && <section className="final-exit-actions" aria-label={t("final.nextActionsAria")}><button className="primary" onClick={reset}>{t("action.startNewGame")} <span>↻</span></button><button className="secondary" onClick={onHome}>{t("action.home")} <span>→</span></button></section>}
      <ActionBar state={state} act={act} reset={reset} />
      {!isShowdownPrep && <EventLog state={state} />}
    </div>
  </main>}</LocalResultWindow></CinematicGate>;
}
