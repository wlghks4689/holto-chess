import { ArenaBrand } from "./ArenaBrand";
import { GameViewportReset } from "./GameViewportReset";
import { ShopAbilityPanel, RoundAbilityBenefits } from "./AbilityVisibility";
import { abilityBenefit, personalAbilityCues } from "../game/abilityVisibility";
import { finalPrepMatchup } from "./finalPrepMatchup";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cardPrice, handLimitFor, isFinalRound, isLineupFinal, isTripleRunRound, lastRoundFor, minHandFor, purchaseLimitFor } from "../game/config";
import { abilityLockCost, abilityRerollCost, abilityRerollLimit, abilitySellRate, abilityShopSize } from "../game/abilities";
import {
  beginSecondary, buyCard, confirmSelection, createAbilityGame, openAbilitySelection, pickAbility, autoPickAbility, finishAbilitySelection, finalStandings, leaveRoundResult,
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
import { CENTERED_HEADER_PHASES } from "./phaseHeader";
import { getPrepPresentation } from "./prepPresentation";
import { preloadFinalArena } from "./finalShowdownPresentation";
import { ExitGameDialog } from "./ExitGameDialog";
import { preloadShowdownStage } from "./showdownStage";
import { openDraft, autoPickDraft, pickDraftCard, completeDraft, isDraftRevealing, setRunLoadout, lockRunLoadouts, resolveSurvival } from "../game/engine";
import { createPlayerView } from "../game/playerView";
import { RunLoadoutPanel, TimedOpenDraftPanel } from "./OpenDraft";
import type { GameAction, ShowdownPrepView } from "../shared/protocol";
import { LocalResultWindow } from "./LocalResultWindow";
import { classifyGameError } from "../shared/gameErrorCode";
import { renderGameError, type ReceivedGameError } from "../i18n/gameError";
import { localizedIcmDetail } from "./rewardDetail";
import { localizeSeatNames } from "./botNames";
import { FinalStandingRow, FinalStandingsHeader } from "./FinalStandingRow";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { useLocalCountdown } from "./useLocalCountdown";
import { FinalRoundTransition, ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { HandScoreDisclosure } from "./HandScoreDisclosure";
import { SurvivalReadyPanel } from "./SurvivalReadyPanel";
import { AbilitySelectionPanel } from "./AbilitySelectionPanel";
import { isSurvivalParticipant } from "./survivalReadyPresentation";
import { advanceLocalNextRound } from "./localRoundTransition";
import { markRoundGuideSeen, shouldAutoShowRoundGuide, useRoundGuidePreferences } from "./roundGuidePreferences";
import { useTranslation, type TranslationKey } from "../i18n";
import { SellCardDialog } from "./SellCardDialog";
import { FinalAuctionPanel } from "./FinalAuctionPanel";
import { OwnedHandLabel } from "./OwnedHandLabel";
import { bidFinalAuction, settleFinalAuction, setFinalLoadout } from "../game/finalAuction";
import { tickAuctionBots } from "../game/finalAuctionBot";
import { finishFinalLoadouts } from "../game/engine";
import { autoChooseOpponent, chooseOpponent, completeOpponentSelect, finishCardAuctionReveal, isOpponentRevealing } from "../game/engine";
import { OpponentSelectPanel, R5OpponentBanner } from "./OpponentSelectPanel";
import { TripleRunLoadoutPanel } from "./TripleRunLoadoutPanel";
import { FinalLineupPanel } from "./FinalLineupPanel";
import { roundTitle } from "./roundTitles";
import { fastForwardToRound } from "./devFastForward";
/** Development only: `?devRound=N` lets the bots play the earlier rounds (see fastForwardToRound). */
const devStartRound = import.meta.env.DEV && typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("devRound")) : 0;
const newLocalGame = () => devStartRound >= 2 && devStartRound <= 6 ? fastForwardToRound(createAbilityGame(), devStartRound as Round) : createAbilityGame();
const pauseLocalResultTimer = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("pauseRoundResultTimer");

const PHASE_LABEL: Partial<Record<PorenaGameState["phase"], TranslationKey>> = {
  OPPONENT_SELECT: "phase.opponentSelect", DRAFT_ORDER: "phase.draftOrder", OPEN_DRAFT: "draft.title", RUN_LOADOUT: "phase.runLoadout", SURVIVAL_READY: "phase.survival",
  SHOP: "shop.title", DECK_SELECT: "phase.deckSelect", GROUP_ASSIGNMENT: "phase.groupAssignment", ROUND_RESULT: "result.round", GAME_RESULT: "history.finalResult",
};

function LocalRunLoadoutStage({ view, send, tripleRun, lineup }: {
  view: ReturnType<typeof createPlayerView>; send: (action: GameAction) => void; tripleRun: boolean; lineup: boolean;
}) {
  const seconds = useLocalCountdown((lineup ? BARRIER_TIMEOUT_MS.FINAL_LINEUP : BARRIER_TIMEOUT_MS.RUN_LOADOUT) / 1000);
  if (lineup) return <FinalLineupPanel view={view} send={send} disabled={false} seconds={seconds} />;
  return tripleRun ? <TripleRunLoadoutPanel view={view} send={send} disabled={false} seconds={seconds} />
    : <RunLoadoutPanel view={view} send={send} disabled={false} seconds={seconds} />;
}

function LocalOpponentStage({ view, send }: { view: ReturnType<typeof createPlayerView>; send: (action: GameAction) => void }) {
  // Mirrors the phase timer: the leader's 15s choice (a bot picks sooner), then the 3s pairing reveal.
  const pick = view.opponentSelect;
  const durationMs = pick?.opponentId ? BARRIER_TIMEOUT_MS.OPPONENT_REVEAL
    : pick?.chooserId === "p1" ? BARRIER_TIMEOUT_MS.OPPONENT_SELECT : BARRIER_TIMEOUT_MS.BOT_OPPONENT_SELECT;
  const seconds = useLocalCountdown(Math.ceil(durationMs / 1000), `${pick?.chooserId ?? ""}:${pick?.opponentId ?? ""}`);
  return <OpponentSelectPanel view={view} send={send} disabled={false} seconds={seconds} />;
}

function LocalAbilityStage({ view, send, duration }: { view: ReturnType<typeof createPlayerView>; send: (action: GameAction) => void; duration: number }) {
  const seconds = useLocalCountdown(duration, `${view.phase}:${view.abilityDraft?.pickedCount}`);
  return <AbilitySelectionPanel view={view} send={send} seconds={seconds} />;
}

function LocalShowdownPrep({ state, matchup }: { state: PorenaGameState; matchup?: ShowdownPrepView }) {
  const { t } = useTranslation();
  const seconds = useLocalCountdown(BARRIER_TIMEOUT_MS.MATCH_SETUP / 1000);
  const playerName = state.players.find((player) => player.id === "p1")?.name ?? t("round.you");
  return <ShowdownPrepPanel round={state.round} final={isFinalRound(state.round, state)} playerName={playerName} seconds={seconds} secondary={state.phase === "SHOWDOWN_SECONDARY"} matchup={matchup} />;
}

export function ShopPanel({ state, act }: { state: PorenaGameState; act: (fn: (s: PorenaGameState) => PorenaGameState) => void }) {
  const { t } = useTranslation();
  const [pendingSale, setPendingSale] = useState<string | null>(null);
  const me = state.players[0]!; const cap = handLimitFor(state.round, state);
  const purchaseLimit = purchaseLimitFor(state.round, state); const rerollLimit = abilityRerollLimit(me, state.round, state);
  const shopSize = abilityShopSize(me, state.round, state);
  const lockedShopCardCount = me.shopCardIds.filter((id) => me.lockedShopCardIds?.includes(id)).length;
  const allShopCardsLocked = shopSize > 0 && lockedShopCardCount >= shopSize;
  const canSell = canSellWithoutBlocking({ ownedCount: me.ownedCardIds.length, purchases: me.purchasesThisRound,
    purchaseLimit, handLimit: minHandFor(state.round, state) });
  return <>{isFinalRound(state.round, state) && <HandScoreDisclosure />}<section className="shop-layout">
    <ShopAbilityPanel ability={me.abilityId} benefit={abilityBenefit(state.abilityEvents ?? [], me.id)} startingCard={me.firstCardId ? getCard(state, me.firstCardId) : undefined} />
    <div className="inventory panel">
      <header><div className="shop-heading"><h2>{t("shop.myCards")}</h2><strong className="shop-count">{me.ownedCardIds.length} / {cap}</strong></div><div className="stat-block"><small>{t("shop.stack")}</small><strong>{me.stackBB}<i>BB</i></strong></div></header>
      <div className="card-row owned-row">{me.ownedCardIds.map((id) => {
        const card = getCard(state, id);
        const sellPercent = Math.round(abilitySellRate(me) * 100);
        const refund = Math.floor(cardPrice(card.rank) * sellPercent / 100);
        return <div className="owned-card" key={id}><CardView card={card} />
          <button type="button" className="secondary card-sell-button" disabled={!canSell} onClick={() => setPendingSale(id)}>{t(canSell ? "shop.sell" : "shop.cannotSell")}</button>
          {pendingSale === id && <SellCardDialog card={card} refund={refund} sellPercent={sellPercent} onCancel={() => setPendingSale(null)} onConfirm={() => { setPendingSale(null); act((s) => sellCard(s, me.id, id)); }} />}
        </div>;
      })}
        {Array.from({ length: Math.max(0, cap - me.ownedCardIds.length) }, (_, i) => <div className="empty-card" key={i}><span>+</span><small>EMPTY</small></div>)}</div>
      <OwnedHandLabel round={state.round} lastRound={lastRoundFor(state)} cards={me.ownedCardIds.map(id => getCard(state, id))} />
    </div>
    <div className="market panel">
      <header><div className="shop-heading"><h2>{t("shop.market")}</h2><strong className="shop-count">{me.shopCardIds.length} / {shopSize}</strong></div><span className="purchase-count">{t("shop.purchases", { used: me.purchasesThisRound, limit: purchaseLimit })}</span></header>
      <div className={`card-row market-row ${(me.rerollsUsed ?? 0) > 0 ? "has-rerolled" : ""} ${me.shopCardIds.length > 1 ? "has-multiple-cards" : ""}`}>{me.shopCardIds.map((id, index) => <ShopCard key={id} dealIndex={index} card={getCard(state, id)} price={getCardPrice(state, me.id, id)} locked={me.lockedShopCardIds?.includes(id) ?? false} lockCost={abilityLockCost(me)} onBuy={() => act((s) => buyCard(s, me.id, id))} onLock={() => act((s) => toggleShopLock(s, me.id, id))} />)}
        {!me.shopCardIds.length ? <p className="market-empty">{t("shop.soldOut")}</p> : null}</div>
      <div className="market-actions"><button className="secondary" disabled={allShopCardsLocked || (me.rerollsUsed ?? 0) >= rerollLimit || me.stackBB < abilityRerollCost(me)} onClick={() => act((s) => rerollShop(s, me.id))}>{t("shop.rerollStatus", { cost: abilityRerollCost(me), used: me.rerollsUsed ?? 0, limit: rerollLimit })}</button></div>
    </div>
  </section></>;
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
  const stageLabel = match.runCards && match.runoutCount === 3 ? "RUN IT THREE TIMES" : match.matchday ? state.round === 2 ? `MATCH ${match.matchday}/2 · RUN IT TWICE` : `MATCH ${match.matchday}/3 · ${state.round === 3 && match.matchday === 1 ? "SEED GROUP" : "SWISS PAIRING"}` : match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : t(match.stage === "final" ? "match.final" : match.group === "winner" ? "match.winnerGroup" : match.group === "loser" ? "match.survivalGroup" : match.stage === "secondary" ? "match.second" : "match.first");
  const outcomeLabel = t(match.stage === "final" ? "match.finalFirst" : match.group === "loser" ? "match.survived" : "match.win");
  return <article className="match-card">
    {match.highCardDraw && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    <header><span>{t("match.numberStage", { number: matchNumber, stage: stageLabel })}</span><b>{match.runCards ? t("match.independentRuns") : t("match.winnerOutcome", { players: winnerNames, outcome: outcomeLabel })}</b>{match.suddenDeathCount ? <em>{t("match.tiebreakCount", { count: match.suddenDeathCount })}</em> : null}</header>
    {match.boards.length ? <div className={`boards ${match.boards.length > 1 ? "multi-board" : ""}`}>{match.boards.map((board, boardIndex) => {
      const winners = match.boardWinnerIds[boardIndex] ?? [];
      const winnerUsed = new Set((match.boardResults[boardIndex] ?? []).filter((result) => winners.includes(result.playerId)).flatMap((result) => result.usedCardIds));
      const label = boardIndex < match.runoutCount ? (match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : t("match.board")) : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      return <div className={`board made-${madeTone((match.boardResults[boardIndex] ?? []).find((r) => winners.includes(r.playerId))?.hand.displayName ?? "")} ${boardIndex >= match.runoutCount ? "sudden-board" : ""}`} key={`${match.id}-board-${boardIndex}`}><small>{label}</small><div className="card-row centered">{board.map((card) => <CardView key={card.id} card={card} compact glow={winnerUsed.has(card.id)} dimmed={!winnerUsed.has(card.id)} />)}</div>{match.runoutCount >= 2 && boardIndex < match.runoutCount && <RunWinner winners={winners.map(name)} />}</div>;
    })}</div> : <div className="no-board">NO COMMUNITY · THE LAST HAND</div>}
    <div className={`combatants ${match.playerIds.length > 2 ? "multi" : ""}`}>{[...match.results].sort((a, b) => a.place - b.place).map((result) => {
      const player = state.players.find((p) => p.id === result.playerId)!; const winner = match.winnerIds.includes(player.id); const shownIds = match.runCards?.[player.id]?.at(-1) ?? match.revealedCardIds[player.id] ?? [];
      const reward = match.rewards?.find((entry) => entry.playerId === player.id);
      return <div key={player.id} className={`combatant ${winner ? "winner" : ""}`}><div className="combatant-title"><span>{winner ? "♔" : `#${result.place}`}</span><b>{player.name}</b>{reward && <em>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))}P</em>}</div>{localizedIcmDetail(reward?.detail, t) && <p className="combatant-detail">{localizedIcmDetail(reward?.detail, t)}</p>}<ShowdownHand cards={shownIds.map((id) => getCard(state, id))} usedCardIds={result.usedCardIds} winner={winner} displayName={result.hand.displayName} category={result.hand.category} kickers={result.hand.kickers} /></div>;
    })}</div>
  </article>;
}

function ShowdownPanel({ state, secondsLeft, matchup }: { state: PorenaGameState; secondsLeft: number | null; matchup?: ShowdownPrepView }) {
  if (["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(state.phase)) return isFinalRound(state.round, state)
    ? <FinalRoundTransition round={state.round} matchup={matchup ?? finalPrepMatchup(state.players.filter(p => !p.eliminated).map(p => ({ playerId: p.id, name: p.name, points: p.points, abilityId: p.abilityId })), "p1")} seconds={secondsLeft} />
    : <LocalShowdownPrep state={state} matchup={matchup} />;
  if (!state.roundResults.length) return null;
  return <RoundResults round={state.round} rows={createRoundSummary(state)} viewerId="p1" showBrackets={state.round === 4 && state.phase === "GROUP_ASSIGNMENT"} secondsLeft={state.phase === "ROUND_RESULT" ? secondsLeft : null}>{roundMatches(state).filter((match) => match.playerIds.includes("p1")).map((match, index) => <MatchCard state={state} match={match} matchNumber={index + 1} key={match.id} />)}</RoundResults>;
}

function FinalPanel({ state }: { state: PorenaGameState }) {
  const standings = finalStandings(state);
  return <section className="final-panel"><div className="standings"><FinalStandingsHeader />{standings.map((row) => <FinalStandingRow key={row.playerId} row={{ ...row, displayName: row.hand?.displayName ?? "" }} name={state.players.find((p) => p.id === row.playerId)?.name ?? row.playerId} />)}</div></section>;
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
  // The match loading screen fills the viewport; an eliminated viewer's new-game bar would sit on its footer.
  if (!fn && ["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(state.phase)) return null;
  return <div className="action-bar action-only">{fn ? <button className="primary" onClick={() => act(fn!)} disabled={state.phase === "DECK_SELECT" && me.selectedCardIds.length !== requiredSelection}>{label}<span>→</span></button> : <button className="primary" onClick={reset}>{t("action.newGame")}<span>↻</span></button>}</div>;
}

export function App({ onHome }: { onHome: () => void }) {
  const { locale, t } = useTranslation();
  const [rawState, setState] = useState(newLocalGame);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` changes only with `locale`.
  const state = useMemo(() => localizeSeatNames(rawState, t), [rawState, locale]); const [error, setError] = useState<ReceivedGameError | null>(null);
  const [exiting, setExiting] = useState(false);
  const [gameVersion, setGameVersion] = useState(0);
  const [manualGuideRound, setManualGuideRound] = useState<Round | null>(null);
  const roundGuidePreferences = useRoundGuidePreferences();
  const expireResult = useCallback(() => setState((current) => advanceLocalNextRound(current.phase === "ROUND_RESULT" ? leaveRoundResult(current) : current)), []);
  const draftPickIndex = state.draft?.picks.length ?? 0;
  const draftPickerId = state.draft?.order[draftPickIndex]?.playerId;
  const buybackDraft = !!state.draft?.priceMultiplier;
  const draftRevealing = isDraftRevealing(state);
  const abilityPickIndex = state.abilityDraft?.picks.length ?? 0;
  const abilityPickerId = state.abilityDraft?.order[abilityPickIndex];
  const lastRound = lastRoundFor(state);
  // Timed auction rounds skip the automatic guide: the five-round final auction and the six-round R3 auction, which has its own pamphlet.
  const timedAuctionRound = state.sixRounds ? state.round === 3 : state.round === 5;
  const guideOpen = manualGuideRound !== null || !timedAuctionRound && shouldAutoShowRoundGuide(roundGuidePreferences.autoEnabled, roundGuidePreferences.seenRounds, state.round);
  const lineupStep = isLineupFinal(state.round, state);
  const opponentStep = `${state.opponentSelect?.chooserId ?? ""}:${state.opponentSelect?.opponentId ?? ""}`;
  const guideRound = manualGuideRound ?? state.round;
  const closeGuide = () => {
    markRoundGuideSeen(guideRound);
    setManualGuideRound(null);
  };
  useEffect(() => {
    const phase = state.phase;
    if (guideOpen) return;
    if (!["ABILITY_ORDER", "ABILITY_PICK", "ABILITY_REVEAL", "DRAFT_ORDER", "OPEN_DRAFT", "OPPONENT_SELECT", "RUN_LOADOUT", "SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(phase)) return;
    const [chooserId, opponentId] = opponentStep.split(":");
    const delay = phase === "OPPONENT_SELECT" ? opponentId ? BARRIER_TIMEOUT_MS.OPPONENT_REVEAL
        : chooserId === "p1" ? BARRIER_TIMEOUT_MS.OPPONENT_SELECT : BARRIER_TIMEOUT_MS.BOT_OPPONENT_SELECT
      : phase === "ABILITY_ORDER" || phase === "DRAFT_ORDER" ? BARRIER_TIMEOUT_MS.DRAFT_DEAL_IN
      : phase === "ABILITY_REVEAL" ? BARRIER_TIMEOUT_MS.ABILITY_REVEAL
      : phase === "ABILITY_PICK" ? abilityPickerId === "p1" ? BARRIER_TIMEOUT_MS.ABILITY_PICK : BARRIER_TIMEOUT_MS.BOT_DRAFT_PICK
      : phase === "RUN_LOADOUT" ? lineupStep ? BARRIER_TIMEOUT_MS.FINAL_LINEUP : BARRIER_TIMEOUT_MS.RUN_LOADOUT
      : phase === "SHOWDOWN_PRIMARY" || phase === "SHOWDOWN_SECONDARY" ? BARRIER_TIMEOUT_MS.MATCH_SETUP
      : draftRevealing ? BARRIER_TIMEOUT_MS.DRAFT_REVEAL
      : draftPickerId === "p1" ? buybackDraft ? BARRIER_TIMEOUT_MS.BUYBACK_PICK : 20_000 : BARRIER_TIMEOUT_MS.BOT_DRAFT_PICK;
    const timer = setTimeout(() => setState((s) => phase === "ABILITY_ORDER" ? openAbilitySelection(s)
      : phase === "ABILITY_PICK" ? autoPickAbility(s)
      : phase === "ABILITY_REVEAL" ? finishAbilitySelection(s)
      : phase === "OPPONENT_SELECT" ? isOpponentRevealing(s) ? completeOpponentSelect(s) : autoChooseOpponent(s)
      : advanceLocalNextRound(phase === "DRAFT_ORDER" ? openDraft(s)
      : phase === "RUN_LOADOUT" ? lockRunLoadouts(s)
      : phase === "SHOWDOWN_PRIMARY" ? resolvePrimary(s)
      : phase === "SHOWDOWN_SECONDARY" ? resolveSecondary(s)
      : isDraftRevealing(s) ? completeDraft(s)
      : autoPickDraft(s, true))), delay);
    return () => clearTimeout(timer);
  }, [state.phase, draftPickIndex, draftPickerId, buybackDraft, draftRevealing, abilityPickIndex, abilityPickerId, guideOpen, opponentStep, lineupStep]);
  const finalRound = isFinalRound(state.round, state);
  useEffect(() => { if (finalRound) preloadFinalArena(); else preloadShowdownStage(state.round, false); }, [state.round, finalRound]);
  useEffect(() => {
    if (state.phase !== "FINAL_AUCTION" && state.phase !== "FINAL_LOADOUT") return;
    const timer = setInterval(() => setState(s => {
      const now = Date.now();
      if (s.phase === "FINAL_AUCTION") {
        const auction = s.finalAuction!;
        // A settled R3 auction holds its result reveal, then moves on to the double-price buyback.
        if (auction.settledAt !== null) return now >= (auction.loadoutStartsAt ?? auction.settledAt) ? finishCardAuctionReveal(s, now) : s;
        if (now < auction.endsAt) return tickAuctionBots(s, ["p1"], now);
        const settled = settleFinalAuction(s, now);
        return settled.phase === "FINAL_LOADOUT" ? finishFinalLoadouts(settled, now) : settled;
      }
      return finishFinalLoadouts(s, now);
    }), 150);
    return () => clearInterval(timer);
  }, [state.phase]);
  const act = (fn: (s: PorenaGameState) => PorenaGameState) => { try { setState(advanceLocalNextRound(fn(state))); setError(null); } catch (caught) { const message = caught instanceof Error ? caught.message : ""; setError({ ...classifyGameError(message), message }); } };
  const prep = getPrepPresentation(state.round, state.phase, lastRound);
  const myMatches = state.roundResults.filter((match) => match.playerIds.includes("p1"));
  const cinematicMatches = (myMatches.length ? myMatches : state.roundResults).map((match) => { const view = createMatchView(state, match); view.abilityCues = personalAbilityCues(view.abilityCues ?? [], "p1"); return view; });
  const draftView = createPlayerView({ schema: 1, roomId: "LOCAL", revision: 0, status: "PLAYING", game: state, sessions: [{ playerId: "p1", tokenHash: "local", requests: [] }], readyIds: [], endedShopIds: [] }, "p1");
  const isShowdownPrep = ["SHOWDOWN_PRIMARY", "SHOWDOWN_SECONDARY"].includes(state.phase);
  const draftAction = (a: GameAction) => {
    if (a.type === "FINAL_AUCTION_BID") act(s => bidFinalAuction(s, "p1", a, Date.now()));
    if (a.type === "FINAL_LOADOUT") act(s => setFinalLoadout(s, "p1", a.cardIds, Date.now()));
    if (a.type === "LOCK_FINAL_LOADOUT") act(s => finishFinalLoadouts(setFinalLoadout(s, "p1", s.players[0]!.finalLoadoutCardIds ?? [], Date.now(), true), Date.now()));
    if (a.type === "READY" && state.phase === "ABILITY_REVEAL") act(finishAbilitySelection);
    if (a.type === "ABILITY_PICK") act(s => pickAbility(s, "p1", a.slot));
    if (a.type === "DRAFT_PICK") act((s) => pickDraftCard(s, "p1", a.cardId, true));
    if (a.type === "CHOOSE_OPPONENT") act((s) => chooseOpponent(s, "p1", a.playerId));
    if (a.type === "RUN_LOADOUT") act((s) => setRunLoadout(s, "p1", a.cardIds));
    if (a.type === "LOCK_RUN_LOADOUT") act(lockRunLoadouts);
  };
  const reset = () => { setGameVersion((value) => value + 1); setState(newLocalGame()); };
  const nav = <><nav><a className="brand" href="#top"><ArenaBrand /></a><RoundProgress round={state.round} prep={prep} lastRound={lastRound} /><div className="nav-status"><div className="nav-actions"><button type="button" className="secondary nav-exit" onClick={() => setExiting(true)}>{t("exit.leave")}</button></div></div></nav>
      {exiting && <ExitGameDialog mode="single" onCancel={() => setExiting(false)} onConfirm={onHome} />}</>;
  return <CinematicGate key={gameVersion} nav={nav} soundSessionId={`local:${gameVersion}`} matches={cinematicMatches} profiles={state.players.map((p) => ({ playerId: p.id, name: p.name, points: p.points, alive: !p.eliminated, abilityId: p.abilityId }))} viewerId="p1"><LocalResultWindow key={`${state.round}:${state.phase.startsWith("ABILITY_") ? "ABILITY" : state.phase}`} active={state.phase === "ROUND_RESULT" && !pauseLocalResultTimer && !guideOpen} onExpire={expireResult}>{(resultSecondsLeft) => <main className="game-arena">
    {guideOpen ? <RoundGuide round={guideRound} lastRound={lastRound} onClose={closeGuide} confirmLabel={manualGuideRound === null ? undefined : t("round.returnToGame")} /> : null}
    {nav}
    <div id="top" data-round={state.round} className={`page-shell ${state.phase === "SHOP" ? "shop-page" : ""} ${state.phase === "GAME_RESULT" ? "final-results-page" : ""}`}>
      <GameViewportReset screenKey={`local:${gameVersion}:${state.round}:${state.phase}`} />
      {state.phase.startsWith("ABILITY_") && <LocalAbilityStage view={draftView} send={draftAction} duration={(state.phase === "ABILITY_PICK" ? abilityPickerId === "p1" ? BARRIER_TIMEOUT_MS.ABILITY_PICK : BARRIER_TIMEOUT_MS.BOT_DRAFT_PICK : state.phase === "ABILITY_REVEAL" ? BARRIER_TIMEOUT_MS.ABILITY_REVEAL : BARRIER_TIMEOUT_MS.DRAFT_DEAL_IN) / 1000} />}
      {!isShowdownPrep && !state.phase.startsWith("ABILITY_") && (prep ? <PrepRoundHeader prep={prep} /> : <header className={`round-header ${CENTERED_HEADER_PHASES.includes(state.phase) ? "is-centered-phase-header" : ""} ${state.phase === "ROUND_RESULT" ? "is-result-header" : ""}`}><div>{state.phase !== "GAME_RESULT" && <span className="round-number">{[2, 4].includes(state.round) && ["DRAFT_ORDER", "OPEN_DRAFT"].includes(state.phase) ? `ROUND ${state.round} · DRAFT PHASE` : `ROUND 0${state.round}`}</span>}<div className="round-title-row"><h1>{state.phase === "GAME_RESULT" ? "FINAL STANDINGS" : roundTitle(state.round, lastRound)}</h1>{/* The rules button would cover the title on the result screens. */}{state.phase !== "GAME_RESULT" && state.phase !== "ROUND_RESULT" && <button type="button" className="secondary round-guide-trigger title-guide-trigger" aria-label={t("nav.roundRulesAria", { round: state.round })} onClick={() => setManualGuideRound(state.round)}>?</button>}</div></div>{state.phase !== "SHOP" && state.phase !== "GAME_RESULT" && state.phase !== "RUN_LOADOUT" && PHASE_LABEL[state.phase] && <div className="phase-badge"><b>{t(state.draft?.priceMultiplier && state.phase === "OPEN_DRAFT" ? "phase.buyback" : PHASE_LABEL[state.phase]!)}</b></div>}</header>)}
      {state.phase === "RUN_LOADOUT" && <LocalRunLoadoutStage key={state.phase} view={draftView} send={draftAction} tripleRun={isTripleRunRound(state.round, state)} lineup={isLineupFinal(state.round, state)} />}
      {!guideOpen && state.phase === "OPPONENT_SELECT" && <LocalOpponentStage key={opponentStep} view={draftView} send={draftAction} />}
      {["FINAL_AUCTION", "FINAL_LOADOUT"].includes(state.phase) && <FinalAuctionPanel view={draftView} send={draftAction} />}
      {!guideOpen && ["DRAFT_ORDER", "OPEN_DRAFT"].includes(state.phase) && <TimedOpenDraftPanel key={`${state.phase}:${draftPickIndex}`} view={draftView} send={draftAction} disabled={false} seconds={null} durationSeconds={state.phase === "DRAFT_ORDER" ? 3 : draftPickerId === "p1" ? (buybackDraft ? BARRIER_TIMEOUT_MS.BUYBACK_PICK : 20_000) / 1000 : 2} />}
      {error ? <div className="error-toast" role="alert"><span>!</span>{renderGameError(error, t)}<button onClick={() => setError(null)}>×</button></div> : null}
      {state.phase === "SHOP" && <R5OpponentBanner view={draftView} />}
      {state.phase === "SHOP" ? state.players[0]!.eliminated ? <section className="panel transition-panel"><span>OUT</span><h2>{t("spectator.mode")}</h2><p>{t("spectator.cardsReturned")}</p></section> : <ShopPanel state={state} act={act} /> : null}
      {["ROUND_RESULT", "GAME_RESULT"].includes(state.phase) && <RoundAbilityBenefits cues={draftView.roundAbilityCues} identityId="p1" />}
      {state.phase === "DECK_SELECT" ? <SelectPanel state={state} act={act} /> : null}
      {state.phase === "SURVIVAL_READY" && state.survival ? <SurvivalReadyPanel {...state.survival} viewerId="p1" name={(id) => state.players.find((player) => player.id === id)?.name ?? id} /> : null}
      {["SHOWDOWN_PRIMARY", "GROUP_ASSIGNMENT", "SHOWDOWN_SECONDARY", "ROUND_RESULT"].includes(state.phase) ? <ShowdownPanel state={state} secondsLeft={pauseLocalResultTimer ? BARRIER_TIMEOUT_MS.RESULTS / 1000 : resultSecondsLeft} matchup={draftView.showdownPrep} /> : null}
      {state.phase === "GAME_RESULT" ? <FinalPanel state={state} /> : null}
      {state.phase === "GAME_RESULT" && <section className="final-exit-actions" aria-label={t("final.nextActionsAria")}><button className="primary" onClick={reset}>{t("action.startNewGame")} <span>↻</span></button><button className="secondary" onClick={onHome}>{t("action.home")} <span>→</span></button></section>}
      <ActionBar state={state} act={act} reset={reset} />
    </div>
  </main>}</LocalResultWindow></CinematicGate>;
}
