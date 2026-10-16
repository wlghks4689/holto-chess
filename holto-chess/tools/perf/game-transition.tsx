/* eslint-disable react-refresh/only-export-components -- Standalone development measurement entrypoint. */
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createGame } from "../../src/game/engine";
import { createMatchView } from "../../src/game/matchView";
import type { PorenaGameState, Round } from "../../src/game/types";
import type { PlayerView } from "../../src/shared/protocol";
import { useLocalGame } from "../../src/ui/useLocalGame";
import { visibleTimeout } from "../../src/ui/visibleTimeout";
import { CinematicGate } from "../../src/ui/ShowdownCinematic";
import { ShowdownPrepPanel } from "../../src/ui/ShowdownPrepPanel";
import { MATCH_PREP_MS } from "../../src/shared/presentationTimeline";
import { App } from "../../src/ui/App";
import "../../src/ui/styles.css";
import "../../src/ui/responsive.css";

const params = new URLSearchParams(location.search);
const round = Number(params.get("round") ?? 2) as Round;
const mode = params.get("mode") ?? "local";
const clock = { now: () => Date.now(), observe: () => {}, offset: () => 0 };
function Audit() {
  const [report, setReport] = useState("");
  useEffect(() => {
    const start = performance.now(); let last = start; let maxGapMs = 0; let maxTaskMs = 0; let previous = "";
    const transitions: { phase: string; at: number }[] = []; let prepOdds: string[] = []; let cards: number[] = [];
    const runMoves: { run: number; at: number; movingAnimations: number; openDuringMove: number; next?: string; nextAt?: number; movingAtNext?: number }[] = [];
    const errors: string[] = []; const onError = (event: ErrorEvent) => errors.push(event.message);
    window.addEventListener("error", onError);
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) maxTaskMs = Math.max(maxTaskMs, entry.duration); });
    observer.observe({ type: "longtask" });
    const timer = setInterval(() => {
      const now = performance.now(); maxGapMs = Math.max(maxGapMs, now - last); last = now;
      const phase = document.querySelector(".cinema")?.getAttribute("data-phase") || (document.querySelector(".showdown-prep") ? "PREP" : "CALCULATING");
      if (phase !== previous) { transitions.push({ phase, at: Math.round(now - start) }); previous = phase; }
      const liveBoard = document.querySelector<HTMLElement>(".cinema-board-stack>.cinema-board.active");
      const boardAnimations = [...document.querySelectorAll(".cinema-board-stack>.cinema-board")].flatMap(board => board.getAnimations()).filter(animation => animation.playState === "running").length;
      if (phase === "RUN_TRANSITION" && liveBoard) {
        const run = Number(liveBoard.dataset.runIndex);
        if (runMoves.at(-1)?.run !== run) runMoves.push({ run, at: Math.round(now - start), movingAnimations: 0, openDuringMove: 0 });
        const move = runMoves.at(-1)!;
        move.movingAnimations = Math.max(move.movingAnimations, boardAnimations);
        move.openDuringMove = Math.max(move.openDuringMove, liveBoard.querySelectorAll('.cinema-board-cards .cinema-flip-slot[data-open="true"]').length);
      } else if (runMoves.length && !runMoves.at(-1)!.next) {
        Object.assign(runMoves.at(-1)!, { next: phase, nextAt: Math.round(now - start), movingAtNext: boardAnimations });
      }
      const odds = [...document.querySelectorAll(".showdown-prep-equity strong,.r2-run-equity strong")].map(el => el.textContent ?? "");
      if (phase === "PREP" && odds.length && odds.every(v => /\d+%/.test(v))) prepOdds = odds;
      if (phase === "PREP") cards = [...document.querySelectorAll(".r2-run-cards,.showdown-prep-hand")].map(el => el.children.length);
      if (Math.floor(now / 500) !== Math.floor((now - 40) / 500)) setReport(JSON.stringify({ mode, round, maxGapMs: Math.round(maxGapMs), maxTaskMs, transitions, runMoves, prepOdds, cards,
        equity: [...document.querySelectorAll(".cinema-equity-meter")].map(el => el.getAttribute("data-equity")), errors,
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    }, 40);
    return () => { clearInterval(timer); observer.disconnect(); window.removeEventListener("error", onError); };
  }, []);
  return <details style={{ position: "fixed", zIndex: 1000, bottom: 0, left: 0, maxWidth: "100vw", background: "#071520", fontSize: 10 }}><summary>Transition measurements</summary><output id="transition-report" style={{ display: "block", maxHeight: 150, overflow: "auto", overflowWrap: "anywhere" }}>{report}</output></details>;
}
function Harness() {
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const local = useLocalGame(() => createGame(789));
  const [loaded, setLoaded] = useState(false); const [view, setView] = useState<PlayerView>(); const [viewer, setViewer] = useState("p1"); const [error, setError] = useState("");
  const { reset, run } = local;
  useEffect(() => {
    const worker = new Worker(new URL("./game-transition.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ game?: PorenaGameState; view?: PlayerView; viewer?: string; error?: string; metrics?: Record<string, number> }>) => {
      if (event.data.metrics) setMetrics(event.data.metrics);
      if (event.data.game) { reset(event.data.game); setLoaded(true); }
      if (event.data.view) { setView(event.data.view); setViewer(event.data.viewer!); setLoaded(true); }
      if (event.data.error) setError(event.data.error);
    };
    worker.onerror = event => setError(event.message);
    worker.postMessage({ round, mode });
    const tick = mode === "online" ? setInterval(() => worker.postMessage({}), 100) : undefined;
    return () => { clearInterval(tick); worker.terminate(); };
  }, [reset]);
  useEffect(() => {
    if (mode !== "local" || !loaded || local.game.phase !== "SHOWDOWN_PRIMARY") return;
    return visibleTimeout(() => run({ type: "ADVANCE" }), MATCH_PREP_MS);
  }, [loaded, local.game.phase, run]);
  const matches = useMemo(() => {
    const mine = local.game.roundResults.filter(m => m.playerIds.includes("p1"));
    return (mine.length ? mine : local.game.roundResults).map(m => createMatchView(local.game, m));
  }, [local.game]);
  const shown = mode === "online" ? view : local.view;
  const prep = shown?.showdownPrep;
  const profiles = mode === "online" ? view?.players ?? [] : local.game.players;
  return <><Audit /><details style={{ position:"fixed", top:0, left:0, zIndex:1000, background:"#071520", fontSize:10 }}><summary>Engine measurements</summary><output id="engine-report">{JSON.stringify(metrics)}</output></details>{error && <p role="alert">{error}</p>}
    {local.failure && <p role="alert">Worker failure <button onClick={local.retry}>Retry</button></p>}
    {!loaded ? <p role="status">Preparing real R{round} engine fixture</p> : <CinematicGate matches={mode === "online" ? view?.matches ?? [] : matches}
      profiles={profiles.map(p => ({ playerId: "playerId" in p ? p.playerId : p.id, name: p.name, points: p.points }))} viewerId={viewer}
      presentation={mode === "online" ? view?.presentation : undefined} clock={mode === "online" ? clock : undefined} receivedAt={view?.serverNow}>
      {shown?.phase === "SHOWDOWN_PRIMARY" ? <main className="game-arena"><div className="page-shell"><ShowdownPrepPanel round={round} final={round === 6} playerName={viewer} seconds={3.5} matchup={prep} /></div></main> : <p>Result reached</p>}
    </CinematicGate>}
  </>;
}
createRoot(document.getElementById("root")!).render(<StrictMode>{params.has("app") ? <><Audit /><App onHome={() => location.reload()} /></> : <Harness />}</StrictMode>);
