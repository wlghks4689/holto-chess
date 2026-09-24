import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import type { MatchView } from "../shared/protocol";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { discloseMatch, nextDisclosureAt } from "./disclosure";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, migrateRoomSnapshot, turnKey } from "./room";
import { createPlayerView } from "./playerView";
import { syncPresentation } from "./presentation";
import { createMatchView } from "./matchView";

const deck = makeDeck();
const match: MatchView = { id: "m", round: 2, stage: "primary", matchNumber: 1,
  participantIds: ["p1", "p2"], winnerIds: ["p2"], revealedCards: { p1: deck.slice(0, 2), p2: deck.slice(2, 4) },
  boards: [deck.slice(5, 10), deck.slice(10, 15)], boardWinnerIds: [["p1"], ["p2"]], boardResults: [[], []], results: [], rewards: [],
  runoutCount: 2, suddenDeathCount: 0 };
const entry = { matchId: "m", offsetMs: 0, durationMs: 50_000 };
const at = (phase: string, boardIndex = 0) => cinematicTimeline(match).find(frame => frame.phase === phase && frame.boardIndex === boardIndex)!.at;
function game() {
  let room = createRoom("ABCDEF", 815);
  for (let i = 0; i < 8; i++) room = addSession(room, `hash-${i}`).room;
  for (const s of room.sessions) room = applyRoomAction(room, s.playerId, { type: "READY" }, turnKey(room), 1000);
  return room;
}
describe("server-authorized disclosure", () => {
  it("does not transmit the next match or undealt board values", () => {
    expect(discloseMatch(match, entry, 1000, 999)).toBeUndefined();
    const view = discloseMatch(match, entry, 1000, 1000 + at("FLOP_1"))!;
    expect(view.boards[0][0]).toEqual(match.boards[0][0]);
    expect(view.boards[0].slice(1).every(card => card.hidden)).toBe(true);
    expect(view.boards[1].every(card => card.hidden)).toBe(true);
    expect(view.winnerIds).toEqual([]);
    for (const card of match.boards.flat().slice(1)) expect(JSON.stringify(view)).not.toContain(`"${card.id}"`);
  });
  it("does not reveal the eventual match winner during RUN 1 result", () => {
    const view = discloseMatch(match, entry, 0, at("RUN_RESULT"))!;
    expect(view.boardWinnerIds[0]).toEqual(["p1"]);
    expect(view.boardWinnerIds[1]).toEqual([]);
    expect(view.winnerIds).toEqual([]);
  });
  it("sends only the authorized final reveal batch, never future private cards", () => {
    const final = { ...match, round: 5 as const, boards: [], boardResults: [], boardWinnerIds: [], runoutCount: 0,
      revealedCards: { p1: deck.slice(0, 7), p2: deck.slice(7, 14) } };
    const frame = cinematicTimeline(final).find(frame => frame.phase === "FINAL_FIRST_REVEAL")!;
    const view = discloseMatch(final, entry, 0, frame.at)!;
    expect(view.revealedCards.p2.slice(0, 3)).toEqual(final.revealedCards.p2.slice(0, 3));
    expect(view.revealedCards.p2.slice(3).every(card => card.hidden)).toBe(true);
    expect(view.winnerIds).toEqual([]);
  });
  it("hides all final archives until an eligible viewer opens standings after the shared end", () => {
    let room = game();
    for (let n = 0; n < 100 && room.game.phase !== "GAME_RESULT"; n++) room = forceBarrier(room, barrierDeadline(room)!)!;
    expect(room.game.phase).toBe("GAME_RESULT");
    const end = room.presentation!.endsAt;
    const alive = room.game.players.find(p => !p.eliminated)!.id;
    const eliminated = room.game.players.find(p => p.eliminated)!.id;
    const before = createPlayerView(room, alive, [], end - 1);
    expect(before.standings).toEqual([]);
    expect(before.roundHistory).toEqual([]);
    expect(before.finalResultsReleased).toBe(false);
    expect(() => applyRoomAction(room, alive, { type: "FINAL_RESULTS_VIEWED" }, turnKey(room), end - 1)).toThrow();
    expect(() => applyRoomAction(room, eliminated, { type: "FINAL_RESULTS_VIEWED" }, turnKey(room), end)).toThrow();
    expect(createPlayerView(room, alive, [], end).standings).toHaveLength(8);
    expect(createPlayerView(room, alive, [], end).finalResultsReleased).toBe(false);
    room = applyRoomAction(room, alive, { type: "FINAL_RESULTS_VIEWED" }, turnKey(room), end);
    expect(createPlayerView(room, eliminated, [], end).finalResultsReleased).toBe(true);
  });
  it("uses one shared offset per match and spectator presence cannot extend the schedule", () => {
    let room = game();
    for (let n = 0; n < 100 && !(room.game.round === 4 && room.game.phase === "GROUP_ASSIGNMENT"); n++) room = forceBarrier(room, barrierDeadline(room)!)!;
    expect(room.game.round).toBe(4);
    const withSpectators = room.presentation!;
    const timings = new Map<string, number>();
    for (const entries of Object.values(withSpectators.perPlayer)) for (const entry of entries) {
      if (timings.has(entry.matchId)) expect(entry.offsetMs).toBe(timings.get(entry.matchId));
      timings.set(entry.matchId, entry.offsetMs);
    }
    room.sessions = room.sessions.filter(s => !room.game.players.find(p => p.id === s.playerId)!.eliminated);
    delete room.presentation;
    syncPresentation(room, withSpectators.startsAt - 700);
    expect(room.presentation!.endsAt).toBe(withSpectators.endsAt);
    expect([...timings.values()].every(offset => offset === 0)).toBe(true);
    expect(nextDisclosureAt(room, room.presentation!.startsAt - 1)).toBe(room.presentation!.startsAt);
    expect(nextDisclosureAt(room, room.presentation!.endsAt)).toBeUndefined();
  });

  it("keeps genuine long deciders in the common schedule", () => {
    let room = game();
    for (let n = 0; n < 100 && !(room.game.round === 4 && room.game.phase === "GROUP_ASSIGNMENT"); n++) room = forceBarrier(room, barrierDeadline(room)!)!;
    const normal = room.presentation!;
    const deciding = room.game.roundResults[0];
    deciding.highCardDraw = { draws: [], winnerId: deciding.playerIds[0] };
    delete room.presentation;
    syncPresentation(room, normal.startsAt - 700);
    expect(room.presentation!.endsAt).toBeGreaterThan(normal.endsAt);
    expect(room.presentation!.perPlayer[deciding.playerIds[0]][0].offsetMs).toBe(0);
  });

  it("migrates a persisted presentation without restarting playback or changing game results", () => {
    let room = game();
    while (!room.presentation) room = forceBarrier(room, barrierDeadline(room)!)!;
    room.presentation.version = 8;
    const before = structuredClone(room);
    const migrated = migrateRoomSnapshot(room);
    expect(migrated.presentation!.version).toBe(9);
    expect(migrated.presentation!.startsAt).toBe(before.presentation!.startsAt);
    expect(migrated.game).toEqual(before.game);
    expect(room).toEqual(before);
    expect(migrateRoomSnapshot(migrated)).toBe(migrated);
  });

  it("does not include any unknown board value in any field at any frame of a real R1–R5 game", () => {
    let room = game();
    for (let n = 0; n < 100; n++) {
      if (room.presentation) for (const result of room.game.roundResults) {
        const full = createMatchView(room.game, result);
        for (const frame of cinematicTimeline(full)) {
          const safe = discloseMatch(full, { ...entry, matchId: full.id }, 0, frame.at)!;
          const known = new Set([...Object.values(safe.revealedCards).flat(), ...safe.boards.flat()].filter(card => !card.hidden).map(card => card.id));
          // A reset deck may repeat an already public card in a future run; that value is no longer secret.
          const unknown = [...full.boards.flat(), ...Object.values(full.revealedCards).flat()].filter(card => !known.has(card.id));
          for (const card of unknown) expect(JSON.stringify(safe), `${full.id}/${frame.phase}/${card.id}`).not.toContain(`"${card.id}"`);
          if (full.round === 5 && !["FINAL_WINNER", "REWARD", "COMPLETE"].includes(frame.phase)) {
            expect(safe.rewards).toEqual([]);
            expect(safe.pointAwards).toBeUndefined();
            expect(safe.standingsAfterRuns).toEqual([]);
          }
        }
      }
      if (room.game.phase === "GAME_RESULT") break;
      room = forceBarrier(room, barrierDeadline(room)!)!;
    }
    expect(room.game.phase).toBe("GAME_RESULT");
  });
});
