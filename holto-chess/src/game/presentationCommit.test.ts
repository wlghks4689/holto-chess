import { expect, it } from "vitest";
import { anchorNewPresentation, needsPresentationAnchor } from "./presentationCommit";
import { createRoom, barrierDeadline, type RoomSnapshot } from "./room";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { PRESENTATION_LEAD_MS, PRESENTATION_VERSION } from "../shared/presentationTimeline";
function prep() {
  const previous = createRoom("ANCHOR", 789); previous.status = "PLAYING"; previous.game.phase = "SHOP";
  const next = structuredClone(previous); next.game.phase = "SHOWDOWN_PRIMARY"; next.barrierSince = 1000;
  return { previous, next };
}
it("slow preparation cannot consume the match setup window", () => {
  const { previous, next } = prep(); const readyAt = 9000;
  expect(needsPresentationAnchor(previous, next)).toBe(true);
  anchorNewPresentation(previous, next, readyAt);
  expect(barrierDeadline(next)).toBe(readyAt + PRESENTATION_LEAD_MS + BARRIER_TIMEOUT_MS.MATCH_SETUP);
});
it("shifts a new cinematic as one schedule without changing disclosure offsets or durations", () => {
  const { previous, next } = prep(); next.game.phase = "ROUND_RESULT";
  next.presentation = { version: PRESENTATION_VERSION, key: "new", startsAt: 1700, endsAt: 31700,
    perPlayer: { p1: [{ matchId: "m", offsetMs: 0, durationMs: 30000 }] } };
  const entries = structuredClone(next.presentation.perPlayer);
  anchorNewPresentation(previous, next, 9000);
  expect(next.presentation.startsAt).toBe(9700); expect(next.presentation.endsAt).toBe(39700);
  expect(next.presentation.perPlayer).toEqual(entries);
});
it("never restarts a live or overdue prep on ready, clock, presence or reconnect commits", () => {
  const { next } = prep(); const prior = structuredClone(next);
  expect(needsPresentationAnchor(prior, next)).toBe(false); anchorNewPresentation(prior, next, 100000);
  expect(next).toEqual(prior);
});
it("never restarts a live cinematic, including schedule version migration", () => {
  const { next } = prep(); next.game.phase = "ROUND_RESULT";
  next.presentation = { version: PRESENTATION_VERSION, key: "same", startsAt: 1000, endsAt: 31000, perPlayer: {} };
  const prior = structuredClone(next); prior.presentation!.version--;
  expect(needsPresentationAnchor(prior, next)).toBe(false); anchorNewPresentation(prior, next, 100000);
  expect(next.presentation.startsAt).toBe(1000);
});
it("does not turn an intentionally finished bot-only presentation into a replay", () => {
  const { previous, next } = prep(); next.game.phase = "ROUND_RESULT";
  next.presentation = { version: PRESENTATION_VERSION, key: "finished", startsAt: 1000, endsAt: 1000, perPlayer: {} };
  expect(needsPresentationAnchor(previous, next)).toBe(false);
});
it("recognizes a new game generation even if round and phase names repeat", () => {
  const { next } = prep(); const prior = structuredClone(next); next.gameGeneration = (prior.gameGeneration ?? 0) + 1;
  expect(needsPresentationAnchor(prior as RoomSnapshot, next)).toBe(true);
});
