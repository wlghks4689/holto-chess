// Local Vite test harness only; uses the same gate and components as both game modes.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CinematicGate } from "../../src/ui/ShowdownCinematic";
import { ShowdownPrepPanel } from "../../src/ui/ShowdownPrepPanel";
import { qaMatch } from "../../src/ui/responsiveFixtures";
import { cinematicTimeline } from "../../src/ui/cinematicTimeline";
import { MATCH_PREP_MS, PRESENTATION_VERSION } from "../../src/shared/presentationTimeline";
import "../../src/ui/styles.css";
import "../../src/ui/responsive.css";

const params = new URLSearchParams(location.search);
const round = Number(params.get("round") ?? 4) as 1 | 2 | 3 | 4;
const match = qaMatch(round, round === 3 ? 4 : round === 4 ? 5 : round === 2 ? 3 : 2, round >= 3 && !params.has("headsUp"));
const profiles = match.participantIds.map(playerId => ({ playerId, name: playerId, points: 0 }));
const seats = profiles.map(p => ({ ...p, cards: match.revealedCards[p.playerId]!, runCards: match.runCards?.[p.playerId] }));
const started = Date.now();
const durationMs = cinematicTimeline(match).at(-1)!.at;
const presentation = { version: PRESENTATION_VERSION, startsAt: started, endsAt: started + MATCH_PREP_MS + durationMs,
  matches: [{ matchId: match.id, offsetMs: 0, durationMs: MATCH_PREP_MS + durationMs, prepMs: MATCH_PREP_MS }] };
const clock = { now: () => Date.now(), observe: () => {}, offset: () => 0 };

function Harness() {
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = setTimeout(() => setReady(true), MATCH_PREP_MS); return () => clearTimeout(id); }, []);
  if (params.get("mode") === "online") return <CinematicGate matches={[match]} profiles={profiles} viewerId="p1"
    presentation={presentation} clock={clock} receivedAt={Infinity}><p data-testid="result">RESULT</p></CinematicGate>;
  return ready ? <CinematicGate matches={[match]} profiles={profiles} viewerId="p1"><p data-testid="result">RESULT</p></CinematicGate>
    : <ShowdownPrepPanel round={round} final={false} playerName="p1" seconds={3}
      matchup={{ matchNumber: 1, viewer: seats[0]!, opponents: seats.slice(1) }} />;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
