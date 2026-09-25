import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MatchView, PresentationView, RevealedHand, ShowdownPrepView } from "../shared/protocol";
import { cinematicTimeline, displayedStreetIndex, frameAt, revealFlags, type CinematicFrame } from "./cinematicTimeline";
import { INTER_MATCH_HOLD_MS, MATCH_PREP_MS, PRESENTATION_VERSION } from "../shared/presentationTimeline";
import { FINAL_ARENA_IMAGE, FINAL_REVEAL_STAGGER_MS, arenaZoomProgress, finalHeadingCopy, finalNextBatch, finalReadStage, finalRevealSlot, ordinalPlace, visibleFinalHand } from "./finalShowdownPresentation";
import { detailedHandLabel } from "./handLabel";
import { madeTone } from "./madeTone";
import { isMadeSoundStart, playMadeSound, selectMadeSound, stopMadeAudio } from "./madeSound";
import { cinemaSeatClass } from "./madeFxClasses";
import { showdownStage } from "./showdownStage";
import type { ServerClock } from "./serverClock";
import { ShowdownCardFlip } from "./ShowdownCardFlip";
import { CardView } from "./CardView";
import { useCinematicMotion } from "./useCinematicMotion";
import { showdownSeatOrder } from "./showdownSeatOrder";
import { ShowdownPrepPanel } from "./ShowdownPrepPanel";
import { RoundProgress } from "./PrepPhase";
import "./cinematic.css";
import { HighCardDrawNotice, HighCardDrawResult } from "./HighCardDraw";

type Profile = { playerId: string; name: string; points?: number; alive?: boolean };
/**
 * `controls` exposes speed/skip for local simulation only. `elapsedMs` hands playback to an outside
 * clock (the server-synced gate): no local timer, no speed, no per-match confirm.
 */
type Props = { match: MatchView; profiles: Profile[]; viewerId: string; identityId?: string; onComplete: () => void; controls?: boolean; elapsedMs?: number; catchUp?: boolean; nextMatchSeconds?: number; soundSessionId?: string };
/** A jump larger than this (hidden tab, reconnect) lands on the current frame without replaying transitions. */
const CATCH_UP_MS = 400;

/** A table's array index is not the player's match number in R2/R4. */
function displayedMatchNumber(match: MatchView): number {
  if (match.round === 2 || match.round === 4) return match.stage === "secondary" ? 2 : 1;
  return match.matchday ?? match.matchNumber;
}

function RunMatchup({ match, index, viewerId, complete, winnerGlowOnly = false, className = "" }: {
  match: MatchView; index: number; viewerId: string; complete: boolean; winnerGlowOnly?: boolean; className?: string;
}) {
  const [leftId, rightId] = showdownSeatOrder(match.participantIds, viewerId);
  const winners = match.boardWinnerIds[index] ?? [];
  const dimLeft = complete && !winnerGlowOnly && winners.length === 1 && winners[0] !== leftId;
  const dimRight = complete && !winnerGlowOnly && winners.length === 1 && winners[0] !== rightId;
  const glowLeft = complete && winners.includes(leftId);
  const glowRight = complete && winners.includes(rightId);
  const runHand = (playerId: string) => match.runCards?.[playerId]?.[index] ?? match.revealedCards[playerId] ?? [];
  const usedCards = (playerId: string) => {
    const result = match.boardResults[index]?.find((entry) => entry.playerId === playerId);
    return result ? new Set(result.usedCardIds) : undefined;
  };
  const leftUsed = usedCards(leftId);
  const rightUsed = usedCards(rightId);
  const leftClass = `cinema-run-player${dimLeft ? " is-loser" : ""}${glowLeft ? " is-winner" : ""}`;
  const rightClass = `cinema-run-player is-right${dimRight ? " is-loser" : ""}${glowRight ? " is-winner" : ""}`;
  return <div className={`cinema-run-matchup ${className}`.trim()}>
    <div className={leftClass}><div className="cinema-run-hand">{runHand(leftId).map((card) => <CardView card={card} compact dimmed={dimLeft || complete && !!leftUsed && !leftUsed.has(card.id)} glow={glowLeft && (!leftUsed || leftUsed.has(card.id))} key={card.id} />)}</div></div>
    <strong>VS</strong>
    <div className={rightClass}><div className="cinema-run-hand">{runHand(rightId).map((card) => <CardView card={card} compact dimmed={dimRight || complete && !!rightUsed && !rightUsed.has(card.id)} glow={glowRight && (!rightUsed || rightUsed.has(card.id))} key={card.id} />)}</div></div>
  </div>;
}

function RunTimeline({ match, frame, viewerId, name }: { match: MatchView; frame: CinematicFrame; viewerId: string; name: (id: string) => string }) {
  if (match.runoutCount !== 2) return null;
  const currentComplete = ["RUN_RESULT", "HIGH_CARD_NOTICE", "HIGH_CARD_DRAW", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase);
  const runComplete = (index: number) => frame.boardIndex > index || frame.boardIndex === index && currentComplete;
  const scoreVisible = runComplete(1);
  if (!scoreVisible) return null;
  const ids = showdownSeatOrder(match.participantIds, viewerId);
  const scores = ids.map((id) => match.boardWinnerIds.slice(0, 2).filter((winners) => winners.length === 1 && winners[0] === id).length);
  return <aside className="cinema-run-scoreboard" aria-label="Run It Twice 스코어">
    <div className="cinema-run-score"><span>{name(ids[0]!)}</span><strong>{scores[0]} : {scores[1]}</strong><span>{name(ids[1]!)}</span></div>
  </aside>;
}

export function ShowdownCinematic({ match, profiles, viewerId, identityId = viewerId, onComplete, controls = false, elapsedMs, catchUp = false, nextMatchSeconds, soundSessionId = "game" }: Props) {
  const motion = useCinematicMotion();
  const synced = elapsedMs !== undefined;
  const [localElapsed, setElapsed] = useState(0);
  const [localSpeed, setSpeed] = useState(1);
  const speed = synced ? 1 : localSpeed;
  const frames = match.disclosure?.frames ?? cinematicTimeline(match);
  const authorized = match.disclosure && frameAt(frames, match.disclosure.elapsedMs);
  const nextAuthorizedAt = authorized ? frames[frames.indexOf(authorized) + 1]?.at ?? Infinity : Infinity;
  const elapsed = Math.min(synced ? elapsedMs : localElapsed, nextAuthorizedAt - 0.001);
  const frame = frameAt(frames, elapsed);
  const previousSoundFrame = useRef<{ scene: string; phase: string } | null>(null);
  const flags = revealFlags(frame.phase);
  const final = match.round === 5;
  const stage = showdownStage(match.round);
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

  useEffect(() => () => stopMadeAudio(), []);

  useEffect(() => {
    if (synced || frame.phase === "COMPLETE") return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      // Active viewing time: background-tab throttling cannot skip the whole reveal.
      const delta = document.hidden ? 0 : Math.min(now - last, 100);
      last = now; setElapsed((current) => current + delta * speed);
    }, 30);
    return () => clearInterval(timer);
  }, [synced, speed, frame.phase]);

  const results = final ? match.results : match.boardResults[frame.boardIndex] ?? [];
  const streetIndex = displayedStreetIndex(frame.phase);
  const streetSnapshot = match.streetSnapshots?.[frame.boardIndex]?.[streetIndex];
  const winners = final ? finalWinnerStage ? match.winnerIds : [] : flags.result ? match.winnerIds : match.boardWinnerIds[frame.boardIndex] ?? [];
  const focus = results.find((r) => winners.includes(r.playerId)) ?? results[0];
  const ids = showdownSeatOrder(match.participantIds, viewerId);
  const name = (id: string) => profiles.find((p) => p.playerId === id)?.name ?? id;
  const title = match.round === 3 && match.matchday ? "OMAHA SWISS" : match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : final ? "FINAL SHOWDOWN" : multi ? match.group === "winner" ? "WINNER SHOWDOWN" : "SURVIVAL SHOWDOWN" : "SHOWDOWN";
  const runLabel = frame.boardIndex >= match.runoutCount ? `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${frame.boardIndex - match.runoutCount + 1}`
    : match.runoutCount > 1 ? `RUN ${frame.boardIndex + 1}` : "COMMUNITY BOARD";
  // Mount the next run/decider during the current result beat, while every card is still closed.
  // This keeps RUN 1 on stage and lets RUN 2 reveal by flipping already-present slots.
  const queuedBoard = frame.phase === "RUN_RESULT" && frame.boardIndex + 1 < match.boards.length ? 1 : 0;
  const visibleBoardIndexes = match.boards.length > 1
    ? Array.from({ length: frame.boardIndex + 1 + queuedBoard }, (_, index) => index)
    : [frame.boardIndex];

  const cardSwitch = frame.phase === "CARD_SWITCH_OUT" || frame.phase === "CARD_SWITCH_IN";
  const runIndex = frame.phase === "CARD_SWITCH_OUT" ? 0 : frame.boardIndex;
  const cardsForRun = (id: string) => match.runCards?.[id]?.[runIndex] ?? match.revealedCards[id] ?? [];
  const labelFor = (id: string, result: RevealedHand) => result.displayName === "몰수패" ? { title: "몰수패", kicker: "보유 카드 부족" }
    : detailedHandLabel(result.category, result.kickers, cardsForRun(id), result.usedCardIds);
  const rankPoints = match.standingsAfterRuns?.[frame.boardIndex - (flags.result || flags.runResult || flags.reward ? 0 : 1)] ?? match.standingsBefore
    ?? Object.fromEntries(profiles.map((p) => [p.playerId, p.points ?? 0]));
  const finalHeading = finalHeadingCopy(frame);
  const nextBatch = final ? finalNextBatch(frame.phase) : undefined;
  const phaseMs = (frames[frames.indexOf(frame) + 1]?.at ?? frame.at) - frame.at;
  const readStage = finalReadStage(frame.phase);
  return <section className={`cinema ${motion.enabled ? "cinema-motion-enabled" : ""} ${intro ? "cinema-intro" : "cinema-table"} ${multi ? "cinema-multi" : "cinema-headsup"} ${match.round === 4 && ids.length === 3 ? "cinema-r4-threeway" : ""} ${match.round === 3 || match.round === 4 ? "cinema-card-size-original" : ""} ${final ? "cinema-final" : ""} ${stage ? `cinema-staged stage-r${stage.level}` : ""} ${arenaEnter ? "cinema-arena-enter" : ""} ${catchUp ? "cinema-catchup" : ""}`}
    aria-label={title} data-phase={frame.phase} data-match-id={match.id}
    style={{ "--flip-duration": `${420 / speed}ms`, "--river-duration": `${600 / speed}ms`, "--suspense-duration": `${250 / speed}ms`, "--final-beat": `${1 / speed}`, "--phase-duration": `${phaseMs / speed}ms` } as CSSProperties}>
    <header className={`cinema-heading ${final ? "cinema-final-heading" : ""}`}><div key={final ? finalHeading.title : undefined} className={final ? "cinema-heading-copy" : undefined}>{!final && <span className="eyebrow">ROUND {match.round} · MATCH {match.matchday ? `${match.matchday}/3` : displayedMatchNumber(match)}</span>}<h2>{final ? finalHeading.title : title}</h2></div>
      {controls && !synced && <div className="cinema-controls"><label>속도 <select aria-label="Animation Speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1x</option><option value={2}>2x</option></select></label>
        <button className="secondary" onClick={onComplete}>Skip Cinematic</button></div>}</header>
    {!intro && <RunTimeline match={match} frame={frame} viewerId={viewerId} name={name} />}
    {cardSwitch && <p className="hint" role="status">CARD SWITCH · 대표 카드 유지 · RUN 2 보조 카드 교체</p>}
    {match.highCardDraw && frame.phase === "HIGH_CARD_NOTICE" && <HighCardDrawNotice survival={match.group === "loser"} surviveCount={match.highCardDraw.surviveCount} seconds={Math.max(1, Math.ceil((frame.at + phaseMs - elapsed) / 1000))} />}
    {match.highCardDraw && ["HIGH_CARD_DRAW", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase) && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    {stage && <div className="cinema-stage" aria-hidden="true" style={{ "--stage-focus": stage.focus } as CSSProperties}><img src={stage.image} alt="" /><i /></div>}
    {final && <div className="cinema-final-arena" aria-hidden="true" style={{ "--arena-progress": arenaZoomProgress(elapsed) } as CSSProperties}>
      <img src={FINAL_ARENA_IMAGE} alt="" /><i /></div>}
    <div className="cinema-seats">{intro && !multi && <span className="cinema-vs" aria-hidden="true">VS</span>}{ids.map((id, index) => {
      const result = results.find((r) => r.playerId === id);
      const streetResult = streetSnapshot?.results.find((r) => r.playerId === id);
      const streetLabel = streetResult ? labelFor(id, streetResult) : undefined;
      const forfeited = result?.displayName === "몰수패";
      const won = !forfeited && winners.includes(id);
      const cards = cardsForRun(id);
      const label = result ? labelFor(id, result) : undefined;
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
      const interimLabel = interimHand ? detailedHandLabel(interimHand.category, interimHand.kickers, cards.slice(0, readCards), interimHand.bestFive.map((card) => card.id)) : undefined;
      const currentPoints = rankPoints[id];
      const currentRank = currentPoints === undefined ? undefined : 1 + Object.values(rankPoints).filter((points) => points > currentPoints).length;
      const tiedOnPoints = currentPoints === undefined ? false : Object.values(rankPoints).filter((points) => points === currentPoints).length > 1;
      const read = !final ? undefined : readStage.kind === "final" && label
        ? { stage: "final", tag: undefined, title: label.title, detail: label.kicker }
        : interimLabel
          ? { stage: `current-${readCards}`, tag: readCards === 3 ? "CURRENT READ · 3 CARDS" : "CURRENT BEST · 5 CARDS", title: interimLabel.title, detail: interimLabel.kicker }
          : { stage: "pending", tag: "HAND READ", title: "—", detail: undefined };
      const showFinalPlace = currentPlaceVisible || finalWinnerStage;
      const showMatchOutcome = !final && (flags.result || flags.runResult);
      const matchOutcome = (flags.runResult || match.runCards)
        ? `RUN ${frame.boardIndex + 1} · ${won ? winners.length > 1 ? "SPLIT" : "WIN" : "LOSS"}`
        : won ? winners.length > 1 ? "SPLIT" : "WIN" : "LOSS";
      return <div key={id} className={cinemaSeatClass({ tone, placement: placementClass, made, leading })} data-seat-index={index} data-player-id={id}>
        {survivalOutcome && <span className={`cinema-status-stamp ${survivalOutcome === "SURVIVED" ? "is-survived" : "is-eliminated"}`}>{survivalOutcome === "SURVIVED" ? "생존" : "탈락"}</span>}
        {swiss && <p className="swiss-record">{swiss.wins}W {swiss.draws}D {swiss.losses}L</p>}
        <div className={`cinema-profile ${!final ? "cinema-match-profile" : ""}`}>
          {!final && <div className="cinema-profile-identity"><span className="player-avatar">{id.slice(1)}</span><b title={`${name(id)}${id === identityId ? " · YOU" : ""}`}>{name(id)} {id === identityId ? "· YOU" : ""}</b></div>}
          {final && <><span className="player-avatar">{id.slice(1)}</span><b>{name(id)} {id === identityId ? "· YOU" : ""}</b></>}
          {!final && <div className="cinema-standing-line">
            {match.round >= 2 && currentRank !== undefined && !showFinalPlace && <span className="cinema-rank-badge" data-rank={currentRank} aria-label={`현재 ${tiedOnPoints ? "공동 " : ""}${currentRank}위`}><small>현재</small>{tiedOnPoints && <i>공동</i>}<b>{currentRank}위</b></span>}
            {swiss && currentPoints !== undefined && <em className="cinema-current-points">POINT {currentPoints}</em>}
          </div>}
          {final && match.round >= 2 && currentRank !== undefined && !showFinalPlace && <span className="cinema-rank-badge" data-rank={currentRank} aria-label={`현재 ${tiedOnPoints ? "공동 " : ""}${currentRank}위`}><small>현재</small>{tiedOnPoints && <i>공동</i>}<b>{currentRank}위</b></span>}
          {final && swiss && currentPoints !== undefined && <em className="cinema-current-points">POINT {currentPoints}</em>}
          {final && showFinalPlace && <span className={`cinema-victory place-${result?.place ?? 0}`}>{result?.place === 1 && match.winnerIds.length > 1 ? "SPLIT · 1ST" : ordinalPlace(result?.place)}</span>}
          {!final && <div className="cinema-profile-outcome">
            {showMatchOutcome && <span className="cinema-victory" key="outcome">{matchOutcome}{multi && result ? ` · ${result.place}위` : ""}</span>}
          </div>}
        </div>
        <div className="cinema-hole-cards">{cards.map((card, cardIndex) => {
          const visible = (!final && intro) || (!intro && (!final || cardIndex < frame.finalCards));
          const used = result?.usedCardIds.includes(card.id) ?? false;
          if (final) {
            const slot = finalRevealSlot(cardIndex);
            const slotStyle = { "--flip-delay": `${slot.offset * FINAL_REVEAL_STAGGER_MS[slot.batch] / speed}ms` } as CSSProperties;
            return <ShowdownCardFlip card={card} open={visible} glow={flags.glow && used} dimmed={flags.holeDim && !used}
            className={`batch-${slot.batch} ${!visible && slot.batch === nextBatch ? "is-next" : ""}`} style={slotStyle} key={cardIndex} />;
          }
          return <ShowdownCardFlip card={card} open={visible && !(cardSwitch && cardIndex === 1)} glow={flags.glow && used} dimmed={flags.holeDim && !used}
            className={intro ? "cinema-vs-reveal" : ""} style={intro ? { "--flip-delay": `${cardIndex * 200}ms` } as CSSProperties : undefined} key={cardIndex} />;
        })}</div>
        {read && <div className={`cinema-final-read is-${read.stage === "final" || read.stage === "pending" ? read.stage : "current"}`}>
          <div className="cinema-final-read-copy" key={read.stage}>{read.tag && <small>{read.tag}</small>}<strong>{read.title}</strong>{read.detail && <em>({read.detail})</em>}</div></div>}
        {!intro && !final && !flags.made && streetLabel && <div className="cinema-street-made" key={`${frame.boardIndex}-${streetIndex}`}><strong>{streetLabel.title}</strong>{streetLabel.kicker && <em>({streetLabel.kicker})</em>}</div>}
        {!final && flags.made && label && <div className="cinema-made"><strong>{label.title}</strong>{label.kicker && <small>({label.kicker})</small>}</div>}
        {(flags.reward || flags.runResult && match.runRewards) && reward && showReward && <div className="cinema-reward">{final
          ? <strong><span>{ordinalPlace(result?.place)} PLACE REWARD</span><i>·</i><span>{reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))} POINT</span></strong>
          : <strong>{reward.deltaBB >= 0 ? "+ " : "- "}{Number(Math.abs(reward.deltaBB).toFixed(2))}BB <i>·</i> {reward.deltaPoints >= 0 ? "+ " : "- "}{Number(Math.abs(reward.deltaPoints).toFixed(2))}P 획득</strong>}</div>}
      </div>;
    })}</div>
    {!intro && !final && <div className={`cinema-board-stack ${match.runoutCount === 2 ? "run-it-twice" : ""}`}>{visibleBoardIndexes.map((boardIndex) => {
      const current = boardIndex === frame.boardIndex;
      const pending = boardIndex > frame.boardIndex;
      const collapsed = match.runoutCount === 2 && boardIndex < frame.boardIndex;
      const shownBoard = match.boards[boardIndex] ?? [];
      const boardResults = match.boardResults[boardIndex] ?? [];
      const boardWinners = match.boardWinnerIds[boardIndex] ?? [];
      const boardFocus = current ? focus : boardResults.find((result) => boardWinners.includes(result.playerId)) ?? boardResults[0];
      const completed = !pending && (!current || flags.glow);
      const matchupComplete = boardIndex === 0 && current && ["RUN_RESULT", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase);
      const boardTitle = boardIndex < match.runoutCount ? match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : "COMMUNITY BOARD"
        : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      return <div className={`cinema-board ${pending ? "pending" : !current ? "complete" : "active"} ${collapsed ? "is-collapsed" : ""} made-${completed && boardFocus ? madeTone(boardFocus.displayName) : "default"}`} key={boardIndex}>
        <h3>{boardTitle}</h3>
        {collapsed && <div className="cinema-run-summary"><RunMatchup match={match} index={boardIndex} viewerId={viewerId} complete winnerGlowOnly className="cinema-board-matchup" /></div>}
        {!collapsed && match.runoutCount === 2 && matchupComplete && <RunMatchup match={match} index={boardIndex} viewerId={viewerId} complete className="cinema-board-matchup" />}
        {!collapsed && <div className="cinema-board-cards">{shownBoard.map((card, index) => {
          const visible = !pending && (!current || index < frame.revealed);
          const used = boardFocus?.usedCardIds.includes(card.id) ?? false;
          return <ShowdownCardFlip card={card} open={visible} glow={completed && used} dimmed={completed && !used}
            className={`${current && index === 4 ? "cinema-river" : ""} ${current && frame.phase === "RIVER_SUSPENSE" && index === 4 ? "cinema-suspense" : ""}`}
            key={`${boardIndex}-${index}`} />;
        })}</div>}
      </div>;
    })}</div>}
    <footer className="cinema-footer" aria-live="polite">{intro ? final ? "네 플레이어의 마지막 패" : "상대를 확인하세요" : flags.reward ? "" : final && frame.phase === "FINAL_WINNER" ? "1위 확정" : final && frame.phase === "FINAL_PLACE" ? `${frame.finalPlace}위 확정` : flags.result ? "MATCH RESULT" : flags.runResult ? `${runLabel} RESULT` : flags.made ? "MADE HAND" : flags.glow ? "BEST 5" : final ? finalHeading.kicker : frame.phase.startsWith("FLOP") ? "FLOP" : frame.phase.startsWith("TURN") ? "TURN" : frame.phase.startsWith("RIVER") ? "RIVER" : runLabel}
      {frame.phase === "COMPLETE" && !synced && <button className="primary" onClick={onComplete}>{final ? "최종 결과 확인 →" : "결과 확인 →"}</button>}
      {frame.phase === "COMPLETE" && synced && nextMatchSeconds !== undefined && <span className="cinema-next-match"><small>NEXT MATCH</small><strong>{nextMatchSeconds}</strong><span>· 다음 매칭을 진행합니다.</span></span>}</footer>
  </section>;
}

/** Shown once this seat's matches are done while another table is still playing. */
export function WaitingForTables({ preparing = false }: { preparing?: boolean } = {}) {
  return <section className="cinema cinema-waiting" aria-live="polite" data-phase="WAITING">
    <span className="cinema-waiting-pulse" aria-hidden="true"><i /><i /><i /></span>
    <p>{preparing ? "쇼다운을 준비하고 있습니다." : "다른 매치 결과를 기다리는 중입니다."}</p>
  </section>;
}

function matchPrepView(match: MatchView, profiles: Profile[], viewerId: string): ShowdownPrepView | undefined {
  if (match.participantIds.length < 2) return undefined;
  const ids = match.participantIds.length === 2 ? showdownSeatOrder(match.participantIds, viewerId)
    : match.participantIds.includes(viewerId) ? [viewerId, ...match.participantIds.filter((id) => id !== viewerId)] : match.participantIds;
  const seat = (id: string) => ({
    playerId: id,
    name: profiles.find((profile) => profile.playerId === id)?.name ?? id,
    points: match.standingsBefore?.[id] ?? profiles.find((profile) => profile.playerId === id)?.points ?? 0,
    cards: match.runCards?.[id] ? [...new Map(match.runCards[id]!.flat().map((card) => [card.id, card])).values()] : match.revealedCards[id] ?? [],
  });
  const opponents = ids.slice(1).map(seat);
  return { matchNumber: displayedMatchNumber(match),
    viewer: seat(ids[0]!), ...(opponents.length === 1 ? { opponent: opponents[0] } : { opponents }) };
}

function MatchPrepScreen({ match, profiles, viewerId, seconds }: {
  match: MatchView; profiles: Profile[]; viewerId: string; seconds: number;
}) {
  const alive = profiles.filter((profile) => profile.alive !== false).length;
  return <main className="game-arena"><nav className="match-prep-nav">
    <div className="brand"><span><img src="/assets/brand/porena-mark.webp" alt="" width="38" height="38" /></span><div><b>PORENA</b><small>TACTICAL POKER AUTOBATTLER</small></div></div>
    <RoundProgress round={match.round} prep={null} />
    <div className="nav-status"><div className="survivors"><small>SURVIVORS</small><b>{alive}<i>/ 8</i></b></div></div>
  </nav><div className="page-shell" id="top"><ShowdownPrepPanel round={match.round}
    playerName={profiles.find((profile) => profile.playerId === viewerId)?.name ?? viewerId}
    seconds={seconds} matchup={matchPrepView(match, profiles, viewerId)} /></div></main>;
}

function MatchPrepInterlude({ match, profiles, viewerId, onComplete }: {
  match: MatchView; profiles: Profile[]; viewerId: string; onComplete: () => void;
}) {
  const [seconds, setSeconds] = useState(MATCH_PREP_MS / 1000);
  const finish = useRef(onComplete);
  useEffect(() => { finish.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((MATCH_PREP_MS - (performance.now() - started)) / 1000))), 100);
    const done = setTimeout(() => finish.current(), MATCH_PREP_MS);
    return () => { clearInterval(timer); clearTimeout(done); };
  }, []);
  return <MatchPrepScreen match={match} profiles={profiles} viewerId={viewerId} seconds={seconds} />;
}

/**
 * Online playback on the server clock: every seat derives the same frame from the shared startsAt,
 * steps through shared match slots (with a three-second inter-match result hold), and releases the
 * results at the shared endsAt. Missed frames (hidden tab, reconnect) are skipped, not replayed.
 */
function SyncedCinematicGate({ matches, presentation, clock, profiles, viewerId, identityId, receivedAt, soundSessionId, children }: {
  matches: MatchView[]; presentation: PresentationView; clock: ServerClock; profiles: Profile[]; viewerId: string; identityId?: string; receivedAt?: number; soundSessionId: string; children: React.ReactNode;
}) {
  const [tick, setTick] = useState(() => ({ now: clock.now(), jumped: false }));
  const { now } = tick;
  const done = now >= presentation.endsAt && (receivedAt === undefined || receivedAt >= presentation.endsAt);
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setTick((previous) => {
      const next = clock.now();
      return { now: next, jumped: next - previous.now > CATCH_UP_MS };
    }), 40);
    return () => clearInterval(timer);
  }, [done, clock, presentation.startsAt, presentation.endsAt]);
  if (presentation.version !== PRESENTATION_VERSION && receivedAt !== undefined) return <section className="panel" role="alert"><p>새 게임 버전이 필요합니다. 좌석을 유지한 채 새로고침해 주세요.</p><button onClick={() => location.reload()}>새로고침</button></section>;
  if (done) return <>{children}</>;
  const elapsed = now - presentation.startsAt;
  const entry = presentation.matches.find((item) => elapsed >= item.offsetMs && elapsed < item.offsetMs + item.durationMs);
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
  if (match.round < 5 && entry.prepMs && matchElapsed < entry.prepMs) return <MatchPrepScreen key={`${match.id}:prep`} match={match}
    profiles={profiles} viewerId={viewerId} seconds={Math.ceil((entry.prepMs - matchElapsed) / 1000)} />;
  return <ShowdownCinematic key={match.id} match={match} profiles={profiles} viewerId={viewerId} identityId={identityId} soundSessionId={soundSessionId} onComplete={() => {}} elapsedMs={matchElapsed - (entry.prepMs ?? 0)} catchUp={tick.jumped} />;
}

/** Hides scoreboards, logs, final standings and next-stage controls until presentation completes. */
export function CinematicGate({ matches, profiles, viewerId, identityId, receivedAt, controls = false, presentation, clock, soundSessionId = "game", children }: {
  matches: MatchView[]; profiles: Profile[]; viewerId: string; identityId?: string; receivedAt?: number; controls?: boolean;
  soundSessionId?: string;
  /** Online: server schedule + clock. Without them (local simulation) playback stays client-paced. */
  presentation?: PresentationView; clock?: ServerClock; children: React.ReactNode;
}) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<string[]>([]);
  if (presentation && clock) return <SyncedCinematicGate matches={matches} presentation={presentation} clock={clock} profiles={profiles} viewerId={viewerId} identityId={identityId} receivedAt={receivedAt} soundSessionId={soundSessionId}>{children}</SyncedCinematicGate>;
  const current = matches.find((match) => !completed.includes(match.id));
  if (!current) return <>{children}</>;
  if (current.round < 5 && matches[0]?.id !== current.id && !prepared.includes(current.id)) return <MatchPrepInterlude key={`${current.id}:prep`}
    match={current} profiles={profiles} viewerId={viewerId} onComplete={() => setPrepared((ids) => [...ids, current.id])} />;
  return <ShowdownCinematic key={current.id} match={current} profiles={profiles} viewerId={viewerId} soundSessionId={soundSessionId} controls={controls}
    onComplete={() => setCompleted((ids) => [...ids, current.id])} />;
}
