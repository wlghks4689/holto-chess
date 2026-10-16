import { AbilityBadge } from "./AbilityVisibility";
import { GameViewportReset } from "./GameViewportReset";
import { activeAbilityCues } from "./abilityPresentation";
import { useEffect, useRef, useState } from "react";
import { EquityMeter } from "./EquityMeter";
import { equityBoardCount, releasedEquityBoardCount } from "./streetEquity";
import { streetEquityJob } from "./displayEquity";
import { useDisplayEquity } from "./useDisplayEquity";
import { visibleTimeout } from "./visibleTimeout";
import type { CSSProperties, KeyboardEvent } from "react";
import type { MatchView, PresentationView, RevealedHand, ShowdownPrepSeatView, ShowdownPrepView } from "../shared/protocol";
import { cinematicTimeline, displayedStreetIndex, frameAt, isFinalMatch, revealFlags, type CinematicFrame } from "./cinematicTimeline";
import { INTER_MATCH_HOLD_MS, MATCH_PREP_MS, PRESENTATION_VERSION, RUN_BOARD_MOVE_MS } from "../shared/presentationTimeline";
import { FINAL_REVEAL_STAGGER_MS, arenaZoomProgress, finalNextBatch, finalReadStage, finalRevealSlot, ordinalPlace, visibleFinalHand } from "./finalShowdownPresentation";
import { detailedHandLabel } from "./handLabel";
import { madeTone } from "./madeTone";
import { isMadeSoundStart, playMadeSound, prefetchMadeSound, selectMadeSound, stopMadeAudio } from "./madeSound";
import { cinemaSeatClass } from "./madeFxClasses";
import { showdownStage } from "./showdownStage";
import type { ServerClock } from "./serverClock";
import { ShowdownCardFlip } from "./ShowdownCardFlip";
import { runBoardOrder, useRunBoardMotion } from "./useRunBoardMotion";
import { FinalArenaBackdrop } from "./FinalArenaBackdrop";
import { CardView } from "./CardView";
import { FinalPlaceBanner } from "./FinalPlaceBanner";
import { FinalArenaFx } from "./FinalArenaFx";
import type { Card } from "../core/poker/cards";
import type { MatchReward } from "../game/types";
import { useCinematicMotion } from "./useCinematicMotion";
import { showdownSeatOrder } from "./showdownSeatOrder";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { RoundProgress } from "./PrepPhase";
import { ArenaBrand } from "./ArenaBrand";
import "./cinematic.css";
import { HighCardDrawNotice, HighCardDrawResult } from "./HighCardDraw";
import { useTranslation } from "../i18n";

type Profile = { playerId: string; name: string; points?: number; alive?: boolean; abilityId?: ShowdownPrepSeatView["abilityId"] };
/**
 * `controls` exposes skip for local simulation only. `elapsedMs` hands playback to an outside
 * clock (the server-synced gate): no local timer or per-match confirm.
 */
type Props = { match: MatchView; profiles: Profile[]; viewerId: string; identityId?: string; onComplete: () => void; controls?: boolean; elapsedMs?: number; catchUp?: boolean; nextMatchSeconds?: number; hasNextMatch?: boolean; soundSessionId?: string };
/** A jump larger than this (hidden tab, reconnect) lands on the current frame without replaying transitions. */
const CATCH_UP_MS = 400;

/** A table's array index is not the player's match number in R2/R4. */
function displayedMatchNumber(match: MatchView): number {
  if (match.round === 2 && match.matchday) return match.matchday;
  // R5 plays one RUN IT THREE TIMES match per seat, listed after the other table.
  if (match.runCards && match.runoutCount === 3) return 1;
  if (match.round === 2 || match.round === 4) return match.stage === "secondary" ? 2 : 1;
  return match.matchday ?? match.matchNumber;
}


/** A finished R5 RUN on hover or tap: each seat's hand for that RUN, the five cards it played and the result. */
function RunDetail({ match, index, ids, name }: { match: MatchView; index: number; ids: readonly string[]; name: (id: string) => string }) {
  const { t } = useTranslation();
  const board = match.boards[index] ?? [];
  const winners = match.boardWinnerIds[index] ?? [];
  const results = match.boardResults[index] ?? [];
  // The board is drawn once, under both hands; the cards the winning hand(s) used stay lit.
  const winningCards = new Set(results.filter((entry) => winners.includes(entry.playerId)).flatMap((entry) => entry.usedCardIds));
  const sides = ids.map((id) => {
    const result = results.find((entry) => entry.playerId === id);
    const hole = match.runCards?.[id]?.[index] ?? [];
    const label = !result ? undefined : result.displayName === "몰수패" ? { title: t("hand.forfeit") }
      : detailedHandLabel(result.category, result.kickers, hole, result.usedCardIds, t, board);
    const outcome = winners.length > 1 ? "split" : winners.includes(id) ? "win" : "loss";
    return { id, result, hole, label, outcome };
  });
  // Fits the RUN box: hands over the board in the middle, each name out at its side on the line between them.
  return <div className="cinema-run-detail">
    {sides.map((side, order) => <div className={`cinema-run-detail-side is-${side.outcome} ${order ? "is-right" : ""}`} key={side.id}>
      <b title={name(side.id)}>{name(side.id)}</b>
      <span>{t(side.outcome === "win" ? "cinema.matchWin" : side.outcome === "loss" ? "cinema.matchLoss" : "cinema.matchSplit")}</span>
      {side.label && <small>{side.label.title}</small>}
    </div>)}
    <div className="cinema-run-detail-hands">{sides.map((side) => <div className={`cinema-run-detail-hole is-${side.outcome}`} key={side.id}>
      {side.hole.map((card) => <CardView card={card} compact glow={!!side.result?.usedCardIds.includes(card.id)} dimmed={!!side.result && !side.result.usedCardIds.includes(card.id)} key={card.id} />)}
    </div>)}</div>
    <div className="cinema-run-detail-board">{board.map((card) => <CardView card={card} compact glow={winningCards.has(card.id)} dimmed={winningCards.size > 0 && !winningCards.has(card.id)} key={card.id} />)}</div>
  </div>;
}

function runRewardText(reward: MatchReward | undefined): string {
  if (!reward) return "";
  const amount = (value: number, unit: string) => `${value >= 0 ? "+" : "-"} ${Number(Math.abs(value).toFixed(2))}${unit}`;
  return [reward.deltaBB ? amount(reward.deltaBB, "BB") : "", reward.deltaPoints ? amount(reward.deltaPoints, "P") : ""].filter(Boolean).join(" · ") || "—";
}

/** R5 seat on a landscape PC: the RUNs before the live one, newest first. Every row is kept from RUN 1 so the seat never grows. */
function RunHistory({ match, playerId, played }: { match: MatchView; playerId: string; played: number }) {
  const { t } = useTranslation();
  const rows = Array.from({ length: match.runoutCount - 1 }, (_, index) => match.runoutCount - 2 - index);
  return <div className="cinema-run-history"><small>{t("cinema.previousRuns")}</small><ol>{rows.map((index) => {
    const winners = match.boardWinnerIds[index] ?? [];
    const outcome = index === played ? "live" : index > played || !winners.length ? "waiting" : winners.length > 1 ? "split" : winners.includes(playerId) ? "win" : "loss";
    const label = ({ live: "cinema.runLive", waiting: "cinema.runWaiting", split: "cinema.matchSplit", win: "cinema.matchWin", loss: "cinema.matchLoss" } as const)[outcome];
    return <li className={`is-${outcome}`} key={index}><span>RUN {index + 1}</span><b>{t(label)}</b>
      <strong>{outcome === "waiting" || outcome === "live" ? "" : runRewardText(match.runRewards?.[index]?.find((entry) => entry.playerId === playerId))}</strong></li>;
  })}</ol></div>;
}

/** RUN score: R2 shows it once both RUNs end; R5 updates it after every RUN. */
function RunTimeline({ match, frame, viewerId, name }: { match: MatchView; frame: CinematicFrame; viewerId: string; name: (id: string) => string }) {
  const { t } = useTranslation();
  if (!match.runCards || match.runoutCount < 2 || match.round !== 2 && match.runoutCount !== 3) return null;
  const currentComplete = ["RUN_RESULT", "HIGH_CARD_NOTICE", "HIGH_CARD_DRAW", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase);
  const runComplete = (index: number) => frame.boardIndex > index || frame.boardIndex === index && currentComplete;
  const completed = Array.from({ length: match.runoutCount }, (_, index) => index).filter(runComplete).length;
  // R5 keeps a 0 : 0 board from RUN 1 and R2 its board until both RUNs end; only the landscape PC
  // layout shows a pending board.
  const pending = match.round === 2 ? !runComplete(1) : completed === 0;
  const ids = showdownSeatOrder(match.participantIds, viewerId);
  const scores = ids.map((id) => match.boardWinnerIds.slice(0, completed).filter((winners) => winners.length === 1 && winners[0] === id).length);
  return <aside className={`cinema-run-scoreboard ${pending ? "is-pending" : ""}`} aria-label={t("cinema.runScoreAria")}>
    <div className="cinema-run-score"><span>{name(ids[0]!)}</span><strong>{scores[0]} : {scores[1]}</strong><span>{name(ids[1]!)}</span></div>
  </aside>;
}

export function ShowdownCinematic({ match, profiles, viewerId, onComplete, controls = false, elapsedMs, catchUp = false, nextMatchSeconds, hasNextMatch = false, soundSessionId = "game" }: Props) {
  const { t, locale } = useTranslation();
  const motion = useCinematicMotion();
  const boardStack = useRef<HTMLDivElement>(null);
  const synced = elapsedMs !== undefined;
  const [localElapsed, setElapsed] = useState(0);
  const [runDetail, setRunDetail] = useState<number | null>(null);
  const [equityReady, setEquityReady] = useState<Record<string, number>>({});
  const frames = match.disclosure?.frames ?? cinematicTimeline(match);
  const authorized = match.disclosure && frameAt(frames, match.disclosure.elapsedMs);
  const nextAuthorizedAt = authorized ? frames[frames.indexOf(authorized) + 1]?.at ?? Infinity : Infinity;
  const elapsed = Math.min(synced ? elapsedMs : localElapsed, nextAuthorizedAt - 0.001);
  const frame = frameAt(frames, elapsed);
  const abilityCues = activeAbilityCues(match, elapsed);
  const previousSoundFrame = useRef<{ scene: string; phase: string } | null>(null);
  const flags = revealFlags(frame.phase);
  const final = isFinalMatch(match);
  const finalBoard = final && match.boards.length > 0;
  const tripleRun = !!match.runCards && match.runoutCount === 3;
  // R2 and R5: the landscape PC layout adds the live RUN status, RUN history, board tags and empty RUN slots.
  const multiRun = !!match.runCards && match.runoutCount >= 2 && !isFinalMatch(match);
  const stage = showdownStage(match.round, final);
  // Six-round R5 RUNs (and their tiebreak) swap both hole cards between boards; R2 swaps only the secondary.
  const swapsWholeHand = match.round === 5 && !final;
  const intro = frame.phase === "VS_INTRO";
  const arenaEnter = frame.phase === "ARENA_ENTER";
  const multi = match.participantIds.length > 2;
  const finalWinnerStage = final && flags.winner;

  // BEST5_GLOW is the first visible made-hand effect (after the final board/reveal settle).
  // Key it by game, match, and board so R2 RUNs are independent while rerenders/reconnect mounts
  // never replay a sound for a phase that was already underway.
  useEffect(() => {
    const scene = `${soundSessionId}:${match.id}:${frame.boardIndex}`;
    const previous = previousSoundFrame.current;
    previousSoundFrame.current = { scene, phase: frame.phase };
    if (!isMadeSoundStart(previous, { scene, phase: frame.phase }, catchUp)) return;
    const sceneResults = final ? match.results : match.boardResults[frame.boardIndex] ?? [];
    const sound = selectMadeSound(sceneResults);
    if (sound) void playMadeSound(sound);
  }, [catchUp, final, frame.boardIndex, frame.phase, match.boardResults, match.id, match.results, soundSessionId]);

  // The match result is known when its cinematic mounts, seconds before BEST5_GLOW: fetch only the cues it will play.
  useEffect(() => {
    const scenes = final ? [match.results] : match.boardResults;
    for (const results of scenes) { const sound = selectMadeSound(results); if (sound) prefetchMadeSound(sound); }
  }, [final, match.boardResults, match.id, match.results]);

  useEffect(() => () => stopMadeAudio(), []);

  useEffect(() => {
    if (synced || frame.phase === "COMPLETE") return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      // Active viewing time: background-tab throttling cannot skip the whole reveal.
      const delta = document.hidden ? 0 : Math.min(now - last, 100);
      last = now; setElapsed((current) => current + delta);
    }, 30);
    return () => clearInterval(timer);
  }, [synced, frame.phase]);

  const results = final ? match.results : match.boardResults[frame.boardIndex] ?? [];
  const streetIndex = displayedStreetIndex(frame.phase);
  const streetSnapshot = match.streetSnapshots?.[frame.boardIndex]?.[streetIndex];
  const winners = final ? finalWinnerStage ? match.winnerIds : [] : flags.result ? match.winnerIds : match.boardWinnerIds[frame.boardIndex] ?? [];
  const focus = results.find((r) => winners.includes(r.playerId)) ?? results[0];
  const ids = showdownSeatOrder(match.participantIds, viewerId);
  const name = (id: string) => profiles.find((p) => p.playerId === id)?.name ?? id;
  const title = match.round === 3 && match.matchday ? "OMAHA SWISS" : match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : final ? "FINAL SHOWDOWN"
    : match.runCards && match.runoutCount === 3 ? "RUN IT THREE TIMES" : multi ? match.group === "winner" ? "WINNER SHOWDOWN" : "SURVIVAL SHOWDOWN" : "SHOWDOWN";
  // Mount the next run/decider during the current result beat, while every card is still closed.
  // This keeps RUN 1 on stage and lets RUN 2 reveal by flipping already-present slots.
  const queuedBoard = frame.phase === "RUN_RESULT" && frame.boardIndex + 1 < match.boards.length ? 1 : 0;
  const visibleBoardIndexes = match.round === 2 && match.runoutCount === 2
    ? Array.from({ length: Math.max(2, frame.boardIndex + 1 + queuedBoard) }, (_, index) => index)
    : match.boards.length > 1
    ? Array.from({ length: frame.boardIndex + 1 + queuedBoard }, (_, index) => index)
    : [frame.boardIndex];
  const runMoving = frame.phase === "RUN_TRANSITION";
  // Late network frames can shorten/skip this motion; never let it overlap a released next RUN.
  const moveMs = runMoving ? Math.min(RUN_BOARD_MOVE_MS, Math.max(0, frame.at + RUN_BOARD_MOVE_MS - elapsed)) : RUN_BOARD_MOVE_MS;
  useRunBoardMotion(boardStack, match.id, `${intro}:${frame.boardIndex}:${flags.glow}:${flags.runResult}:${flags.result}:${visibleBoardIndexes.length}`,
    multiRun && motion.enabled && !catchUp && (runMoving || flags.result), moveMs);

  const cardSwitch = frame.phase === "CARD_SWITCH_OUT";
  // The outgoing RUN's hand stays on screen while it flips away.
  const runIndex = cardSwitch || runMoving ? Math.max(0, frame.boardIndex - 1) : frame.boardIndex;
  const equityKey = `${match.id}:${runIndex}`;
  const equityCount = Math.min(equityBoardCount(frames, runIndex, elapsed), equityReady[equityKey] ?? 0);
  // Compute only the released prefix during the flip; publish after both clock and DOM reveal gates.
  const calculationCount = releasedEquityBoardCount(frames, runIndex, elapsed);
  const equity = useDisplayEquity(streetEquityJob(match, runIndex, calculationCount), streetEquityJob(match, runIndex, equityCount))?.[0];
  const cardsForRun = (id: string) => match.runCards?.[id]?.[runIndex] ?? match.revealedCards[id] ?? [];
  const labelFor = (id: string, result: RevealedHand, communityCards: readonly Card[] = []) => result.displayName === "몰수패" ? { title: t("hand.forfeit"), kicker: t("hand.forfeitDetails") }
    : detailedHandLabel(result.category, result.kickers, cardsForRun(id), result.usedCardIds, t, communityCards);
  const rankPoints = match.standingsAfterRuns?.[frame.boardIndex - (flags.result || flags.runResult || flags.reward ? 0 : 1)] ?? match.standingsBefore
    ?? Object.fromEntries(profiles.map((p) => [p.playerId, p.points ?? 0]));
  const finalHeadingTitle = t("cinema.finalShowdown");
  const placeText = (place: number | undefined) => place === undefined ? "—" : locale === "ko-KR" ? t("cinema.finalPlace", { place }) : ordinalPlace(place);
  const nextBatch = final ? finalNextBatch(frame.phase) : undefined;
  const phaseMs = frame === frames.at(-1) && match.disclosure?.frameDurationMs !== undefined
    ? match.disclosure.frameDurationMs : (frames[frames.indexOf(frame) + 1]?.at ?? frame.at) - frame.at;
  const readStage = finalReadStage(frame.phase);
  return <section className={`cinema ${motion.enabled ? "cinema-motion-enabled" : ""} ${intro ? "cinema-intro" : "cinema-table"} ${multi ? "cinema-multi" : "cinema-headsup"} ${match.round === 4 && ids.length === 3 ? "cinema-r4-threeway" : ""} ${match.round === 3 && ids.length === 3 ? "cinema-r3-threeway" : ""} ${match.round === 3 || match.round === 4 ? "cinema-card-size-original" : ""} ${final ? "cinema-final" : ""} ${final && ids.length === 3 ? "cinema-final-threeway" : ""} ${finalBoard ? "cinema-board-final" : ""} ${tripleRun ? "cinema-run-three" : ""} ${multiRun ? "cinema-multi-run" : ""} ${stage ? `cinema-staged stage-r${stage.level}` : ""} ${arenaEnter ? "cinema-arena-enter" : ""} ${catchUp ? "cinema-catchup" : ""}`}
    aria-label={title} data-round={match.round} data-phase={frame.phase} data-match-id={match.id} data-equity-street={equityCount}
    style={{ "--flip-duration": "420ms", "--river-duration": "600ms", "--suspense-duration": "250ms", "--final-beat": 1, "--phase-duration": `${phaseMs}ms` } as CSSProperties}>
    <GameViewportReset screenKey={`cinema:${match.id}`} />
    <header className={`cinema-heading ${final ? "cinema-final-heading" : ""}`}><div className={final ? "cinema-heading-copy" : undefined}>{!final && <span className="eyebrow">ROUND {match.round} · MATCH {match.matchday ? `${match.matchday}/${match.round === 2 ? 2 : 3}` : displayedMatchNumber(match)}</span>}<h2>{final ? finalHeadingTitle : title}</h2></div>
      {controls && !synced && <div className="cinema-controls"><button className="secondary" onClick={onComplete}>{t("cinema.skip")}</button></div>}</header>
    {!intro && <RunTimeline match={match} frame={frame} viewerId={viewerId} name={name} />}
    {match.highCardDraw && frame.phase === "HIGH_CARD_NOTICE" && <HighCardDrawNotice survival={match.group === "loser"} surviveCount={match.highCardDraw.surviveCount} seconds={Math.max(1, Math.ceil((frame.at + phaseMs - elapsed) / 1000))} />}
    {match.highCardDraw && ["HIGH_CARD_DRAW", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase) && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    {stage && <div className="cinema-stage" aria-hidden="true" style={{ "--stage-focus": stage.focus } as CSSProperties}><img src={stage.image} alt="" /><i /></div>}
    {final && <div className="cinema-final-arena" aria-hidden="true" style={{ "--arena-progress": arenaZoomProgress(elapsed) } as CSSProperties}>
      <FinalArenaBackdrop /><i /></div>}
    {final && motion.enabled && <FinalArenaFx phase={frame.phase} winnerIds={match.winnerIds} catchUp={catchUp} />}
    <div className="cinema-seats">{intro && !multi && <span className="cinema-vs" aria-hidden="true">VS</span>}{ids.map((id, index) => {
      const result = results.find((r) => r.playerId === id);
      const streetResult = streetSnapshot?.results.find((r) => r.playerId === id);
      const streetLabel = streetResult ? labelFor(id, streetResult, (match.boards[frame.boardIndex] ?? []).slice(0, frame.revealed)) : undefined;
      const forfeited = result?.displayName === "몰수패";
      const won = !forfeited && winners.includes(id);
      const cards = cardsForRun(id);
      const label = result ? labelFor(id, result, final && !finalBoard ? [] : match.boards[frame.boardIndex] ?? []) : undefined;
      const swiss = (flags.result ? match.swissAfter : match.swissBefore)?.[id];
      const reward = (match.runRewards?.[frame.boardIndex] ?? match.rewards).find((r) => r.playerId === id);
      const showReward = !(match.round === 4 && match.group === "loser" && reward?.outcome === "ELIMINATED");
      // Do not reveal the round's final elimination before Swiss Match 3.
      // Retain Game 2 gating only for already-resolved legacy snapshots.
      const eliminationResultReady = match.round !== 3 || (match.matchday ? match.matchday === 3 : match.gameNumber !== 1);
      const survivalOutcome = flags.result && eliminationResultReady && (reward?.outcome === "ELIMINATED" || match.group === "loser" && reward?.outcome === "SURVIVED") ? reward.outcome : undefined;
      const tone = flags.glow && result ? madeTone(result.displayName) : "default";
      const currentPlaceVisible = final && frame.phase === "FINAL_PLACE" && frame.finalPlace !== undefined && !!result && result.place >= frame.finalPlace;
      const placementClass = final ? finalWinnerStage ? won ? "cinema-winner" : "cinema-loser" : currentPlaceVisible ? "cinema-final-resolved" : "" : flags.profile ? won ? "cinema-winner" : "cinema-loser" : "";
      const made = !!(flags.glow && result);
      const leading = final && !finalWinnerStage ? undefined : won;
      const readCards = readStage.kind === "current" ? readStage.cards : 0;
      const interimHand = final && readCards && cards.length >= readCards ? visibleFinalHand(cards, readCards) : undefined;
      const interimLabel = interimHand ? detailedHandLabel(interimHand.category, interimHand.kickers, cards.slice(0, readCards), interimHand.bestFive.map((card) => card.id), t) : undefined;
      const currentPoints = rankPoints[id];
      const currentRank = currentPoints === undefined ? undefined : 1 + Object.values(rankPoints).filter((points) => points > currentPoints).length;
      const tiedOnPoints = currentPoints === undefined ? false : Object.values(rankPoints).filter((points) => points === currentPoints).length > 1;
      // A board final colours each street's hand name by its own rank from the flop on, like the other rounds.
      const read = !final ? undefined : finalBoard ? { stage: flags.made ? "final" : "current", tag: undefined, title: (flags.made ? label : streetLabel)?.title ?? "—", detail: (flags.made ? label : streetLabel)?.kicker,
        tone: (flags.made ? result : streetResult)?.displayName } : readStage.kind === "final" && label
        ? { stage: "final", tag: undefined, title: label.title, detail: label.kicker }
        : interimLabel
          ? { stage: `current-${readCards}`, tag: t(readCards === 3 ? "cinema.currentReadThree" : "cinema.currentBestFive"), title: interimLabel.title, detail: interimLabel.kicker }
          : { stage: "pending", tag: t("cinema.handRead"), title: "—", detail: undefined };
      const ability = profiles.find(profile => profile.playerId === id)?.abilityId;
      const activation = abilityCues.find(item => item.cue.playerId === id);
      const showFinalPlace = currentPlaceVisible || finalWinnerStage;
      const showMatchOutcome = !final && (flags.result || flags.runResult);
      const showRewardAmount = !!((final ? showFinalPlace : flags.reward || flags.runResult && match.runRewards) && reward && showReward);
      const outcome = t(won ? winners.length > 1 ? "cinema.matchSplit" : "cinema.matchWin" : "cinema.matchLoss");
      const matchOutcome = (flags.runResult || match.runCards)
        ? t("cinema.runOutcome", { run: frame.boardIndex + 1, outcome })
        : outcome;
      const podiumPlace = finalBoard && showFinalPlace && result ? result.place : undefined;
      return <div key={id} className={`${cinemaSeatClass({ tone, placement: placementClass, made, leading })} ${match.boards.length ? "cinema-meter-layout" : ""} ${podiumPlace ? `final-place-${Math.min(podiumPlace, 3)}` : ""}`} data-seat-index={index} data-player-id={id}>
        {(!final || finalBoard) && ability && <AbilityBadge ability={ability} cue={activation?.cue} age={activation?.age} catchUp={catchUp} />}
        {match.boards.length > 0 && !podiumPlace && !survivalOutcome && frame.phase !== "CARD_SWITCH_OUT" && frame.phase !== "CARD_SWITCH_IN" && <EquityMeter key={equityKey} percent={equity?.[match.participantIds.indexOf(id)] ?? null} name={name(id)} viewer={id === viewerId} />}
        {survivalOutcome && <span className={`cinema-status-stamp ${survivalOutcome === "SURVIVED" ? "is-survived" : "is-eliminated"}`}>{t(survivalOutcome === "SURVIVED" ? "match.survived" : "results.eliminated")}</span>}
        <div className={`cinema-profile ${!final ? "cinema-match-profile" : ""}`}>
          {!final && <div className="cinema-profile-identity"><b title={name(id)}>{name(id)}</b></div>}
          {/* R3 Swiss record sits under the name, clear of the ability icon on the name row. */}
          {swiss && <p className="swiss-record">{swiss.wins}W {swiss.draws}D {swiss.losses}L</p>}
          {final && <>{!finalBoard && ability && <AbilityBadge ability={ability} cue={activation?.cue} age={activation?.age} catchUp={catchUp} />}<b>{name(id)}</b></>}
          {!final && match.round >= 2 && currentRank !== undefined && !showFinalPlace && <div className="cinema-standing-line"><span className="cinema-rank-badge" data-rank={currentRank} aria-label={t("cinema.currentRankAria", { tied: tiedOnPoints ? t("cinema.tied") : "", rank: currentRank })}><small>{t("cinema.current")}</small>{tiedOnPoints && <i>{t("cinema.tied")}</i>}<b>{t("cinema.place", { rank: currentRank })}</b></span></div>}
          {final && !finalBoard && showFinalPlace && <span className={`cinema-victory place-${result?.place ?? 0}`}>{result?.place === 1 && match.winnerIds.length > 1 ? t("cinema.finalSplitPlace") : placeText(result?.place)}</span>}
        </div>
        <div className="cinema-hole-cards" data-count={cards.length} style={finalBoard ? { "--hole-count": cards.length } as CSSProperties : undefined}>{cards.map((card, cardIndex) => {
          const visible = (!final && intro) || (!intro && (!final || cardIndex < frame.finalCards));
          const used = result?.usedCardIds.includes(card.id) ?? false;
          if (final && !finalBoard) {
            const slot = finalRevealSlot(cardIndex);
            const slotStyle = { "--flip-delay": `${slot.offset * FINAL_REVEAL_STAGGER_MS[slot.batch]}ms` } as CSSProperties;
            return <ShowdownCardFlip card={card} open={visible} glow={flags.glow && used} dimmed={flags.holeDim && !used}
            className={`batch-${slot.batch} ${!visible && slot.batch === nextBatch ? "is-next" : ""}`} style={slotStyle} key={cardIndex} />;
          }
          return <ShowdownCardFlip card={card} open={visible && !(cardSwitch && (swapsWholeHand || cardIndex === 1))} glow={flags.glow && used} dimmed={flags.holeDim && !used}
            className={intro ? "cinema-vs-reveal" : ""} style={intro ? { "--flip-delay": `${cardIndex * 200}ms` } as CSSProperties : undefined} key={cardIndex} />;
        })}</div>
        {/* R6: the cards this finalist owns but does not play, public from the prep screen. */}
        {/* Every R6 seat keeps the BURN row, empty or not, so the three seats line up. */}
        {final && (finalBoard ? !!match.blockCards : !!match.blockCards?.[id]?.length) && <div className={`cinema-burn-cards ${match.blockCards?.[id]?.length ? "" : "is-empty"}`}><small>BURN</small>
          <div>{match.blockCards?.[id]?.length ? match.blockCards[id]!.map((card) => <CardView card={card} compact key={card.id} />) : <span>{t("cinema.noBurn")}</span>}</div></div>}
        {read && <div className={`cinema-final-read is-${read.stage === "final" || read.stage === "pending" ? read.stage : "current"}`}>
          <div className="cinema-final-read-copy">{read.tag && <small>{read.tag}</small>}<strong className={"tone" in read && read.tone ? `made-${madeTone(read.tone)}` : readStage.kind === "current" && interimHand ? `made-${madeTone(interimHand.displayName)}` : undefined}>{read.title}</strong>{read.detail && <em>({read.detail})</em>}</div></div>}
        {!intro && !final && (flags.made ? label : streetLabel) && <div className={flags.made ? "cinema-made" : "cinema-street-made"}><strong className={!flags.made && streetResult ? `made-${madeTone(streetResult.displayName)}` : undefined}>{(flags.made ? label : streetLabel)!.title}</strong>{(flags.made ? label : streetLabel)!.kicker && <small>({(flags.made ? label : streetLabel)!.kicker})</small>}</div>}
        {/* R1's lower read area must exist before its text arrives, or the bottom-aligned cards drop. */}
        {!intro && !final && match.round === 1 && !(flags.made ? label : streetLabel) && <div className={`${flags.made ? "cinema-made" : "cinema-street-made"} cinema-hand-read-placeholder`} aria-hidden="true" />}
        {!final && (showMatchOutcome || showRewardAmount) && <div className="cinema-result-footer">
          <div className="cinema-profile-outcome">{showMatchOutcome && <span className="cinema-victory" key="outcome">{matchOutcome}{multi && result ? ` · ${t("cinema.place", { rank: result.place })}` : ""}</span>}</div>
          {showRewardAmount && reward && (final || reward.deltaBB !== 0 ? <div className="cinema-reward"><strong>{reward.deltaBB >= 0 ? "+ " : "- "}{Number(Math.abs(reward.deltaBB).toFixed(2))}BB{reward.deltaPoints > 0 && <i>· + {Number(reward.deltaPoints.toFixed(2))}P {t("cinema.earned")}</i>}</strong></div>
            // Most matches no longer pay BB, so a zero is left out rather than shown as "+ 0BB".
            : reward.deltaPoints > 0 && <div className="cinema-reward"><strong>+ {Number(reward.deltaPoints.toFixed(2))}P {t("cinema.earned")}</strong></div>)}
        </div>}
        {/* R5 landscape PC: the live RUN's status holds the result footer's place until the RUN is decided. */}
        {multiRun && !intro && !showMatchOutcome && !showRewardAmount && <div className="cinema-run-live">
          {!runMoving && <><span>{t("cinema.runInProgress", { run: frame.boardIndex + 1 })}<i className="cinema-run-spinner" aria-hidden="true" /></span>
          <small>{t("cinema.runDeciding")}</small></>}</div>}
        {multiRun && !intro && <RunHistory match={match} playerId={id} played={frame.boardIndex + (showMatchOutcome ? 1 : 0)} />}
        {final && showRewardAmount && reward && match.pointAwards?.[id] !== undefined && <div className="cinema-reward"><strong>{results.filter(r => r.place === result?.place).length > 1 ? `${t("cinema.tied").trim()} ` : ""}{placeText(result?.place)} +{Number(match.pointAwards[id].toFixed(2))}P</strong>{Math.abs(reward.deltaPoints - match.pointAwards[id]) > 0.005 && <small className="final-extra-points">BONUS {reward.deltaPoints - match.pointAwards[id] > 0 ? "+" : ""}{Number((reward.deltaPoints - match.pointAwards[id]).toFixed(2))}P</small>}</div>}
      </div>;
    })}
      {/* R6 podium: a ribbon on each seat's top edge replaces the place stamp. It is a sibling of the seat, not a
          child, so the seat keeps clipping its made-hand FX to its own box. */}
      {finalBoard && ids.map((id, index) => {
        const result = results.find((r) => r.playerId === id);
        const place = result && (finalWinnerStage || frame.phase === "FINAL_PLACE" && frame.finalPlace !== undefined && result.place >= frame.finalPlace) ? result.place : undefined;
        // First place gets a crowned crest under the arena spotlight instead of a ribbon.
        if (place === 1) return <div key={`podium-${id}`} className="cinema-champion-crest" role="img" aria-label={match.winnerIds.length > 1 ? `SPLIT ${placeText(1)}` : placeText(1)} style={{ gridColumn: index + 1 }}>
          <svg viewBox="0 0 48 30" aria-hidden="true"><path d="M4 26 L2 8 L14 16 L24 2 L34 16 L46 8 L44 26 Z" /><circle cx="2" cy="8" r="2.4" /><circle cx="24" cy="2" r="2.4" /><circle cx="46" cy="8" r="2.4" /></svg>
          <b>{match.winnerIds.length > 1 ? "CO-CHAMPION" : "CHAMPION"}</b></div>;
        return place ? <FinalPlaceBanner key={`podium-${id}`} column={index + 1} place={place} label={placeText(place)} /> : null;
      })}</div>
    {!intro && (!final || finalBoard) && <div ref={boardStack} className={`cinema-board-stack ${multiRun && flags.result ? "is-run-complete" : ""} ${finalBoard ? "final-community-board" : ""} ${match.runoutCount === 2 ? "run-it-twice" : ""} ${tripleRun ? "run-it-three-times" : ""}`}>{visibleBoardIndexes.map((boardIndex) => {
      const current = boardIndex === frame.boardIndex;
      const pending = boardIndex > frame.boardIndex;
      const shownBoard = match.boards[boardIndex] ?? [];
      const boardResults = match.boardResults[boardIndex] ?? [];
      const boardWinners = match.boardWinnerIds[boardIndex] ?? [];
      const boardFocus = current ? focus : boardResults.find((result) => boardWinners.includes(result.playerId)) ?? boardResults[0];
      const completed = !pending && (!current || flags.glow);
      const boardTitle = boardIndex < match.runoutCount ? match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : t("cinema.communityBoard")
        : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      // R2 and R5: the seats above hold the live RUN's hands, so a finished RUN box only shows the viewer's
      // outcome as its tint; hovering or tapping it opens that RUN's cards and result. A spectator has no
      // side, so a decided RUN gets a neutral tint rather than the first seat's win or loss.
      const runOutcome = multiRun && boardIndex < match.runoutCount && completed
        ? boardWinners.length > 1 ? "split" : !ids.includes(viewerId) ? "decided" : boardWinners.includes(viewerId) ? "win" : "loss" : undefined;
      const toggleDetail = () => setRunDetail((open) => open === boardIndex ? null : boardIndex);
      // R2 and R5: once the match result is out, the last RUN settles to the finished RUN size too.
      const settled = !current || multiRun && flags.result;
      return <div className={`cinema-board ${pending ? "pending" : settled ? "complete" : "active"} ${match.runoutCount === 2 || tripleRun ? "cinema-run-board" : ""} made-${completed && boardFocus ? madeTone(boardFocus.displayName) : "default"} ${runOutcome ? `is-run-${runOutcome} has-run-detail ${runDetail === boardIndex ? "is-detail-open" : ""}` : ""}`} key={boardIndex}
        data-run-index={multiRun ? boardIndex : undefined}
        style={multiRun ? { "--run-order": runBoardOrder(boardIndex, frame.boardIndex, settled, match.runoutCount) } as CSSProperties : undefined}
        {...runOutcome ? { role: "button", tabIndex: 0, "aria-expanded": runDetail === boardIndex, "aria-label": t("cinema.runDetailAria", { run: boardIndex + 1 }),
          // Hover opens it on a mouse (CSS); a click or tap toggles it, and tapping elsewhere blurs it closed.
          onClick: toggleDetail,
          onBlur: () => setRunDetail((open) => open === boardIndex ? null : open),
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleDetail(); } } } : {}}>
        {runOutcome && <RunDetail match={match} index={boardIndex} ids={ids} name={name} />}
        <div className="cinema-board-label"><h3>{boardTitle}</h3>
        {multiRun && current && !settled && !runMoving && <span className="cinema-board-progress" aria-hidden="true">IN PROGRESS<i className="cinema-run-spinner" /></span>}</div>
        <div className="cinema-board-cards"><div className="cinema-board-street" aria-live="polite">{current && (frame.phase.startsWith("FLOP") ? "FLOP" : frame.phase.startsWith("TURN") ? "TURN" : frame.phase.startsWith("RIVER") ? "RIVER" : "")}</div>{shownBoard.map((card, index) => {
          const visible = !pending && (!current || index < frame.revealed);
          const used = boardFocus?.usedCardIds.includes(card.id) ?? false;
          return <ShowdownCardFlip card={card} open={visible} glow={completed && used} dimmed={completed && !used}
            onEquityReady={index >= 2 && current ? () => setEquityReady(previous => {
              const key = `${match.id}:${boardIndex}`;
              return (previous[key] ?? 0) >= index + 1 ? previous : { ...previous, [key]: index + 1 };
            }) : undefined}
            className={`${current && index === 4 ? "cinema-river" : ""} ${current && frame.phase === "RIVER_SUSPENSE" && index === 4 ? "cinema-suspense" : ""}`}
            key={`${boardIndex}-${index}`} />;
        })}</div>
        {multiRun && settled && runOutcome && <small className="cinema-board-caption">{runOutcome === "win" ? "WIN" : runOutcome === "loss" ? "LOSS" : runOutcome === "split" ? "DRAW" : "RESULT"}</small>}
      </div>;
    })}
      {/* Undealt RUNs keep their slots between the active RUN and finished history. */}
      {multiRun && Array.from({ length: match.runoutCount }, (_, index) => index).filter((index) => !visibleBoardIndexes.includes(index)).map((index) =>
        <div className="cinema-board pending cinema-run-board is-placeholder" data-run-index={index} aria-hidden="true" style={{ "--run-order": index + 1 } as CSSProperties} key={`slot-${index}`}>
          <div className="cinema-board-label"><h3>RUN {index + 1}</h3></div>
          <div className="cinema-board-cards">{Array.from({ length: 5 }, (_, card) => <span className="cinema-card-slot" key={card} />)}</div>
        </div>)}
    </div>}
    {frame.phase === "COMPLETE" && (!synced || nextMatchSeconds !== undefined) && <footer className="cinema-footer" aria-live="polite">
      {!synced && <button className="primary" onClick={onComplete}>{t(hasNextMatch ? "cinema.advanceMatch" : "cinema.viewResults")}</button>}
      {synced && nextMatchSeconds !== undefined && <span className="cinema-next-match"><small>{t("cinema.nextMatchLabel")}</small><strong>{nextMatchSeconds}</strong><span>{t("cinema.nextMatch")}</span></span>}
    </footer>}
  </section>;
}

/** Shown once this seat's matches are done while another table is still playing. */
export function WaitingForTables({ preparing = false }: { preparing?: boolean } = {}) {
  const { t } = useTranslation();
  return <section className="cinema cinema-waiting" aria-live="polite" data-phase="WAITING">
    <GameViewportReset screenKey="waiting-tables" />
    <span className="cinema-waiting-pulse" aria-hidden="true"><i /><i /><i /></span>
    <p>{t(preparing ? "cinema.preparing" : "cinema.waitingOthers")}</p>
  </section>;
}

function matchPrepView(match: MatchView, profiles: Profile[], viewerId: string): ShowdownPrepView | undefined {
  if (match.participantIds.length < 2) return undefined;
  const ids = match.participantIds.length === 2 ? showdownSeatOrder(match.participantIds, viewerId)
    : match.participantIds.includes(viewerId) ? [viewerId, ...match.participantIds.filter((id) => id !== viewerId)] : match.participantIds;
  const seat = (id: string) => {
    const profile = profiles.find((candidate) => candidate.playerId === id);
    const runCards = match.runCards?.[id];
    return {
      playerId: id,
      name: profile?.name ?? id,
      points: match.standingsBefore?.[id] ?? profile?.points ?? 0,
      cards: runCards ? [...new Map(runCards.flat().map((card) => [card.id, card])).values()] : match.revealedCards[id] ?? [],
      abilityId: profile?.abilityId,
      runCards: runCards && runCards.length >= 2 ? runCards : undefined,
    };
  };
  const opponents = ids.slice(1).map(seat);
  return { matchNumber: displayedMatchNumber(match),
    viewer: seat(ids[0]!), ...(opponents.length === 1 ? { opponent: opponents[0] } : { opponents }) };
}

/** Later matches' prep screens reuse the game's own nav so every prep screen in a round looks the same. */
function MatchPrepScreen({ match, profiles, viewerId, seconds, nav }: {
  match: MatchView; profiles: Profile[]; viewerId: string; seconds: number; nav?: React.ReactNode;
}) {
  return <main className="game-arena">{nav ?? <nav>
    <div className="brand"><ArenaBrand /></div>
    <RoundProgress round={match.round} prep={null} />
    <div className="nav-status" />
  </nav>}<div className="page-shell" id="top"><GameViewportReset screenKey={`prep:${match.id}`} /><ShowdownPrepPanel round={match.round}
    final={isFinalMatch(match)} playerName={profiles.find((profile) => profile.playerId === viewerId)?.name ?? viewerId}
    seconds={seconds} matchup={matchPrepView(match, profiles, viewerId)} /></div></main>;
}

function MatchPrepInterlude({ match, profiles, viewerId, onComplete, nav }: {
  match: MatchView; profiles: Profile[]; viewerId: string; onComplete: () => void; nav?: React.ReactNode;
}) {
  const [seconds, setSeconds] = useState(MATCH_PREP_MS / 1000);
  const finish = useRef(onComplete);
  useEffect(() => { finish.current = onComplete; }, [onComplete]);
  useEffect(() => {
    return visibleTimeout(() => finish.current(), MATCH_PREP_MS, remaining => setSeconds(Math.ceil(remaining / 1000)));
  }, []);
  return <MatchPrepScreen match={match} profiles={profiles} viewerId={viewerId} seconds={seconds} nav={nav} />;
}

/**
 * Online playback on the server clock: every seat derives the same frame from the shared startsAt,
 * steps through shared match slots (with a three-second inter-match result hold), and releases the
 * results at the shared endsAt. Missed frames (hidden tab, reconnect) are skipped, not replayed.
 */
function SyncedCinematicGate({ matches, presentation, clock, profiles, viewerId, identityId, receivedAt, soundSessionId, nav, children }: {
  matches: MatchView[]; presentation: PresentationView; clock: ServerClock; profiles: Profile[]; viewerId: string; identityId?: string; receivedAt?: number; soundSessionId: string; nav?: React.ReactNode; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(() => ({ now: clock.now(), jumped: false }));
  const { now } = tick;
  const progressive = presentation.disclosureMode === "prefix";
  const done = progressive ? presentation.complete === true : now >= presentation.endsAt && (receivedAt === undefined || receivedAt >= presentation.endsAt);
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setTick((previous) => {
      const next = clock.now();
      return { now: next, jumped: next - previous.now > CATCH_UP_MS };
    }), 40);
    return () => clearInterval(timer);
  }, [done, clock, presentation.startsAt, presentation.endsAt]);
  if (presentation.version !== PRESENTATION_VERSION && receivedAt !== undefined) return <section className="panel" role="alert"><p>{t("cinema.versionMismatch")}</p><button onClick={() => location.reload()}>{t("cinema.reload")}</button></section>;
  if (done) return <>{children}</>;
  if (progressive && presentation.waitingForTables) return <WaitingForTables />;
  const elapsed = now - presentation.startsAt;
  const entry = progressive ? presentation.matches.filter(item => elapsed >= item.offsetMs && matches.some(match => match.id === item.matchId)).at(-1)
    : presentation.matches.find((item) => elapsed >= item.offsetMs && elapsed < item.offsetMs + item.durationMs);
  const match = entry && matches.find((item) => item.id === entry.matchId);
  if (!entry || !match) {
    const nextIndex = presentation.matches.findIndex((item) => elapsed < item.offsetMs);
    const previous = nextIndex > 0 ? presentation.matches[nextIndex - 1] : undefined;
    const previousMatch = previous && matches.find((item) => item.id === previous.matchId);
    if (previous && previousMatch && elapsed >= previous.offsetMs + previous.durationMs) {
      const remainingMs = presentation.matches[nextIndex]!.offsetMs - elapsed;
      return <ShowdownCinematic key={previousMatch.id} match={previousMatch} profiles={profiles} viewerId={viewerId} identityId={identityId} soundSessionId={soundSessionId}
        onComplete={() => {}} elapsedMs={previous.durationMs - (previous.prepMs ?? 0)} catchUp={tick.jumped}
        nextMatchSeconds={remainingMs <= INTER_MATCH_HOLD_MS ? Math.ceil(remainingMs / 1000) : undefined} />;
    }
    return <WaitingForTables preparing={elapsed < 0} />;
  }
  const matchElapsed = elapsed - entry.offsetMs;
  if (!isFinalMatch(match) && entry.prepMs && matchElapsed < entry.prepMs) return <MatchPrepScreen key={`${match.id}:prep`} match={match}
    profiles={profiles} viewerId={viewerId} seconds={Math.ceil((entry.prepMs - matchElapsed) / 1000)} nav={nav} />;
  const next = progressive ? presentation.matches.find(item => item.offsetMs > entry.offsetMs) : undefined;
  return <ShowdownCinematic key={match.id} match={match} profiles={profiles} viewerId={viewerId} identityId={identityId} soundSessionId={soundSessionId} onComplete={() => {}} elapsedMs={matchElapsed - (entry.prepMs ?? 0)} catchUp={tick.jumped}
    nextMatchSeconds={next ? Math.max(0, Math.ceil((next.offsetMs - elapsed) / 1000)) : undefined} />;
}

/** Hides scoreboards, logs, final standings and next-stage controls until presentation completes. */
export function CinematicGate({ matches, profiles, viewerId, identityId, receivedAt, controls = false, presentation, clock, soundSessionId = "game", nav, children }: {
  matches: MatchView[]; profiles: Profile[]; viewerId: string; identityId?: string; receivedAt?: number; controls?: boolean;
  soundSessionId?: string;
  /** The game's nav, shown on the prep screens between matches. */
  nav?: React.ReactNode;
  /** Online: server schedule + clock. Without them (local simulation) playback stays client-paced. */
  presentation?: PresentationView; clock?: ServerClock; children: React.ReactNode;
}) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<string[]>([]);
  if (presentation && clock) return <SyncedCinematicGate matches={matches} presentation={presentation} clock={clock} profiles={profiles} viewerId={viewerId} identityId={identityId} receivedAt={receivedAt} soundSessionId={soundSessionId} nav={nav}>{children}</SyncedCinematicGate>;
  const current = matches.find((match) => !completed.includes(match.id));
  if (!current) return <>{children}</>;
  if (!isFinalMatch(current) && matches[0]?.id !== current.id && !prepared.includes(current.id)) return <MatchPrepInterlude key={`${current.id}:prep`}
    match={current} profiles={profiles} viewerId={viewerId} nav={nav} onComplete={() => setPrepared((ids) => [...ids, current.id])} />;
  return <ShowdownCinematic key={current.id} match={current} profiles={profiles} viewerId={viewerId} soundSessionId={soundSessionId} controls={controls} hasNextMatch={matches.some((match) => match.id !== current.id && !completed.includes(match.id))}
    onComplete={() => setCompleted((ids) => [...ids, current.id])} />;
}
