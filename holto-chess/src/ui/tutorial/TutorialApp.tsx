import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BALANCE, purchaseLimitFor, regularShopSizeFor, rerollLimitFor } from "../../game/config";
import {
  beginSecondary, buyCard, chooseAugment, getCard, getCardPrice, leaveRoundResult, lockRunLoadouts, pickDraftCard,
  rerollShop, resolvePrimary, resolveSecondary, resolveSurvival, sellCard, setRunLoadout, startNextRound,
  prepareShowdown, finalStandings,
} from "../../game/engine";
import { createMatchView } from "../../game/matchView";
import { createPlayerView } from "../../game/playerView";
import { createRoundSummary } from "../../game/roundSummary";
import type { PorenaGameState } from "../../game/types";
import type { GameAction, MatchView } from "../../shared/protocol";
import { cinematicTimeline, frameAt } from "../../shared/presentationTimeline";
import { explainFinalReveal, explainResult, explainStreet, type HandExplanation } from "../../tutorial/showdownExplainer";
import { loadTutorial, markChapterDone, markChapterStarted, type TutorialSave } from "../../tutorial/storage";
import { tutorialBotPolicy } from "../../tutorial/tutorialBots";
import {
  advance, applyGame, chapterById, chapterFinished, completeChapter, currentStep, matchesPending, restartStep,
  startChapter, tutorialMatches, type TutorialSession,
} from "../../tutorial/tutorialController";
import { checkpointMs } from "../../tutorial/tutorialPlayback";
import { stepText, type ChapterId } from "../../tutorial/tutorialTypes";
import { CardView } from "../CardView";
import { FinalStandingRow, FinalStandingsHeader } from "../FinalStandingRow";
import { OpenDraftPanel, RunLoadoutPanel } from "../OpenDraft";
import { RoundResults } from "../RoundResults";
import { ShopCard } from "../ShopCard";
import { ShowdownCinematic } from "../ShowdownCinematic";
import { TutorialChapterMenu } from "./TutorialChapterMenu";
import { TutorialCoachmark } from "./TutorialCoachmark";
import { TutorialSpotlight } from "./TutorialSpotlight";
import { useCoachInset, useScrollIntoView, useSpotlight } from "./useSpotlight";
import "./tutorial.css";

type Screen = { kind: "menu" } | { kind: "chapter"; session: TutorialSession } | { kind: "chapter-done"; session: TutorialSession };

const RESULT_HOLDS = ["BEST5_GLOW", "COMPLETE", "RESULT", "RUN_RESULT"];
const STREET_HOLDS: Record<string, "FLOP" | "TURN" | "RIVER"> = { FLOP_HAND: "FLOP", TURN_HAND: "TURN", RIVER_SETTLE: "RIVER" };
/** R5 reveals the seven owned cards in batches instead of dealing a board. */
const FINAL_HOLDS: Record<string, number> = { FINAL_FIRST_HAND: 3, FINAL_SECOND_HAND: 5, FINAL_SEVEN_SETTLE: 7 };

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
      setError(caught instanceof Error ? caught.message : "연습 상태를 준비하지 못했습니다.");
      setScreen({ kind: "menu" });
    }
  }, []);

  if (screen.kind === "menu") {
    return <TutorialChapterMenu save={save} error={error} onStart={open} onHome={onHome} />;
  }
  if (screen.kind === "chapter-done") {
    const chapter = chapterById(screen.session.chapterId);
    const nextId = (chapter.id + 1) as ChapterId;
    return <main className="tutorial-screen tutorial-done">
      <section className="panel tutorial-done-panel">
        <span className="eyebrow">CHAPTER {chapter.id} · CLEAR</span>
        <h2>{chapter.id === 1 ? "기본 조작을 익혔어요" : `${chapter.title} 챕터를 마쳤어요`}</h2>
        <p>{chapter.id === 5 ? "이제 직접 패를 만들어볼 준비가 됐어요." : "이어서 포레나만의 규칙을 배워볼까요?"}</p>
        <div className="tutorial-done-actions">
          {chapter.id < 5 && <button type="button" className="primary" onClick={() => open(nextId, screen.session.game)}>계속 배우기 · {chapterById(nextId).title}</button>}
          <button type="button" className="secondary" onClick={onSinglePlay}>싱글 플레이로 연습하기</button>
          <button type="button" className="secondary" onClick={() => setScreen({ kind: "menu" })}>다른 챕터 다시 배우기</button>
          <button type="button" className="secondary" onClick={onHome}>홈으로</button>
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
  const chapter = chapterById(session.chapterId);
  const step = currentStep(session);
  const game = session.game;
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [guideHidden, setGuideHidden] = useState(false);
  const playedMatch = useRef<string>("");
  const elapsedRef = useRef(0);

  const act = (fn: (game: PorenaGameState) => PorenaGameState) => {
    try { onSession(applyGame(session, fn(session.game))); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "지금은 할 수 없는 동작이에요."); }
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
  }, [holdMatch, target]);

  const rect = useSpotlight(step?.focus);
  // Narrow screens put the guidance in a bottom sheet; everything else is laid out against it.
  const coachInset = useCoachInset(`${step?.id ?? ""}:${guideHidden}`);
  useScrollIntoView(step?.focus, step?.id ?? "");
  // Left unset until the sheet has actually been measured, so the stylesheet keeps its safe
  // worst-case fallback instead of being told the sheet takes up no room at all.
  const insetStyle = (coachInset > 0 ? { "--tutorial-sheet": `${coachInset}px` } : undefined) as CSSProperties | undefined;

  const explanation = useMemo<HandExplanation | null>(() => {
    if (!holdMatch || !step?.hold) return null;
    const boardIndex = frameAt(cinematicTimeline(holdMatch), target).boardIndex;
    const revealed = FINAL_HOLDS[step.hold.at];
    if (revealed) return explainFinalReveal(holdMatch, "p1", revealed);
    const street = STREET_HOLDS[step.hold.at];
    if (street) return explainStreet(holdMatch, "p1", boardIndex, street);
    if (!RESULT_HOLDS.includes(step.hold.at)) return null;
    const result = explainResult(holdMatch, "p1", boardIndex);
    // The BEST 5 beat explains the hand only; who won belongs to the result beat that follows.
    return result && step.hold.at === "BEST5_GLOW" ? { ...result, outcome: undefined } : result;
  }, [holdMatch, step, target]);

  const coach = step ? <TutorialCoachmark
    chapter={`${chapter.id}/5 · ${chapter.title}`}
    step={step.id}
    title={step.title}
    body={stepText(step.body, game)}
    more={stepText(step.more, game)}
    goal={step.goal}
    next={step.next}
    rect={rect}
    hidden={guideHidden}
    onHide={() => setGuideHidden(true)}
    onShow={() => setGuideHidden(false)}
    onNext={step.kind === "ACT" ? undefined : () => onSession(advance(session))}
    onRestart={() => onSession(restartStep(session))}
    onChapters={onChapters}
    onExit={onHome}
  /> : null;

  if (holdMatch) {
    return <div className="tutorial-screen tutorial-cinema" style={insetStyle}>
      <ShowdownCinematic match={holdMatch} profiles={game.players.map((player) => ({ playerId: player.id, name: player.name, points: player.points, alive: !player.eliminated }))}
        viewerId="p1" onComplete={() => {}} elapsedMs={elapsed} />
      {explanation ? <section className="tutorial-explain panel" aria-live="polite">
        <h3>{explanation.headline}</h3>
        {explanation.comparison ? <p>{explanation.comparison}</p> : null}
        {explanation.outcome ? <p className="tutorial-outcome">{explanation.outcome}</p> : null}
        {explanation.unused ? <p className="tutorial-muted">{explanation.unused}</p> : null}
        <details><summary>더 알아보기</summary>{explanation.detail.map((line, index) => <p key={index}>{line}</p>)}</details>
      </section> : null}
      {coach}
    </div>;
  }

  return <div className="tutorial-screen" style={insetStyle}>
    <TutorialSpotlight rect={rect} />
    <TutorialArena game={game} act={act} error={error} onDismissError={() => setError(null)} origin={session.origin} chapterTitle={chapter.title} chapterId={chapter.id} />
    {coach}
  </div>;
}

function TutorialArena({ game, act, error, onDismissError, origin, chapterTitle, chapterId }: {
  game: PorenaGameState; act: (fn: (game: PorenaGameState) => PorenaGameState) => void;
  error: string | null; onDismissError: () => void; origin: "continued" | "practice"; chapterTitle: string; chapterId: ChapterId;
}) {
  const me = game.players[0]!;
  const handLimit = BALANCE.handLimits[game.round];
  const shopSize = game.rulesVersion === 2 ? regularShopSizeFor(game.round) : me.shopSize;
  const rerollCost = Math.max(0, BALANCE.rerollCostBB - (me.augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0));
  const rerollLimit = rerollLimitFor(game.round, game.rulesVersion ?? 1);
  const view = createPlayerView({ schema: 1, roomId: "TUTORIAL", revision: 0, status: "PLAYING", game, sessions: [{ playerId: "p1", tokenHash: "tutorial", requests: [] }], readyIds: [], endedShopIds: [], augmentChoices: {} }, "p1");
  const send = (action: GameAction) => {
    if (action.type === "DRAFT_PICK") act((state) => pickDraftCard(state, "p1", action.cardId));
    if (action.type === "RUN_LOADOUT") act((state) => setRunLoadout(state, "p1", action.cardIds));
    if (action.type === "LOCK_RUN_LOADOUT") act(lockRunLoadouts);
  };
  return <main className="tutorial-arena">
    <header className="tutorial-header">
      <div><span className="eyebrow">체험 · 길라잡이</span><h1>{chapterId}/5 · {chapterTitle}</h1></div>
      <div className="tutorial-stats" data-tutorial-id="stack">
        <span><small>BB</small><b>{me.stackBB}</b></span>
        <span><small>POINT</small><b>{me.points}</b></span>
      </div>
    </header>
    {origin === "practice" && chapterId !== 1 ? <p className="tutorial-note">이 챕터는 준비된 연습 패로 시작합니다. 실제 게임에서는 카드 등장과 상대의 선택이 달라집니다.</p> : null}
    {error ? <div className="error-toast" role="alert"><span>!</span>{error}<button type="button" onClick={onDismissError}>×</button></div> : null}

    <section className="panel tutorial-inventory" data-tutorial-id="owned-cards">
      <header><h2>내 카드</h2><strong>{me.ownedCardIds.length} / {handLimit}</strong></header>
      <div className="card-row owned-row">
        {me.ownedCardIds.map((id) => <div className="tutorial-owned" key={id}>
          <CardView card={getCard(game, id)} />
          {/* Not offered on the single starting card: chapter 1 opens by explaining that card, and
              selling it there leaves the reader staring at an empty row nothing has taught yet. */}
          {game.phase === "SHOP" && me.ownedCardIds.length > 1 && <button type="button" className="secondary tutorial-sell" onClick={() => act((state) => sellCard(state, "p1", id))}>판매</button>}
        </div>)}
        {Array.from({ length: Math.max(0, handLimit - me.ownedCardIds.length) }, (_, index) => <div className="empty-card" key={index}><span>+</span><small>EMPTY</small></div>)}
      </div>
      <p className="tutorial-muted">카드를 눌러도 팔리지 않습니다. 판매는 아래 판매 버튼으로만 이루어져요.</p>
    </section>

    {game.phase === "SHOP" ? <section className="panel tutorial-shop" data-tutorial-id="shop">
      <header><h2>카드 마켓</h2><span>구매 {me.purchasesThisRound} / {purchaseLimitFor(game.round, game.rulesVersion ?? 1)}</span></header>
      <div className="card-row market-row">
        {/* No onLock: the guide does not teach locking yet, and a button that silently does nothing
            is worse than no button on the one screen meant to explain the controls. */}
        {me.shopCardIds.map((id, index) => <ShopCard key={id} dealIndex={index} card={getCard(game, id)} price={getCardPrice(game, "p1", id)}
          onBuy={() => act((state) => buyCard(state, "p1", id))} />)}
        {!me.shopCardIds.length ? <p className="market-empty">상점 카드가 모두 소진되었습니다.</p> : null}
      </div>
      <div className="market-actions">
        <button type="button" className="secondary" disabled={(me.rerollsUsed ?? 0) >= rerollLimit || me.stackBB < rerollCost || shopSize === 0}
          onClick={() => act((state) => rerollShop(state, "p1"))}>↻ 리롤 <b>{rerollCost}BB</b> · {me.rerollsUsed ?? 0} / {rerollLimit}</button>
      </div>
    </section> : null}

    {["DRAFT_ORDER", "OPEN_DRAFT"].includes(game.phase) ? <div data-tutorial-id="draft"><OpenDraftPanel view={view} send={send} disabled={false} seconds={null} /></div> : null}
    {game.phase === "RUN_LOADOUT" ? <div data-tutorial-id="run-loadout"><RunLoadoutPanel view={view} send={send} disabled={false} seconds={null} showTimer={false} /></div> : null}

    {game.phase === "AUGMENT" ? <section className="panel augment-panel" data-tutorial-id="augment">
      <span className="eyebrow">AUGMENT DRAFT</span><h2>증강 하나를 선택하세요</h2>
      <div className="augment-grid">{game.augmentChoices.map((augment, index) => <button type="button" key={augment.id} onClick={() => act((state) => chooseAugment(state, "p1", augment.id))}>
        <span>0{index + 1}</span><b>{augment.name}</b><p>{augment.description}</p><em>선택하기 →</em>
      </button>)}</div>
    </section> : null}

    {["GROUP_ASSIGNMENT", "ROUND_RESULT"].includes(game.phase) ? <div data-tutorial-id="round-results">
      <RoundResults round={game.round} rows={createRoundSummary(game)} viewerId="p1" showBrackets={game.round === 4 && game.phase === "GROUP_ASSIGNMENT"} secondsLeft={null}>
        <p className="tutorial-muted">여기서는 시간이 흐르지 않습니다. 충분히 읽고 넘어가세요.</p>
      </RoundResults>
    </div> : null}

    {game.phase === "GAME_RESULT" ? <section className="panel" data-tutorial-id="final-score">
      <span className="eyebrow">FINAL SCORE</span><h2>최종 총점</h2>
      <div className="standings"><FinalStandingsHeader />{finalStandings(game).map((row) => <FinalStandingRow key={row.playerId} row={{ ...row, displayName: row.hand?.displayName ?? "" }} name={game.players.find((player) => player.id === row.playerId)?.name ?? row.playerId} />)}</div>
    </section> : null}

    <div className="action-bar action-only" data-tutorial-id="action-bar">
      {game.phase === "SHOP" && <button type="button" className="primary" onClick={() => act((state) => prepareShowdown(state, ["p1"], tutorialBotPolicy))}>구성 확정 · R{game.round} 쇼다운 <span>→</span></button>}
      {game.phase === "GROUP_ASSIGNMENT" && <button type="button" className="primary" onClick={() => act(beginSecondary)}>브래킷 확인 · 2차전 <span>→</span></button>}
      {game.phase === "ROUND_RESULT" && <button type="button" className="primary" onClick={() => act(leaveRoundResult)}>라운드 마감 <span>→</span></button>}
      {game.phase === "NEXT_ROUND" && <button type="button" className="primary" onClick={() => act(startNextRound)}>다음 라운드로 <span>→</span></button>}
    </div>
  </main>;
}
