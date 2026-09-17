import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { MatchView, RevealedHand } from "../shared/protocol";
import { CardBack, CardView } from "./CardView";
import { cinematicTimeline, displayedStreetIndex, frameAt, revealFlags, type CinematicFrame } from "./cinematicTimeline";
import { detailedHandLabel } from "./handLabel";
import { madeTone } from "./madeTone";
import "./cinematic.css";

type Profile = { playerId: string; name: string };
type Props = { match: MatchView; profiles: Profile[]; viewerId: string; onComplete: () => void };

function RunTimeline({ match, frame, viewerId, name }: { match: MatchView; frame: CinematicFrame; viewerId: string; name: (id: string) => string }) {
  if (match.runoutCount !== 2) return null;
  const currentComplete = ["RUN_RESULT", "RESULT", "REWARD", "COMPLETE"].includes(frame.phase);
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

export function ShowdownCinematic({ match, profiles, viewerId, onComplete }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [focusId, setFocusId] = useState<string | null>(null);
  const frames = cinematicTimeline(match);
  const frame = frameAt(frames, elapsed);
  const flags = revealFlags(frame.phase);
  const final = match.round === 5;
  const intro = frame.phase === "VS_INTRO";
  const multi = match.participantIds.length > 2;

  useEffect(() => {
    if (frame.phase === "COMPLETE") return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      // Active viewing time: background-tab throttling cannot skip the whole reveal.
      const delta = document.hidden ? 0 : Math.min(now - last, 100);
      last = now; setElapsed((current) => current + delta * speed);
    }, 30);
    return () => clearInterval(timer);
  }, [speed, frame.phase]);

  const results = final ? match.results : match.boardResults[frame.boardIndex] ?? [];
  const streetIndex = displayedStreetIndex(frame.phase);
  const streetSnapshot = match.streetSnapshots?.[frame.boardIndex]?.[streetIndex];
  const streetName = ["프리플랍", "플랍", "턴", "리버"][streetIndex];
  const winners = flags.result || final ? match.winnerIds : match.boardWinnerIds[frame.boardIndex] ?? [];
  const focus = results.find((r) => r.playerId === focusId) ?? results.find((r) => winners.includes(r.playerId)) ?? results[0];
  const board = match.boards[frame.boardIndex] ?? [];
  const ids = [...match.participantIds].sort((a, b) => {
    if (!multi) return intro ? Number(a === viewerId) - Number(b === viewerId) : Number(b === viewerId) - Number(a === viewerId);
    return 0;
  });
  const name = (id: string) => profiles.find((p) => p.playerId === id)?.name ?? id;
  const title = match.gameNumber ? `OMAHA GAME ${match.gameNumber}` : final ? "FINAL SHOWDOWN" : multi ? match.group === "winner" ? "WINNER SHOWDOWN" : "SURVIVAL SHOWDOWN" : "SHOWDOWN";
  const runLabel = frame.boardIndex >= match.runoutCount ? `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${frame.boardIndex - match.runoutCount + 1}`
    : match.runoutCount > 1 ? `RUN ${frame.boardIndex + 1}` : "COMMUNITY BOARD";
  const visibleBoardIndexes = match.runoutCount === 2
    ? Array.from({ length: frame.boardIndex + 1 }, (_, index) => index)
    : [frame.boardIndex];

  const labelFor = (id: string, result: RevealedHand) => detailedHandLabel(result.category, result.kickers, match.revealedCards[id] ?? [], result.usedCardIds);
  return <section className={`cinema ${intro ? "cinema-intro" : "cinema-table"} ${multi ? "cinema-multi" : "cinema-headsup"} ${final ? "cinema-final" : ""}`}
    aria-label={title} data-phase={frame.phase} data-match-id={match.id}
    style={{ "--flip-duration": `${420 / speed}ms`, "--river-duration": `${600 / speed}ms`, "--suspense-duration": `${250 / speed}ms` } as CSSProperties}>
    <header className="cinema-heading"><div><span className="eyebrow">ROUND {match.round} · MATCH {match.matchday ? `${match.matchday}/3` : match.matchNumber}</span><h2>{title}</h2></div>
      <div className="cinema-controls"><label>속도 <select aria-label="Animation Speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1x</option><option value={2}>2x</option></select></label>
        <button className="secondary" onClick={onComplete}>Skip Cinematic</button></div></header>
    {!intro && <RunTimeline match={match} frame={frame} viewerId={viewerId} name={name} />}
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
      const tone = flags.glow && result ? madeTone(result.displayName) : "default";
      const madeClass = flags.glow && result ? `cinema-made-fx ${won ? "cinema-leading" : "cinema-trailing"}` : "";
      return <div key={id} className={`cinema-seat ${flags.profile ? won ? "cinema-winner" : "cinema-loser" : ""} made-${tone} ${madeClass}`}>
        {intro && !multi && index === 1 && <span className="cinema-vs" aria-hidden="true">VS</span>}
        {swiss && <p className="swiss-record">{swiss.wins}W {swiss.draws}D {swiss.losses}L · POINT {flags.reward ? ledger?.afterPoints : ledger?.beforePoints}</p>}
        <div className="cinema-profile"><span className="player-avatar">{id.slice(1)}</span><b>{name(id)} {id === viewerId ? "· YOU" : ""}</b>
          {flags.result && <span className="cinema-victory">{final ? `${result?.place ?? "—"}위` : won ? winners.length > 1 ? "SPLIT" : "VICTORY" : "LOSS"}</span>}
          {flags.runResult && <span className="cinema-victory">{won ? winners.length > 1 ? "SPLIT" : "VICTORY" : "LOSS"}{multi && result ? ` · ${result.place}위` : ""}</span>}</div>
        <div className="cinema-hole-cards">{cards.map((card, cardIndex) => {
          const visible = !final || (!intro && cardIndex < frame.finalCards);
          const used = result?.usedCardIds.includes(card.id) ?? false;
          return <div className={visible ? "cinema-card-open" : "cinema-card-hidden"} key={`${card.id}-${visible}`}>
            {visible ? <CardView card={card} compact glow={flags.glow && used} dimmed={flags.holeDim && !used} /> : <CardBack compact />}</div>;
        })}</div>
        {!intro && !final && !flags.made && streetLabel && <div className="cinema-street-made" key={`${frame.boardIndex}-${streetIndex}`}><small>{streetName}</small><strong>{streetLabel.title}</strong>{streetLabel.kicker && <em>({streetLabel.kicker})</em>}</div>}
        {flags.made && label && <div className="cinema-made"><strong>{label.title}</strong>{label.kicker && <small>({label.kicker})</small>}</div>}
        {flags.glow && board.length > 0 && result && <button className="cinema-focus" aria-pressed={focus?.playerId === id} onClick={() => setFocusId(id)}>BEST 5 확인{match.round === 3 ? " · 홀 2 + 보드 3" : ""}</button>}
        {flags.reward && reward && <div className="cinema-reward"><strong>{reward.deltaBB >= 0 ? "+ " : "- "}{Number(Math.abs(reward.deltaBB).toFixed(2))}BB <i>·</i> 승점 {Number(reward.deltaPoints.toFixed(2))}점 획득</strong>{reward.detail && <small>{reward.detail}</small>}</div>}
      </div>;
    })}</div>
    {!intro && !final && <div className={`cinema-board-stack ${match.runoutCount === 2 ? "run-it-twice" : ""}`}>{visibleBoardIndexes.map((boardIndex) => {
      const current = boardIndex === frame.boardIndex;
      const shownBoard = match.boards[boardIndex] ?? [];
      const boardResults = match.boardResults[boardIndex] ?? [];
      const boardWinners = match.boardWinnerIds[boardIndex] ?? [];
      const boardFocus = current ? focus : boardResults.find((result) => boardWinners.includes(result.playerId)) ?? boardResults[0];
      const completed = !current || flags.glow;
      const boardTitle = boardIndex < match.runoutCount ? match.runoutCount > 1 ? `RUN ${boardIndex + 1}` : "COMMUNITY BOARD"
        : `${match.tiebreakKind?.replaceAll("_", " ") ?? "SUDDEN DEATH"} ${boardIndex - match.runoutCount + 1}`;
      const outcome = boardWinners.length > 1 ? "SPLIT" : boardWinners[0] === viewerId ? "YOU WIN" : boardWinners[0] ? "OPPONENT WIN" : "";
      return <div className={`cinema-board ${!current ? "complete" : "active"} made-${completed && boardFocus ? madeTone(boardFocus.displayName) : "default"}`} key={boardIndex}>
        <h3>{boardTitle}{!current && outcome ? <b>{outcome}</b> : null}</h3>
        <div className="cinema-board-cards">{shownBoard.map((card, index) => {
          const visible = !current || index < frame.revealed;
          const used = boardFocus?.usedCardIds.includes(card.id) ?? false;
          return <div className={`${visible ? "cinema-card-open" : "cinema-card-hidden"} ${current && index === 4 ? "cinema-river" : ""} ${current && frame.phase === "RIVER_SUSPENSE" && index === 4 ? "cinema-suspense" : ""}`} key={`${boardIndex}-${index}-${visible}`}>
            {visible ? <CardView card={card} compact glow={completed && used} dimmed={completed && !used} /> : <CardBack compact />}</div>;
        })}</div>
      </div>;
    })}</div>}
    <footer className="cinema-footer" aria-live="polite">{intro ? final ? "네 플레이어의 마지막 패" : "상대를 확인하세요" : flags.reward ? "보상 지급 완료" : flags.result ? "MATCH RESULT" : flags.runResult ? `${runLabel} RESULT` : flags.made ? "MADE HAND" : flags.glow ? "BEST 5" : final ? "THE LAST HAND" : frame.phase.startsWith("FLOP") ? "FLOP" : frame.phase.startsWith("TURN") ? "TURN" : frame.phase.startsWith("RIVER") ? "RIVER" : runLabel}
      {frame.phase === "COMPLETE" && <button className="primary" onClick={onComplete}>결과 확인 →</button>}</footer>
  </section>;
}

/** Hides scoreboards, logs, final standings and next-stage controls until presentation completes. */
export function CinematicGate({ matches, profiles, viewerId, children }: {
  matches: MatchView[]; profiles: Profile[]; viewerId: string; children: React.ReactNode;
}) {
  const [completed, setCompleted] = useState<string[]>([]);
  const current = matches.find((match) => !completed.includes(match.id));
  if (!current) return <>{children}</>;
  return <ShowdownCinematic key={current.id} match={current} profiles={profiles} viewerId={viewerId}
    onComplete={() => setCompleted((ids) => [...ids, current.id])} />;
}
