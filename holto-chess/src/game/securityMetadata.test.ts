import { expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import type { MatchView } from "../shared/protocol";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { discloseMatch } from "./disclosure";
import { syncPresentation, presentationViewFor } from "./presentation";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey } from "./room";
import { parseClientMessage } from "../shared/protocol";

const deck = makeDeck();
const base: MatchView = { id: "m", round: 5, stage: "final", matchNumber: 1,
  participantIds: ["p1", "p2", "p3", "p4"], winnerIds: ["p1"],
  revealedCards: Object.fromEntries(["p1", "p2", "p3", "p4"].map((id, i) => [id, deck.slice(i * 7, i * 7 + 7)])),
  boards: [], boardWinnerIds: [], boardResults: [], results: [1, 2, 3, 4].map((place, i) => ({ playerId: `p${i + 1}`, place, category: "HIGH_CARD", kickers: [], displayName: "", usedCardIds: [] })),
  rewards: [], runoutCount: 0, suddenDeathCount: 0 };
const entry = { matchId: "m", offsetMs: 0, durationMs: 50_000 };

it("does not reveal hidden final placements through future frames or their timestamps", () => {
  const tied = structuredClone(base); tied.results[1]!.place = 1; tied.winnerIds = ["p1", "p2"];
  const reveal = cinematicTimeline(base).find(frame => frame.phase === "FINAL_PLACE")!.at;
  for (const time of [0, 2500, reveal - 1]) expect(discloseMatch(tied, entry, 0, time)).toEqual(discloseMatch(base, entry, 0, time));
  const disclosed = discloseMatch(base, entry, 0, reveal)!;
  expect(disclosed.disclosure!.frames.at(-1)!.phase).toBe("FINAL_PLACE");
  expect(disclosed.disclosure!.frames.every(frame => frame.at <= reveal)).toBe(true);
});

it("does not reveal an extra runout or high-card decision through array lengths/counts/kinds", () => {
  const normal: MatchView = { ...base, round: 4, boards: [deck.slice(28, 33)], boardResults: [[]], boardWinnerIds: [[]], runoutCount: 1 };
  const deciding: MatchView = { ...structuredClone(normal), boards: [...normal.boards, deck.slice(33, 38)], boardResults: [[], []], boardWinnerIds: [[], []],
    runoutCount: 2, suddenDeathCount: 1, tiebreakKind: "WINNER_TIEBREAK", tiebreakStartIndex: 1,
    highCardDraw: { draws: [], winnerId: "p1" } };
  for (const time of [0, 400, 2500]) expect(discloseMatch(deciding, entry, 0, time)).toEqual(discloseMatch(normal, entry, 0, time));
  const secondBoard = cinematicTimeline(deciding).find(frame => frame.boardIndex === 1)!;
  const announcement = cinematicTimeline(deciding).find(frame => frame.phase === "RUN_RESULT")!;
  expect(discloseMatch(deciding, entry, 0, announcement.at - 1)!.boards).toHaveLength(1);
  expect(discloseMatch(deciding, entry, 0, announcement.at)!.boards).toHaveLength(2);
  expect(discloseMatch(deciding, entry, 0, secondBoard.at)!.boards).toHaveLength(2);
});

it("keeps outcome-dependent offsets, shared end and barrier deadline server-only until authorized", () => {
  let room = createRoom("ABCDEF", 815);
  for (let i = 0; i < 8; i++) room = addSession(room, `hash-${i}`).room;
  for (const session of room.sessions) room = applyRoomAction(room, session.playerId, { type: "READY" }, turnKey(room), 1000);
  while (!room.presentation) room = forceBarrier(room, barrierDeadline(room)!)!;
  room.publicTurnKey = { turn: turnKey(room), key: "a".repeat(64) };
  const deciding = structuredClone(room);
  deciding.game.encounterSequence += 10;
  const hidden = deciding.game.roundResults.find(match => !match.playerIds.includes("p1"))!;
  hidden.highCardDraw = { draws: [], winnerId: hidden.playerIds[0]! };
  const start = room.presentation!.startsAt;
  delete deciding.presentation; syncPresentation(deciding, start - 700);
  expect(deciding.presentation!.endsAt).toBeGreaterThan(room.presentation!.endsAt);
  expect(createPlayerView(deciding, "p1", [], start)).toEqual(createPlayerView(room, "p1", [], start));
  for (const session of room.sessions) {
    expect(createPlayerView(deciding, session.playerId, [], start)).toEqual(createPlayerView(room, session.playerId, [], start));
    const view = createPlayerView(room, session.playerId, [], start);
    expect(view.turnKey).toBe("a".repeat(64));
    expect(JSON.stringify(view)).not.toMatch(/encounterSequence|publicTurnKey|perPlayer|tokenHash/);
  }
  expect(presentationViewFor(room, "p1", start - 1)!.matches).toHaveLength(1);
  expect(createPlayerView(room, "p1", [], start).barrierEndsAt).toBeUndefined();
  expect(presentationViewFor(room, "p1", room.presentation!.endsAt - 1)!.complete).toBe(false);
  expect(presentationViewFor(room, "p1", room.presentation!.endsAt)!.complete).toBe(true);
  const first = room.game.roundResults.find(match => match.id === room.presentation!.perPlayer.p1[0]!.matchId)!;
  expect(createMatchView(room.game, first).disclosure).toBeUndefined(); // local timing remains unchanged.
});

it("parses an opaque action epoch while rejecting malformed nonces", () => {
  const message = { type: "READY", requestId: "request_123", turnKey: "a".repeat(64) };
  expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  for (const turnKey of ["a".repeat(63), "g".repeat(64), "1:SHOP:bad:2", ""]) {
    expect(() => parseClientMessage(JSON.stringify({ ...message, turnKey }))).toThrow();
  }
});
