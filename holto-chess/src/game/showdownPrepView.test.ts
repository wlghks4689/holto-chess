import { describe, expect, it } from "vitest";
import { prepareShowdown, resolvePrimary } from "./engine";
import { createPlayerView } from "./playerView";
import { addSession, createRoom } from "./room";

describe("showdown prep view", () => {
  it("provides each R2 player's full dead-card hand and the actual split-run pairs", () => {
    const room = addSession(createRoom("R2PREP", 20260927, "secure"), "player").room;
    room.status = "PLAYING";
    room.game.round = 2;
    room.game.rulesVersion = 2;
    room.game.phase = "SHOWDOWN_PRIMARY";
    const p1 = room.game.players.find((player) => player.id === "p1")!;
    const p2 = room.game.players.find((player) => player.id === "p2")!;
    p1.ownedCardIds = room.game.ownershipCardPool.slice(0, 3).map((entry) => entry.card.id);
    p2.ownedCardIds = room.game.ownershipCardPool.slice(3, 6).map((entry) => entry.card.id);
    p1.selectedCardIds = [...p1.ownedCardIds];
    p2.selectedCardIds = [...p2.ownedCardIds];
    room.game.primaryPairings = [["p1", "p2"]];

    const preview = createPlayerView(room, "p1").showdownPrep!;
    expect(preview.viewer.cards.map((card) => card.id)).toEqual(p1.ownedCardIds);
    expect(preview.viewer.runCards?.map((run) => run.map((card) => card.id))).toEqual([[p1.ownedCardIds[0], p1.ownedCardIds[1]], [p1.ownedCardIds[0], p1.ownedCardIds[2]]]);
    expect(preview.opponent?.cards.map((card) => card.id)).toEqual(p2.ownedCardIds);
    expect(preview.opponent?.runCards?.map((run) => run.map((card) => card.id))).toEqual([[p2.ownedCardIds[0], p2.ownedCardIds[1]], [p2.ownedCardIds[0], p2.ownedCardIds[2]]]);
  });

  it("reveals locked cards only in the prep phase and keeps the preview opponent for resolution", () => {
    const joined = addSession(createRoom("PREP01", 20260923, "secure"), "player");
    const before = joined.room;
    before.status = "PLAYING";
    expect(createPlayerView(before, "p1").showdownPrep).toBeUndefined();

    before.game = prepareShowdown(before.game, []);
    const preview = createPlayerView(before, "p1").showdownPrep;
    expect(preview?.viewer.cards.length).toBeGreaterThan(0);
    expect(preview?.opponent?.cards.length).toBeGreaterThan(0);
    expect(preview?.viewer.cards.length).toBeLessThanOrEqual(7);
    expect(preview?.opponent?.cards.length).toBeLessThanOrEqual(7);

    const resolved = resolvePrimary(before.game);
    const firstMatch = resolved.roundResults.find((match) => match.matchday === 1 && match.playerIds.includes("p1"));
    expect(new Set(firstMatch?.playerIds)).toEqual(new Set([preview?.viewer.playerId, preview?.opponent?.playerId]));
  });

  it("includes every seat in R4 three-way brackets but leaves R5 to the final cinematic", () => {
    const room = addSession(createRoom("MULTIWAY", 20260924, "secure"), "player").room;
    room.status = "PLAYING";
    room.game.round = 4;
    room.game.phase = "SHOWDOWN_SECONDARY";
    room.game.winnerGroup = ["p1", "p2", "p3"];
    room.game.loserGroup = ["p4", "p5", "p6"];
    const threeWay = createPlayerView(room, "p1").showdownPrep;
    expect(threeWay?.matchNumber).toBe(2);
    expect(threeWay?.opponents?.map((seat) => seat.playerId)).toEqual(["p2", "p3"]);
    room.game.round = 5;
    room.game.phase = "SHOWDOWN_PRIMARY";
    room.game.primaryPairings = [["p1", "p2", "p3", "p4"]];
    expect(createPlayerView(room, "p1").showdownPrep).toBeUndefined();
  });
});
