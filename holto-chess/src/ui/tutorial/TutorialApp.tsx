import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localizeSeatNames } from "../botNames";
import { BALANCE, handLimitFor, isLineupFinal, isTripleRunRound, minHandFor, purchaseLimitFor, regularShopSizeFor, rerollLimitFor } from "../../game/config";
import {
  beginSecondary, buyCard, chooseOpponent, completeOpponentSelect, finishCardAuctionReveal, getCard, getCardPrice, isOpponentRevealing, lockRunLoadouts, pickDraftCard,
  rerollShop, resolvePrimary, resolveSecondary, resolveSurvival, sellCard, setRunLoadout,
  prepareShowdown, finalStandings,
} from "../../game/engine";
import { OpponentSelectPanel } from "../OpponentSelectPanel";
import { TripleRunLoadoutPanel } from "../TripleRunLoadoutPanel";
import { FinalLineupPanel } from "../FinalLineupPanel";
import { createMatchView } from "../../game/matchView";
import { createPlayerView } from "../../game/playerView";
import { createRoundSummary } from "../../game/roundSummary";
import type { PorenaGameState } from "../../game/types";
import type { GameAction, MatchView } from "../../shared/protocol";
import { cinematicTimeline, frameAt } from "../../shared/presentationTimeline";
import { explainResult, type HandExplanation } from "../../tutorial/showdownExplainer";
import { loadTutorial, markChapterDone, markChapterStarted, type TutorialSave } from "../../tutorial/storage";
import { tutorialBotPolicy } from "../../tutorial/tutorialBots";
import {
  advance, applyGame, chapterById, chapterFinished, completeChapter, currentStep, matchesPending, restartStep,
  startChapter, tutorialMatches, type TutorialSession,
} from "../../tutorial/tutorialController";
import { checkpointMs } from "../../tutorial/tutorialPlayback";
import { stepText, type ChapterId } from "../../tutorial/tutorialTypes";
import { EN_CHAPTERS, englishStepCopy } from "../../tutorial/englishCopy";
import { useTranslation } from "../../i18n";
import { classifyGameError } from "../../shared/gameErrorCode";
import { renderGameError } from "../../i18n/gameError";
import { CardView } from "../CardView";
import { FinalStandingRow, FinalStandingsHeader } from "../FinalStandingRow";
import { OpenDraftPanel, RunLoadoutPanel } from "../OpenDraft";
import { RoundResults } from "../RoundResults";
import { ShopCard } from "../ShopCard";
import { ShowdownCinematic } from "../ShowdownCinematic";
import { TutorialChapterMenu } from "./TutorialChapterMenu";
import { TutorialCoachmark } from "./TutorialCoachmark";
import "./tutorial.css";
import { FinalAuctionPanel } from "../FinalAuctionPanel";
import { bidFinalAuction, setFinalLoadout, settleFinalAuction } from "../../game/finalAuction";
import { finishFinalLoadouts } from "../../game/engine";

type Screen = { kind: "menu" } | { kind: "chapter"; session: TutorialSession } | { kind: "chapter-done"; session: TutorialSession };

const RESULT_HOLDS = ["BEST5_GLOW", "COMPLETE", "RESULT", "RUN_RESULT"];

/** Only phases the player is not asked to drive are stepped for them, and only to reach a beat. */
function resolvePending(game: PorenaGameState): PorenaGameState {
  switch (game.phase) {
    case "SHOWDOWN_PRIMARY": return resolvePrimary(game);
    case "SHOWDOWN_SECONDARY": return resolveSecondary(game);
    case "SURVIVAL_READY": return resolveSurvival(game);
    default: return game;
  }
}

export function TutorialApp({ onHome, onSinglePlay }: { onHome: () => void; onSinglePlay: () => void }) {
  const { locale, t } = useTranslation();
  const [save, setSave] = useState<TutorialSave>(() => loadTutorial());
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((chapter: ChapterId, carried?: PorenaGameState) => {
    try {
      const session = startChapter(chapter, carried);
      setSave((current) => markChapterStarted(current, chapter));
      setScreen({ kind: "chapter", session });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("tutorial.initFailed"));
      setScreen({ kind: "menu" });
    }
  }, [t]);

  if (screen.kind === "menu") {
    return <TutorialChapterMenu save={save} error={error} onStart={open} onHome={onHome} />;
  }
  if (screen.kind === "chapter-done") {
    const chapter = chapterById(screen.session.chapterId);
    const nextId = (chapter.id + 1) as ChapterId;
    return <main className="tutorial-screen tutorial-done">
      <section className="panel tutorial-done-panel">
        <span className="eyebrow">CHAPTER {chapter.id} · CLEAR</span>
        <h2>{chapter.id === 1 ? t("tutorial.basicsComplete") : t("tutorial.chapterComplete", { chapter: locale === "en-US" ? EN_CHAPTERS[chapter.id].title : chapter.title })}</h2>
        <p>{t("tutorial.readyToPlay")}</p>
        <div className="tutorial-done-actions">
          <button type="button" className="primary" onClick={onSinglePlay}>{t("tutorial.trySingle")}</button>
          {chapter.id < 6 && <button type="button" className="secondary" onClick={() => open(nextId, screen.session.game)}>{t("tutorial.continueWithChapter", { chapter: locale === "en-US" ? EN_CHAPTERS[nextId].title : chapterById(nextId).title })}</button>}
          <button type="button" className="secondary" onClick={() => setScreen({ kind: "menu" })}>{t("tutorial.otherChapters")}</button>
          <button type="button" className="secondary" onClick={onHome}>{t("action.home")}</button>
        </div>
      </section>
    </main>;
  }

  return <TutorialChapter
    key={`${screen.session.chapterId}:${screen.session.origin}`}
    session={screen.session}
    onSession={(session) => setScreen({ kind: "chapter", session })}
    onFinish={(session) => { setSave((current) => markChapterDone(current, session.chapterId)); setScreen({ kind: "chapter-done", session: completeChapter(session) }); }}
    onChapters={() => setScreen({ kind: "menu" })}
    onHome={onHome}
  />;
}

function TutorialChapter({ session, onSession, onFinish, onChapters, onHome }: {
  session: TutorialSession; onSession: (session: TutorialSession) => void;
  onFinish: (session: TutorialSession) => void; onChapters: () => void; onHome: () => void;
}) {
  const { locale, t } = useTranslation();
  const chapter = chapterById(session.chapterId);
  const step = currentStep(session);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` changes only with `locale`.
  const game = useMemo(() => localizeSeatNames(session.game, t), [session.game, locale]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [replay, setReplay] = useState(0);
  const playedMatch = useRef<string>("");
  const elapsedRef = useRef(0);

  const act = (fn: (game: PorenaGameState) => PorenaGameState) => {
    try { onSession(applyGame(session, fn(session.game))); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("tutorial.actionUnavailable")); }
  };

  // A beat that needs a showdown result resolves it right away: no countdown, no timer.
  useEffect(() => {
    if (!step?.hold) return;
    if (!matchesPending(game)) return;
    if (step.hold.matchIndex < tutorialMatches(game).length) return;
    const next = resolvePending(game);
    if (next !== game) onSession(applyGame(session, next));
  }, [step, game, session, onSession]);

  useEffect(() => { if (chapterFinished(session)) onFinish(session); }, [session, onFinish]);

  const matches: MatchView[] = useMemo(() => tutorialMatches(game).map((match) => createMatchView(game, match)), [game]);
  const holdMatch = step?.hold ? matches[step.hold.matchIndex] : undefined;
  const target = holdMatch && step?.hold ? checkpointMs(holdMatch, step.hold.at) ?? 0 : 0;

  // The cinematic runs on this clock alone, so it stops exactly on the checkpoint and waits there.
  // Reaching the checkpoint ends the clock rather than leaving a frame loop spinning on a held beat.
  useEffect(() => {
    if (!holdMatch) return;
    if (playedMatch.current !== holdMatch.id) { playedMatch.current = holdMatch.id; elapsedRef.current = 0; setElapsed(0); }
    if (elapsedRef.current >= target) { setElapsed(target); return; }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(120, now - last);
      last = now;
      elapsedRef.current = Math.min(target, elapsedRef.current + delta);
      setElapsed(elapsedRef.current);
      if (elapsedRef.current < target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [holdMatch, target, replay]);

  const watching = Boolean(holdMatch && elapsed < target);
  const explanation = useMemo<HandExplanation | null>(() => {
    // The explainer reads the active locale; force a fresh explanation when it changes.
    void locale;
    if (!holdMatch || !step?.hold || watching) return null;
    const boardIndex = frameAt(cinematicTimeline(holdMatch), target).boardIndex;
    if (!RESULT_HOLDS.includes(step.hold.at)) return null;
    const result = explainResult(holdMatch, "p1", boardIndex);
    // The BEST 5 beat explains the hand only; who won belongs to the result beat that follows.
    return result && step.hold.at === "BEST5_GLOW" ? { ...result, outcome: undefined } : result;
  }, [holdMatch, step, target, locale, watching]);

  const copy = step && locale === "en-US" ? englishStepCopy(step) : step;
  const chapterTitle = locale === "en-US" ? EN_CHAPTERS[chapter.id].title : chapter.title;
  const coach = step && copy ? <TutorialCoachmark
    progress={t("tutorial.stepProgress", { current: session.stepIndex + 1, total: chapter.steps.length })}
    step={step.id}
    title={watching ? t("tutorial.watching") : copy.title}
    body={watching ? [t("tutorial.watchHint")] : stepText(copy.body, game)}
    more={stepText(copy.more, game)}
    goal={copy.goal}
    next={watching ? t("tutorial.skipAnimation") : copy.next}
    explanation={explanation}
    onNext={step.kind === "ACT" ? undefined : () => {
      if (watching) { elapsedRef.current = target; setElapsed(target); }
      else onSession(advance(session));
    }}
    onRestart={() => {
      elapsedRef.current = 0; setElapsed(0); playedMatch.current = "";
      setReplay((value) => value + 1);
      onSession(restartStep(session));
    }}
  /> : null;

  return <div className={`tutorial-screen tutorial-workspace${holdMatch ? " tutorial-cinema" : ""}`} data-focus={step?.focus}>
    <header className="tutorial-topbar">
      <h1>{chapterTitle}</h1>
      <nav aria-label={t("tutorial.eyebrow")}>
        <button type="button" onClick={onChapters}>{t("tutorial.chooseChapter")}</button>
        <button type="button" onClick={onHome}>{t("tutorial.exit")}</button>
      </nav>
    </header>
    {coach}
    {holdMatch
      ? <ShowdownCinematic match={holdMatch} profiles={game.players.map((player) => ({ playerId: player.id, name: player.name, points: player.points, alive: !player.eliminated }))}
          viewerId="p1" onComplete={() => {}} elapsedMs={elapsed} />
      : <TutorialArena game={game} act={act} error={error} onDismissError={() => setError(null)} />}
  </div>;
}

function TutorialArena({ game, act, error, onDismissError }: {
  game: PorenaGameState; act: (fn: (game: PorenaGameState) => PorenaGameState) => void;
  error: string | null; onDismissError: () => void;
}) {
  const { locale, t } = useTranslation();
  const me = game.players[0]!;
  const handLimit = handLimitFor(game.round, game);
  const minHand = minHandFor(game.round, game);
  const shopSize = game.rulesVersion === 2 ? regularShopSizeFor(game.round, game) : me.shopSize;
  const rerollCost = BALANCE.rerollCostBB;
  const rerollLimit = rerollLimitFor(game.round, game);
  const auction = game.finalAuction;
  // Practice runs on fixed clocks: bidding open, then the result reveal of a settled auction.
  const auctionNow = !auction ? 0 : auction.settledAt !== null ? auction.loadoutStartsAt ?? auction.settledAt : game.phase === "FINAL_AUCTION" ? auction.startedAt + 1000 : auction.loadoutStartsAt! + 1;
  const view = createPlayerView({ schema: 1, roomId: "TUTORIAL", revision: 0, status: "PLAYING", game, sessions: [{ playerId: "p1", tokenHash: "tutorial", requests: [] }], readyIds: [], endedShopIds: [] }, "p1");
  const send = (action: GameAction) => {
    if (action.type === "FINAL_AUCTION_BID") act(s => bidFinalAuction(s, "p1", action, s.finalAuction!.startedAt + 1000));
    if (action.type === "CHOOSE_OPPONENT") act(s => chooseOpponent(s, "p1", action.playerId));
    if (action.type === "FINAL_LOADOUT") act(s => setFinalLoadout(s, "p1", action.cardIds, s.finalAuction!.loadoutStartsAt! + 1));
    if (action.type === "LOCK_FINAL_LOADOUT") act(s => finishFinalLoadouts(setFinalLoadout(s, "p1", s.players[0]!.finalLoadoutCardIds!, s.finalAuction!.loadoutStartsAt! + 1, true), s.finalAuction!.loadoutStartsAt! + 1));
    if (action.type === "DRAFT_PICK") act((state) => pickDraftCard(state, "p1", action.cardId));
    if (action.type === "RUN_LOADOUT") act((state) => setRunLoadout(state, "p1", action.cardIds));
    if (action.type === "LOCK_RUN_LOADOUT") act(lockRunLoadouts);
  };
  return <main className="tutorial-arena">
    {["FINAL_AUCTION", "FINAL_LOADOUT"].includes(game.phase) && <div data-tutorial-id="auction">
      <FinalAuctionPanel view={view} send={send} clock={{ now: () => auctionNow, offset: () => 0, observe: () => {} }} />
      {game.phase === "FINAL_AUCTION" && auction?.settledAt === null && <button className="primary" onClick={() => act(s => settleFinalAuction(s, s.finalAuction!.endsAt))}>{locale === "ko-KR" ? "경매 연습 종료 · 낙찰 확인" : "Finish auction practice · Reveal winners"}</button>}
      {game.phase === "FINAL_AUCTION" && auction && auction.settledAt !== null && <button className="primary" onClick={() => act(s => finishCardAuctionReveal(s, s.finalAuction!.loadoutStartsAt ?? s.finalAuction!.settledAt!))}>{locale === "ko-KR" ? "남은 카드 2배 가격 구매로" : "On to the double-price buy"}</button>}
      {game.phase === "FINAL_LOADOUT" && <div className="panel"><p>{game.finalAuction!.results!.map(r => `${game.players.find(p => p.id === r.playerId)!.name}: ${r.cardId} ${r.amount}BB`).join(" · ")}</p>{me.finalLoadoutLocked && <button className="primary" onClick={() => act(s => finishFinalLoadouts(s, s.finalAuction!.loadoutStartsAt!))}>{locale === "ko-KR" ? "출전 카드 공개 · 쇼다운" : "Reveal loadouts · Showdown"}</button>}</div>}
    </div>}
    {error ? <div className="error-toast" role="alert"><span>!</span>{locale === "ko-KR" ? error : renderGameError({ ...classifyGameError(error), message: error }, t)}<button type="button" onClick={onDismissError}>×</button></div> : null}

    {game.phase === "SHOP" && <section className="panel tutorial-inventory" data-tutorial-id="owned-cards">
      <header><h2>{t("shop.myCards")}</h2><span>{me.ownedCardIds.length} / {handLimit} · <b>{me.stackBB} BB</b></span></header>
      <div className="card-row owned-row" data-count={handLimit}>
        {me.ownedCardIds.map((id) => <div className="tutorial-owned" key={id}>
          <CardView card={getCard(game, id)} />

          {game.phase === "SHOP" && me.ownedCardIds.length > 1 && <button type="button" className="secondary tutorial-sell" onClick={() => act((state) => sellCard(state, "p1", id))}>{t("shop.sell")}</button>}
        </div>)}
        {Array.from({ length: Math.max(0, handLimit - me.ownedCardIds.length) }, (_, index) => <div className="empty-card" key={index}><span>+</span><small>EMPTY</small></div>)}
      </div>
    </section>}

    {game.phase === "SHOP" && me.ownedCardIds.length < handLimit ? <section className="panel tutorial-shop" data-tutorial-id="shop">
      <header><h2>{t("shop.market")}</h2><span>{t("shop.purchases", { used: me.purchasesThisRound, limit: purchaseLimitFor(game.round, game) })}</span></header>
      <div className="card-row market-row">
        {/* No onLock: the guide does not teach locking yet, and a button that silently does nothing
            is worse than no button on the one screen meant to explain the controls. */}
        {me.shopCardIds.map((id, index) => <ShopCard key={id} dealIndex={index} card={getCard(game, id)} price={getCardPrice(game, "p1", id)}
          disabled={me.ownedCardIds.length >= handLimit || me.stackBB < getCardPrice(game, "p1", id) || me.purchasesThisRound >= purchaseLimitFor(game.round, game)}
          onBuy={() => act((state) => buyCard(state, "p1", id))} />)}
        {!me.shopCardIds.length ? <p className="market-empty">{t("shop.soldOut")}</p> : null}
      </div>
      <div className="market-actions">
        <button type="button" className="secondary" disabled={(me.rerollsUsed ?? 0) >= rerollLimit || me.stackBB < rerollCost || shopSize === 0}
          onClick={() => act((state) => rerollShop(state, "p1"))}>{t("shop.rerollStatus", { cost: rerollCost, used: me.rerollsUsed ?? 0, limit: rerollLimit })}</button>
      </div>
    </section> : null}

    {["DRAFT_ORDER", "OPEN_DRAFT"].includes(game.phase) ? <div data-tutorial-id="draft"><OpenDraftPanel view={view} send={send} disabled={false} seconds={null} /></div> : null}
    {game.phase === "RUN_LOADOUT" ? <div data-tutorial-id="run-loadout">{isLineupFinal(game.round, game)
      ? <FinalLineupPanel view={view} send={send} disabled={false} seconds={null} />
      : isTripleRunRound(game.round, game)
      ? <TripleRunLoadoutPanel view={view} send={send} disabled={false} seconds={null} />
      : <RunLoadoutPanel view={view} send={send} disabled={false} seconds={null} showTimer={false} />}</div> : null}
    {game.phase === "OPPONENT_SELECT" ? <div data-tutorial-id="opponent"><OpponentSelectPanel view={view} send={send} disabled={false} seconds={null} />
      {isOpponentRevealing(game) && <div className="action-bar action-only"><button type="button" className="primary" onClick={() => act(completeOpponentSelect)}>{locale === "ko-KR" ? "R5 상점 열기" : "Open the R5 shop"} <span>→</span></button></div>}</div> : null}


    {["GROUP_ASSIGNMENT", "ROUND_RESULT"].includes(game.phase) ? <div data-tutorial-id="round-results">
      <RoundResults round={game.round} rows={createRoundSummary(game)} viewerId="p1" showBrackets={game.round === 4 && game.phase === "GROUP_ASSIGNMENT"} secondsLeft={null} />
    </div> : null}

    {game.phase === "GAME_RESULT" ? <section className="panel" data-tutorial-id="final-score">
      <span className="eyebrow">FINAL SCORE</span><h2>{t("tutorial.finalScore")}</h2>
      <div className="standings"><FinalStandingsHeader />{finalStandings(game).map((row) => <FinalStandingRow key={row.playerId} row={{ ...row, displayName: row.hand?.displayName ?? "" }} name={game.players.find((player) => player.id === row.playerId)?.name ?? row.playerId} />)}</div>
    </section> : null}

    {(game.phase === "GROUP_ASSIGNMENT" || (game.phase === "SHOP" && me.ownedCardIds.length >= minHand)) && <div className="action-bar action-only" data-tutorial-id="action-bar">
      {game.phase === "SHOP" && <button type="button" className="primary" disabled={me.ownedCardIds.length < minHand} onClick={() => act((state) => prepareShowdown(state, ["p1"], tutorialBotPolicy))}>{t("action.confirmShop", { round: game.round })} <span>→</span></button>}
      {game.phase === "GROUP_ASSIGNMENT" && <button type="button" className="primary" onClick={() => act(beginSecondary)}>{t("action.confirmBracket")} <span>→</span></button>}
    </div>}
  </main>;
}
