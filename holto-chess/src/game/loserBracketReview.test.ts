import { describe, expect, it, vi } from "vitest";
import { releasePlayerCards } from "./cardPool";
import { resolveSecondary } from "./engine";
import { createMatchView } from "./matchView";
import { presentationViewFor, syncPresentation } from "./presentation";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, pendingBarrierIds, turnKey } from "./room";
import { cinematicTimeline } from "../shared/presentationTimeline";

// Isolate the all-tied branch with a shared royal flush; owned cards exclude it.
vi.mock("./showdownDeck", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./showdownDeck")>();
  return { ...actual, drawCommunityBoards: (_deck: unknown, count: number) =>
    Array.from({ length: count }, () => [10, 11, 12, 13, 14].map((rank) => ({
      id: ({ 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] + "s", rank, suit: "s",
    }))) };
});

function bracket(seed: number) {
  let room = addSession(createRoom("REVIEW", seed), "one").room;
  room = addSession(room, "two").room;
  room.status = "PLAYING";
  room.game.round = 4;
  room.game.phase = "SHOWDOWN_SECONDARY";
  for (const player of room.game.players) releasePlayerCards(room.game, player);
  const cards = room.game.ownershipCardPool.filter((entry) => entry.card.suit !== "s");
  for (const [i, player] of room.game.players.entries()) {
    player.eliminated = i >= 6;
    if (player.eliminated) continue;
    for (const entry of cards.slice(i * 5, i * 5 + 5)) {
      entry.state = "OWNED";
      entry.ownerPlayerId = player.id;
      player.ownedCardIds.push(entry.card.id);
    }
  }
  room.game.winnerGroup = ["p4", "p5", "p6"];
  room.game.loserGroup = ["p1", "p2", "p3"];
  room.barrierSince = 1000;
  return room;
}

function bothHumansLose() {
  for (let seed = 1; seed <= 100; seed++) {
    const room = bracket(seed);
    const result = resolveSecondary(room.game);
    if (result.players.slice(0, 2).every((player) => player.eliminated)) return { room, result };
  }
  throw new Error("Could not find deterministic two-human elimination fixture");
}

describe("current R4 loser bracket review", () => {
  it("resolves three-way MAX ties with two sudden deaths then one high-card survivor", () => {
    const { result } = bothHumansLose();
    const match = result.roundResults.find((entry) => entry.group === "loser")!;
    expect(result.rulesVersion).toBe(2);
    expect(match.playerIds).toHaveLength(3);
    expect(match.boards).toHaveLength(3);
    expect(match.suddenDeathCount).toBe(2);
    expect(match.boardWinnerIds.every((ids) => ids.length === 3)).toBe(true);
    expect(match.highCardDraw!.draws).toHaveLength(3);
    expect(new Set(match.highCardDraw!.draws.map((draw) => draw.rank)).size).toBe(3);
    expect(match.winnerIds).toEqual(["p3"]);
    const rewards = Object.fromEntries(match.rewards!.map((reward) => [reward.playerId, reward]));
    expect(rewards.p3).toMatchObject({ deltaBB: 0, deltaPoints: 0, outcome: "SURVIVED" });
    expect(rewards.p1).toMatchObject({ deltaBB: 0, deltaPoints: 0, outcome: "ELIMINATED" });
    expect(rewards.p2).toMatchObject({ deltaBB: 0, deltaPoints: 0, outcome: "ELIMINATED" });
    expect(result.players.filter((player) => !player.eliminated)).toHaveLength(4);
    expect(result.players.slice(0, 2).every((player) => player.eliminatedRound === 4)).toBe(true);
    const frames = cinematicTimeline(createMatchView(result, match));
    const notice = frames.find((frame) => frame.phase === "HIGH_CARD_NOTICE")!;
    const draw = frames.find((frame) => frame.phase === "HIGH_CARD_DRAW")!;
    expect(draw.at - notice.at).toBe(6500);
  });

  it("holds the R4 result and eventually finishes on bots after both humans lose", () => {
    const { room } = bothHumansLose();
    const next = forceBarrier(room, barrierDeadline(room)!)!;
    expect(next.game.round).toBe(4);
    expect(next.game.phase).toBe("ROUND_RESULT");
    expect(next.game.matches.filter((match) => match.id.startsWith("4-") && match.group === "loser")).toHaveLength(1);
    expect(next.game.players.slice(0, 2).every((player) => player.eliminatedRound === 4)).toBe(true);
    expect(forceBarrier(next, next.presentation!.endsAt - 1)).toBeNull();
    expect(() => applyRoomAction(next, "p1", { type: "READY" }, turnKey(next), next.presentation!.endsAt - 1)).toThrow(/연출/);
    let finished = next;
    for (let step = 0; step < 10 && finished.game.phase !== "GAME_RESULT"; step++) {
      finished = forceBarrier(finished, barrierDeadline(finished)!)!;
      expect(finished).not.toBeNull();
    }
    expect(finished.game.phase).toBe("GAME_RESULT");
    expect(finished.presentation!.perPlayer.p1.length).toBeGreaterThan(0);
  });

  it("preserves the R4 elimination result when both humans lose", () => {
    const { room } = bothHumansLose();
    const next = forceBarrier(room, barrierDeadline(room)!)!;
    expect(next.game.round).toBe(4);
    expect(next.game.phase).toBe("ROUND_RESULT");
    expect(next.presentation?.perPlayer.p1.length).toBeGreaterThan(0);
  });

  it("schedules AI matches for eliminated humans watching a surviving bot", () => {
    const { room, result } = bothHumansLose();
    room.game = result;
    syncPresentation(room, 1000);
    expect(presentationViewFor(room, "p3")!.matches.length).toBeGreaterThan(0);
  });

  it("lets eliminated viewers confirm only after playback, then holds the next showdown", () => {
    const { room } = bothHumansLose();
    let next = forceBarrier(room, barrierDeadline(room)!)!;
    const end = next.presentation!.endsAt;
    next = applyRoomAction(next, "p1", { type: "READY" }, turnKey(next), end);
    expect(next.game.phase).toBe("ROUND_RESULT");
    expect(pendingBarrierIds(next)).toEqual(["p2"]);
    next = applyRoomAction(next, "p2", { type: "READY" }, turnKey(next), end);
    expect(next.game.round).toBe(5);
    expect(next.game.phase).toBe("SHOWDOWN_PRIMARY");
  });

  it("does not require eliminated viewers to confirm while a human survivor remains", () => {
    const { room } = bothHumansLose();
    room.sessions.push({ playerId: "p4", tokenHash: "three", requests: [] });
    const next = forceBarrier(room, barrierDeadline(room)!)!;
    expect(next.game.phase).toBe("ROUND_RESULT");
    expect(pendingBarrierIds(next)).toEqual(["p4"]);
    expect(next.presentation!.perPlayer.p1).toHaveLength(1);
    expect(next.presentation!.perPlayer.p1[0]!.matchId).toBe(next.game.roundResults.find((match) => match.group === "loser")!.id);
  });
});
