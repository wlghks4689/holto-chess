/* eslint-disable react-refresh/only-export-components -- Standalone browser fault-injection harness. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createRoomConnection } from "../../src/network/roomConnection";
import { addSession, barrierDeadline, createRoom, forceBarrier } from "../../src/game/room";
import { startNextRound } from "../../src/game/engine";
import { createPlayerView } from "../../src/game/playerView";
import type { PlayerView, ServerMessage } from "../../src/shared/protocol";
import { OpenDraftPanel } from "../../src/ui/OpenDraft";
import "../../src/ui/styles.css";
import "../../src/ui/responsive.css";

// This exercises the real browser transport and UI against a deliberately silent alarm.
// Actual Durable Object commit/broadcast/authentication are covered in deadlineRecovery.test.ts.
class FixtureSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(private receive: (message: { type: string; nonce?: string }) => void) {}
  send(raw: string) { this.receive(JSON.parse(raw)); }
  deliver(message: ServerMessage) { this.onmessage?.({ data: JSON.stringify(message) }); }
  close() { this.readyState = 3; }
}

function Harness() {
  const [view, setView] = useState<PlayerView>();
  const [now, setNow] = useState(Date.now);
  const [report, setReport] = useState("");
  useEffect(() => {
    let room = addSession(createRoom("QAONLY", 900), "test-only").room;
    room.game.round = 3; room.game.phase = "NEXT_ROUND";
    room.game = startNextRound(room.game); room.status = "PLAYING";
    const started = Date.now(); room.barrierSince = started;
    const deadline = barrierDeadline(room)!;
    const probes: number[] = []; const phases: { phase: string; atMs: number }[] = [];
    const errors: string[] = []; let maxGapMs = 0; let lastTick = performance.now();
    const fixed = new URLSearchParams(location.search).get("recovery") !== "0";
    const socket = new FixtureSocket(message => {
      if (message.type === "JOIN_ROOM") socket.deliver({ type: "ROOM_JOINED", roomId: room.roomId, playerId: "p1" });
      if (message.type === "SYNC_CLOCK") {
        probes.push(Date.now() - started);
        socket.deliver({ type: "CLOCK_SYNC", nonce: message.nonce!, receivedAt: Date.now(), sentAt: Date.now() });
        if (fixed) room = forceBarrier(room, Date.now()) ?? room;
      }
      socket.deliver({ type: "PLAYER_VIEW", payload: createPlayerView(room, "p1") });
    });
    const transport = createRoomConnection({
      protocols: async () => [], open: () => { setTimeout(() => socket.onopen?.(), 0); return socket as unknown as WebSocket; },
      join: () => JSON.stringify({ type: "JOIN_ROOM" }), needsClock: () => true,
      serverNow: () => Date.now(), visible: () => !document.hidden,
      onStatus: () => {}, onError: message => { if (message) errors.push(message); }, onClock: () => {}, onResume: () => {}, onExpired: () => {},
      onMessage: message => {
        if (message.type !== "PLAYER_VIEW") return;
        if (phases.at(-1)?.phase !== message.payload.phase) phases.push({ phase: message.payload.phase, atMs: Date.now() - started });
        setView(message.payload);
      },
    });
    const timer = setInterval(() => {
      const tick = performance.now(); maxGapMs = Math.max(maxGapMs, tick - lastTick); lastTick = tick;
      setNow(Date.now());
      setReport(JSON.stringify({ mode: "browser transport + simulated delayed alarm", fixed, deadlineMs: deadline - started, phases, probes,
        maxGapMs: Math.round(maxGapMs), errors }));
    }, 100);
    // Hold the first recovered frame for inspection rather than auto-picking a player's cards later.
    const finish = setTimeout(() => { transport.dispose(); clearInterval(timer); }, 6500);
    return () => { clearTimeout(finish); clearInterval(timer); transport.dispose(); };
  }, []);
  return <main className="game-arena"><header style={{ padding: 16, background: "#071520" }}>
    <h1 style={{ fontSize: 20 }}>R4 전환 복구 검증</h1>
    <p>개발 검증 전용 · 알람 도착을 중단한 모의 환경 · 실제 브라우저 전송 코드 사용</p>
    <output id="deadline-report" style={{ display: "block", overflowWrap: "anywhere", fontSize: 12 }}>{report}</output>
  </header>{view && <OpenDraftPanel view={view} disabled send={() => {}} seconds={view.barrierEndsAt === undefined ? null : Math.max(0, Math.ceil((view.barrierEndsAt - now) / 1000))} />}</main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
