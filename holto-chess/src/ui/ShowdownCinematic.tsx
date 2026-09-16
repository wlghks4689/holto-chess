import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { MatchView, RevealedHand } from "../shared/protocol";
import { CardBack, CardView } from "./CardView";
import { cinematicTimeline, frameAt, revealFlags } from "./cinematicTimeline";
import { detailedHandLabel } from "./handLabel";
import { madeTone } from "./madeTone";
import "./cinematic.css";

type Profile = { playerId: string; name: string };
type Props = { match: MatchView; profiles: Profile[]; viewerId: string; onComplete: () => void };
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

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
  const winners = flags.result || final ? match.winnerIds : match.boardWinnerIds[frame.boardIndex] ?? [];
  const focus = results.find((r) => r.playerId === focusId) ?? results.find((r) => winners.includes(r.playerId)) ?? results[0];
  const board = match.boards[frame.boardIndex] ?? [];
  const ids = [...match.participantIds].sort((a, b) => {
    if (!multi) return intro ? Number(a === viewerId) - Number(b === viewerId) : Number(b === viewerId) - Number(a === viewerId);
    return 0;
  });
  const name = (id: string) => profiles.find((p) => p.playerId === id)?.name ?? id;
  const title = final ? "FINAL SHOWDOWN" : multi ? match.group === "winner" ? "WINNER SHOWDOWN" : "SURVIVAL SHOWDOWN" : "SHOWDOWN";
  const runLabel = frame.boardIndex >= match.runoutCount ? `SUDDEN DEATH ${frame.boardIndex - match.runoutCount + 1}`
    : match.runoutCount > 1 ? `RUN ${frame.boardIndex + 1}` : `COMMUNITY BOARD - MATCH ${match.matchNumber}`;

  const labelFor = (id: string, result: RevealedHand) => detailedHandLabel(result.category, result.kickers, match.revealedCards[id] ?? [], result.usedCardIds);
  return <section className={`cinema ${intro ? "cinema-intro" : "cinema-table"} ${multi ? "cinema-multi" : "cinema-headsup"} ${final ? "cinema-final" : ""}`}
    aria-label={title} data-phase={frame.phase} data-match-id={match.id}
    style={{ "--flip-duration": `${220 / speed}ms`, "--river-duration": `${400 / speed}ms`, "--suspense-duration": `${250 / speed}ms` } as CSSProperties}>
    <header className="cinema-heading"><div><span className="eyebrow">ROUND {match.round} · MATCH {match.matchNumber}</span><h2>{title}</h2></div>
      <div className="cinema-controls"><label>속도 <select aria-label="Animation Speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1x</option><option value={2}>2x</option></select></label>
        <button className="secondary" onClick={onComplete}>Skip Cinematic</button></div></header>
    <div className="cinema-seats">{ids.map((id, index) => {
      const result = results.find((r) => r.playerId === id);
      const won = winners.includes(id);
      const cards = match.revealedCards[id] ?? [];
      const label = result ? labelFor(id, result) : undefined;
      const reward = match.rewards.find((r) => r.playerId === id);
      return <div key={id} className={`cinema-seat ${flags.profile ? won ? "cinema-winner" : "cinema-loser" : ""} made-${flags.glow && result ? madeTone(result.displayName) : "default"}`}>
        {!multi && index === 1 && <span className="cinema-vs" aria-hidden="true">VS</span>}
        <div className="cinema-profile"><span className="player-avatar">{id.slice(1)}</span><b>{name(id)} {id === viewerId ? "· YOU" : ""}</b>
          {flags.result && <span className="cinema-victory">{final ? `${result?.place ?? "—"}위` : won ? winners.length > 1 ? "SPLIT" : "VICTORY" : "LOSS"}</span>}
          {flags.runResult && <span className="cinema-victory">{won ? winners.length > 1 ? "SPLIT" : "WIN" : "LOSS"}{multi && result ? ` · ${result.place}위` : ""}</span>}</div>
        <div className="cinema-hole-cards">{cards.map((card, cardIndex) => {
          const visible = !final || (!intro && cardIndex < frame.finalCards);
          const used = result?.usedCardIds.includes(card.id) ?? false;
          return <div className={visible ? "cinema-card-open" : "cinema-card-hidden"} key={`${card.id}-${visible}`}>
            {visible ? <CardView card={card} compact glow={flags.glow && used} dimmed={flags.holeDim && !used} /> : <CardBack compact />}</div>;
        })}</div>
        {flags.made && label && <div className="cinema-made"><strong>{label.title}</strong>{label.kicker && <small>({label.kicker})</small>}</div>}
        {flags.glow && board.length > 0 && result && <button className="cinema-focus" aria-pressed={focus?.playerId === id} onClick={() => setFocusId(id)}>BEST 5 확인{match.round === 3 ? " · 홀 2 + 보드 3" : ""}</button>}
        {flags.reward && reward && <div className="cinema-reward"><b>{signed(reward.deltaBB)} BB · {signed(reward.deltaPoints)} POINT</b><small>BB {reward.beforeBB} → {reward.afterBB} · POINT {reward.beforePoints} → {reward.afterPoints}</small><em>{reward.outcome.replaceAll("_", " ")}</em></div>}
      </div>;
    })}</div>
    {!intro && !final && <div className={`cinema-board made-${flags.glow && focus ? madeTone(focus.displayName) : "default"}`}>
      <h3>{runLabel}</h3>
      <div className="cinema-board-cards">{board.map((card, index) => {
        const visible = index < frame.revealed;
        const used = focus?.usedCardIds.includes(card.id) ?? false;
        return <div className={`${visible ? "cinema-card-open" : "cinema-card-hidden"} ${index === 4 ? "cinema-river" : ""} ${frame.phase === "RIVER_SUSPENSE" && index === 4 ? "cinema-suspense" : ""}`} key={`${frame.boardIndex}-${index}-${visible}`}>
          {visible ? <CardView card={card} compact glow={flags.glow && used} dimmed={flags.boardDim && !used} /> : <CardBack compact />}</div>;
      })}</div>
      {flags.glow && focus && <p className="hint">{name(focus.playerId)} · BEST 5{match.round === 3 ? " · 홀 2장 + 보드 3장" : ""}</p>}
    </div>}
    <footer className="cinema-footer" aria-live="polite">{intro ? final ? "네 플레이어의 마지막 패" : "상대를 확인하세요" : flags.reward ? "보상 지급 완료" : flags.result ? "MATCH RESULT" : flags.made ? "MADE HAND" : flags.glow ? "BEST 5" : final ? "THE LAST HAND" : runLabel}
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
