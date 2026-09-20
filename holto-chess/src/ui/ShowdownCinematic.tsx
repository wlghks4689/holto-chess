import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { MatchView, PresentationView, RevealedHand } from "../shared/protocol";
import { cinematicTimeline, displayedStreetIndex, frameAt, revealFlags, type CinematicFrame } from "./cinematicTimeline";
import { FINAL_ARENA_IMAGE, FINAL_REVEAL_STAGGER_MS, arenaZoomProgress, finalHeadingCopy, finalNextBatch, finalReadStage, finalRevealSlot, ordinalPlace, visibleFinalHand } from "./finalShowdownPresentation";
import { detailedHandLabel } from "./handLabel";
import { madeTone } from "./madeTone";
import { cinemaSeatClass } from "./madeFxClasses";
import { showdownStage } from "./showdownStage";
import type { ServerClock } from "./serverClock";
import { ShowdownCardFlip } from "./ShowdownCardFlip";
import { useCinematicMotion } from "./useCinematicMotion";
import { showdownSeatOrder } from "./showdownSeatOrder";
import "./cinematic.css";
import { HighCardDrawNotice, HighCardDrawResult } from "./HighCardDraw";

type Profile = { playerId: string; name: string };
/**
 * `controls` exposes speed/skip for local simulation only. `elapsedMs` hands playback to an outside
 * clock (the server-synced gate): no local timer, no speed, no per-match confirm.
 */
type Props = { match: MatchView; profiles: Profile[]; viewerId: string; onComplete: () => void; controls?: boolean; elapsedMs?: number; catchUp?: boolean };
/** A jump larger than this (hidden tab, reconnect) lands on the current frame without replaying transitions. */
const CATCH_UP_MS = 400;

function RunTimeline({ match, frame, viewerId, name }: { match: MatchView; frame: CinematicFrame; viewerId: string; name: (id: string) => string }) {
  if (match.runoutCount !== 2) return null;
  const currentComplete = ["RUN_RESULT", "HIGH_CARD_NOTICE", "HIGH_CARD_DRAW", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase);
  const outcome = (boardIndex: number) => {
    const winners = match.boardWinnerIds[boardIndex] ?? [];
    if (winners.length > 1) return "SPLIT";
    if (winners[0] === viewerId) return "YOU WIN";
    return winners[0] ? "OPPONENT WIN" : "결과 대기";
  };
  const runComplete = (index: number) => frame.boardIndex > index || frame.boardIndex === index && currentComplete;
  const scoreVisible = runComplete(1);
  const scores = match.participantIds.map((id) => match.boardWinnerIds.slice(0, 2).filter((winners) => winners.length === 1 && winners[0] === id).length);
  const tiebreakCount = Math.max(0, frame.boardIndex - match.runoutCount + 1);
  return <aside className="cinema-run-timeline" aria-label="Run It Twice 진행 상황">
    {[0, 1].map((index) => <div className={`cinema-run-row ${frame.boardIndex === index && !runComplete(index) ? "active" : ""} ${runComplete(index) ? "complete" : ""}`} key={index}>
      <span>RUN {index + 1}</span><i /> <b>{runComplete(index) ? outcome(index) : frame.boardIndex === index ? "진행 중…" : "대기"}</b>
    </div>)}
    {scoreVisible && <div className="cinema-run-score"><span>{name(match.participantIds[0]!)}</span><strong>{scores[0]} : {scores[1]}</strong><span>{name(match.participantIds[1]!)}</span></div>}
    {scoreVisible && match.boards.length > 2 && Array.from({ length: tiebreakCount }, (_, offset) => {
      const boardIndex = match.runoutCount + offset; const complete = runComplete(boardIndex);
      return <div className={`cinema-run-row tiebreak ${frame.boardIndex === boardIndex && !complete ? "active" : ""} ${complete ? "complete" : ""}`} key={boardIndex}>
        <span>TIEBREAK {offset + 1}</span><i /><b>{complete ? outcome(boardIndex) : "진행 중…"}</b>
      </div>;
    })}
  </aside>;
}

export function ShowdownCinematic({ match, profiles, viewerId, onComplete, controls = false, elapsedMs, catchUp = false }: Props) {
  const motion = useCinematicMotion();
  const synced = elapsedMs !== undefined;
  const [localElapsed, setElapsed] = useState(0);
  const [localSpeed, setSpeed] = useState(1);
  const speed = synced ? 1 : localSpeed;
  const elapsed = synced ? elapsedMs : localElapsed;
  const [focusId, setFocusId] = useState<string | null>(null);
  const frames = cinematicTimeline(match);
  const frame = frameAt(frames, elapsed);
  const flags = revealFlags(frame.phase);
  const final = match.round === 5;
  const stage = showdownStage(match.round);
  const intro = frame.phase === "VS_INTRO";
  const arenaEnter = frame.phase === "ARENA_ENTER";
  const multi = match.participantIds.length > 2;
  const finalWinnerStage = final && flags.winner;

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
  const streetName = ["프리플랍", "플랍", "턴", "리버"][streetIndex];
  const winners = final ? finalWinnerStage ? match.winnerIds : [] : flags.result ? match.winnerIds : match.boardWinnerIds[frame.boardIndex] ?? [];
  const focus = results.find((r) => r.playerId === focusId) ?? results.find((r) => winners.includes(r.playerId)) ?? results[0];
  const board = match.boards[frame.boardIndex] ?? [];
  const ids = showdownSeatOrder(match.participantIds, viewerId);
  const name = (id: string) => profiles.find((p) => p.playerId === id)?.name ?? id;
  const title = match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : final ? "FINAL SHOWDOWN" : multi ? match.group === "winner" ? "WINNER SHOWDOWN" : "SURVIVAL SHOWDOWN" : "SHOWDOWN";
  const runLabel = frame.boardIndex >= match.runoutCount ? `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${frame.boardIndex - match.runoutCount + 1}`
    : match.runoutCount > 1 ? `RUN ${frame.boardIndex + 1}` : "COMMUNITY BOARD";
  // Mount the next run/decider during the current result beat, while every card is still closed.
  // This keeps RUN 1 on stage and lets RUN 2 reveal by flipping already-present slots.
  const queuedBoard = frame.phase === "RUN_RESULT" && frame.boardIndex + 1 < match.boards.length ? 1 : 0;
  const visibleBoardIndexes = match.boards.length > 1
    ? Array.from({ length: frame.boardIndex + 1 + queuedBoard }, (_, index) => index)
    : [frame.boardIndex];

  const labelFor = (id: string, result: RevealedHand) => detailedHandLabel(result.category, result.kickers, match.revealedCards[id] ?? [], result.usedCardIds);
  const finalHeading = finalHeadingCopy(frame);
  const nextBatch = final ? finalNextBatch(frame.phase) : undefined;
  const phaseMs = (frames[frames.indexOf(frame) + 1]?.at ?? frame.at) - frame.at;
  const readStage = finalReadStage(frame.phase);
  return <section className={`cinema ${motion.enabled ? "cinema-motion-enabled" : ""} ${intro ? "cinema-intro" : "cinema-table"} ${multi ? "cinema-multi" : "cinema-headsup"} ${final ? "cinema-final" : ""} ${stage ? `cinema-staged stage-r${stage.level}` : ""} ${arenaEnter ? "cinema-arena-enter" : ""} ${catchUp ? "cinema-catchup" : ""}`}
    aria-label={title} data-phase={frame.phase} data-match-id={match.id}
    style={{ "--flip-duration": `${420 / speed}ms`, "--river-duration": `${600 / speed}ms`, "--suspense-duration": `${250 / speed}ms`, "--final-beat": `${1 / speed}`, "--phase-duration": `${phaseMs / speed}ms` } as CSSProperties}>
    <header className={`cinema-heading ${final ? "cinema-final-heading" : ""}`}><div key={final ? finalHeading.title : undefined} className={final ? "cinema-heading-copy" : undefined}><span className="eyebrow" key={final ? finalHeading.kicker : undefined}>{final ? finalHeading.kicker : `ROUND ${match.round} · MATCH ${match.matchday ? `${match.matchday}/3` : match.matchNumber}`}</span><h2>{final ? finalHeading.title : title}</h2></div>
      {controls && !synced && <div className="cinema-controls"><label>속도 <select aria-label="Animation Speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1x</option><option value={2}>2x</option></select></label>
        <button className="secondary" onClick={onComplete}>Skip Cinematic</button></div>}</header>
    {!intro && <RunTimeline match={match} frame={frame} viewerId={viewerId} name={name} />}
    {match.highCardDraw && frame.phase === "HIGH_CARD_NOTICE" && <HighCardDrawNotice survival={match.group === "loser"} seconds={Math.max(1, Math.ceil((frame.at + phaseMs - elapsed) / 1000))} />}
    {match.highCardDraw && ["HIGH_CARD_DRAW", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase) && <HighCardDrawResult draw={match.highCardDraw} name={name} survival={match.group === "loser"} />}
    {stage && <div className="cinema-stage" aria-hidden="true" style={{ "--stage-focus": stage.focus } as CSSProperties}><img src={stage.image} alt="" /><i /></div>}
    {final && <div className="cinema-final-arena" aria-hidden="true" style={{ "--arena-progress": arenaZoomProgress(elapsed) } as CSSProperties}>
      <img src={FINAL_ARENA_IMAGE} alt="" /><i /></div>}
    <div className="cinema-seats">{ids.map((id, index) => {
      const result = results.find((r) => r.playerId === id);
      const streetResult = streetSnapshot?.results.find((r) => r.playerId === id);
      const streetLabel = streetResult ? labelFor(id, streetResult) : undefined;
      const won = winners.includes(id);
      const cards = match.revealedCards[id] ?? [];
      const label = result ? labelFor(id, result) : undefined;
      const swiss = (flags.reward ? match.swissAfter : match.swissBefore)?.[id];
      const ledger = match.rewards.find((reward) => reward.playerId === id);
      const reward = match.rewards.find((r) => r.playerId === id);
      const survivalOutcome = flags.result && match.group === "loser" && (reward?.outcome === "SURVIVED" || reward?.outcome === "ELIMINATED") ? reward.outcome : undefined;
      const tone = flags.glow && result ? madeTone(result.displayName) : "default";
      const currentPlaceVisible = final && frame.phase === "FINAL_PLACE" && frame.finalPlace !== undefined && !!result && result.place >= frame.finalPlace;
      const placementClass = final ? finalWinnerStage ? won ? "cinema-winner" : "cinema-loser" : currentPlaceVisible ? "cinema-final-resolved" : "" : flags.profile ? won ? "cinema-winner" : "cinema-loser" : "";
      const made = !!(flags.glow && result);
      const leading = final && !finalWinnerStage ? undefined : won;
      const readCards = readStage.kind === "current" ? readStage.cards : 0;
      const interimHand = final && readCards ? visibleFinalHand(cards, readCards) : undefined;
      const interimLabel = interimHand ? detailedHandLabel(interimHand.category, interimHand.kickers, cards.slice(0, readCards), interimHand.bestFive.map((card) => card.id)) : undefined;
      const read = !final ? undefined : readStage.kind === "final" && label
        ? { stage: "final", tag: "FINAL BEST 5", title: label.title, detail: label.kicker }
        : interimLabel
          ? { stage: `current-${readCards}`, tag: readCards === 3 ? "CURRENT READ · 3 CARDS" : "CURRENT BEST · 5 CARDS", title: interimLabel.title, detail: interimLabel.kicker }
          : { stage: "pending", tag: "HAND READ", title: "—", detail: undefined };
      const showFinalPlace = currentPlaceVisible || finalWinnerStage;
      return <div key={id} className={cinemaSeatClass({ tone, placement: placementClass, made, leading })} data-seat-index={index} data-player-id={id}>
        {intro && !multi && index === 1 && <span className="cinema-vs" aria-hidden="true">VS</span>}
        {swiss && <p className="swiss-record">{swiss.wins}W {swiss.draws}D {swiss.losses}L</p>}
        <div className="cinema-profile"><span className="player-avatar">{id.slice(1)}</span><b>{name(id)} {id === viewerId ? "· YOU" : ""}</b>
          {swiss && <em className="cinema-current-points">POINT {flags.reward ? ledger?.afterPoints : ledger?.beforePoints}</em>}
          {final && showFinalPlace && <span className={`cinema-victory place-${result?.place ?? 0}`}>{result?.place === 1 && match.winnerIds.length > 1 ? "SPLIT · 1ST" : ordinalPlace(result?.place)}</span>}
          {survivalOutcome && <span className={`cinema-status-stamp ${survivalOutcome === "SURVIVED" ? "is-survived" : "is-eliminated"}`}>{survivalOutcome === "SURVIVED" ? "생존" : "탈락"}</span>}
          {!final && (flags.result || flags.runResult) && !survivalOutcome && <span className="cinema-victory" key="outcome">{flags.runResult ? `RUN ${frame.boardIndex + 1} · ${won ? winners.length > 1 ? "SPLIT" : "WIN" : "LOSS"}` : won ? winners.length > 1 ? "SPLIT" : "VICTORY" : "LOSS"}{multi && result ? ` · ${result.place}위` : ""}</span>}</div>
        <div className="cinema-hole-cards">{cards.map((card, cardIndex) => {
          const visible = !intro && (!final || cardIndex < frame.finalCards);
          const used = result?.usedCardIds.includes(card.id) ?? false;
          if (final) {
            const slot = finalRevealSlot(cardIndex);
            const slotStyle = { "--flip-delay": `${slot.offset * FINAL_REVEAL_STAGGER_MS[slot.batch] / speed}ms` } as CSSProperties;
            return <ShowdownCardFlip card={card} open={visible} glow={flags.glow && used} dimmed={flags.holeDim && !used}
              className={`batch-${slot.batch} ${!visible && slot.batch === nextBatch ? "is-next" : ""}`} style={slotStyle} key={card.id} />;
          }
          return <ShowdownCardFlip card={card} open={visible} glow={flags.glow && used} dimmed={flags.holeDim && !used} key={card.id} />;
        })}</div>
        {read && <div className={`cinema-final-read is-${read.stage === "final" || read.stage === "pending" ? read.stage : "current"}`}>
          <div className="cinema-final-read-copy" key={read.stage}><small>{read.tag}</small><strong>{read.title}</strong>{read.detail && <em>({read.detail})</em>}</div></div>}
        {!intro && !final && !flags.made && streetLabel && <div className="cinema-street-made" key={`${frame.boardIndex}-${streetIndex}`}><small>{streetName}</small><strong>{streetLabel.title}</strong>{streetLabel.kicker && <em>({streetLabel.kicker})</em>}</div>}
        {!final && flags.made && label && <div className="cinema-made"><strong>{label.title}</strong>{label.kicker && <small>({label.kicker})</small>}</div>}
        {flags.glow && board.length > 0 && result && <button className="cinema-focus" aria-pressed={focus?.playerId === id} onClick={() => setFocusId(id)}>BEST 5 확인{match.round === 3 ? " · 홀 2 + 보드 3" : ""}</button>}
        {flags.reward && reward && <div className="cinema-reward">{final
          ? <strong>{ordinalPlace(result?.place)} PLACE REWARD <i>·</i> {reward.deltaPoints >= 0 ? "+" : ""}{Number(reward.deltaPoints.toFixed(2))} POINT</strong>
          : <strong>{reward.deltaBB >= 0 ? "+ " : "- "}{Number(Math.abs(reward.deltaBB).toFixed(2))}BB <i>·</i> {reward.deltaPoints >= 0 ? "+ " : "- "}{Number(Math.abs(reward.deltaPoints).toFixed(2))}P 획득</strong>}</div>}
      </div>;
    })}</div>
    {!intro && !final && <div className={`cinema-board-stack ${match.runoutCount === 2 ? "run-it-twice" : ""}`}>{visibleBoardIndexes.map((boardIndex) => {
      const current = boardIndex === frame.boardIndex;
      const pending = boardIndex > frame.boardIndex;
      const shownBoard = match.boards[boardIndex] ?? [];
      const boardResults = match.boardResults[boardIndex] ?? [];
      const boardWinners = match.boardWinnerIds[boardIndex] ?? [];
      const boardFocus = current ? focus : boardResults.find((result) => boardWinners.includes(result.playerId)) ?? boardResults[0];
      const completed = !pending && (!current || flags.glow);
      const boardTitle = boardIndex < match.runoutCount ? match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : "COMMUNITY BOARD"
        : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      const outcome = boardWinners.length > 1 ? "SPLIT" : boardWinners[0] === viewerId ? "YOU WIN" : boardWinners[0] ? "OPPONENT WIN" : "";
      return <div className={`cinema-board ${pending ? "pending" : !current ? "complete" : "active"} made-${completed && boardFocus ? madeTone(boardFocus.displayName) : "default"}`} key={boardIndex}>
        <h3>{boardTitle}{!current && !pending && outcome ? <b>{outcome}</b> : null}</h3>
        <div className="cinema-board-cards">{shownBoard.map((card, index) => {
          const visible = !pending && (!current || index < frame.revealed);
          const used = boardFocus?.usedCardIds.includes(card.id) ?? false;
          return <ShowdownCardFlip card={card} open={visible} glow={completed && used} dimmed={completed && !used}
            className={`${current && index === 4 ? "cinema-river" : ""} ${current && frame.phase === "RIVER_SUSPENSE" && index === 4 ? "cinema-suspense" : ""}`}
            key={`${boardIndex}-${card.id}`} />;
        })}</div>
      </div>;
    })}</div>}
    <footer className="cinema-footer" aria-live="polite">{intro ? final ? "네 플레이어의 마지막 패" : "상대를 확인하세요" : flags.reward ? final ? "승점 정산 완료" : "보상 지급 완료" : final && frame.phase === "FINAL_WINNER" ? "1위 확정" : final && frame.phase === "FINAL_PLACE" ? `${frame.finalPlace}위 확정` : flags.result ? "MATCH RESULT" : flags.runResult ? `${runLabel} RESULT` : flags.made ? "MADE HAND" : flags.glow ? "BEST 5" : final ? finalHeading.kicker : frame.phase.startsWith("FLOP") ? "FLOP" : frame.phase.startsWith("TURN") ? "TURN" : frame.phase.startsWith("RIVER") ? "RIVER" : runLabel}
      {frame.phase === "COMPLETE" && !synced && <button className="primary" onClick={onComplete}>결과 확인 →</button>}</footer>
  </section>;
}

/** Shown once this seat's matches are done while another table is still playing. */
export function WaitingForTables() {
  return <section className="cinema cinema-waiting" aria-live="polite" data-phase="WAITING">
    <span className="cinema-waiting-pulse" aria-hidden="true"><i /><i /><i /></span>
    <p>다른 매치 결과를 기다리는 중입니다.</p>
  </section>;
}

/**
 * Online playback on the server clock: every seat derives the same frame from the shared startsAt,
 * steps through its own matches (with the 1.5s hold built into each entry), and releases the
 * results at the shared endsAt. Missed frames (hidden tab, reconnect) are skipped, not replayed.
 */
function SyncedCinematicGate({ matches, presentation, clock, profiles, viewerId, children }: {
  matches: MatchView[]; presentation: PresentationView; clock: ServerClock; profiles: Profile[]; viewerId: string; children: React.ReactNode;
}) {
  const [tick, setTick] = useState(() => ({ now: clock.now(), jumped: false }));
  const { now } = tick;
  const done = now >= presentation.endsAt;
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setTick((previous) => {
      const next = clock.now();
      return { now: next, jumped: next - previous.now > CATCH_UP_MS };
    }), 40);
    return () => clearInterval(timer);
  }, [done, clock, presentation.startsAt, presentation.endsAt]);
  if (done) return <>{children}</>;
  const elapsed = now - presentation.startsAt;
  const entry = presentation.matches.find((item) => elapsed < item.offsetMs + item.durationMs);
  const match = entry && matches.find((item) => item.id === entry.matchId);
  if (!entry || !match) return <WaitingForTables />;
  return <ShowdownCinematic key={match.id} match={match} profiles={profiles} viewerId={viewerId} onComplete={() => {}} elapsedMs={elapsed - entry.offsetMs} catchUp={tick.jumped} />;
}

/** Hides scoreboards, logs, final standings and next-stage controls until presentation completes. */
export function CinematicGate({ matches, profiles, viewerId, controls = false, presentation, clock, children }: {
  matches: MatchView[]; profiles: Profile[]; viewerId: string; controls?: boolean;
  /** Online: server schedule + clock. Without them (local simulation) playback stays client-paced. */
  presentation?: PresentationView; clock?: ServerClock; children: React.ReactNode;
}) {
  const [completed, setCompleted] = useState<string[]>([]);
  if (presentation && clock) return <SyncedCinematicGate matches={matches} presentation={presentation} clock={clock} profiles={profiles} viewerId={viewerId}>{children}</SyncedCinematicGate>;
  const current = matches.find((match) => !completed.includes(match.id));
  if (!current) return <>{children}</>;
  return <ShowdownCinematic key={current.id} match={current} profiles={profiles} viewerId={viewerId} controls={controls}
    onComplete={() => setCompleted((ids) => [...ids, current.id])} />;
}
