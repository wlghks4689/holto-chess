import { describe, expect, it } from "vitest";
import { BALANCE, cardPrice } from "./config";
import { createGame, finalStandings, getCardPrice, leaveRoundResult, startNextRound } from "./engine";
import { createRoom, migrateRoomSnapshot, pendingBarrierIds } from "./room";
import { createPlayerView } from "./playerView";
import { parseClientMessage } from "../shared/protocol";

describe("retired upgrade rules", () => {
  it.each([2, 4] as const)("moves R%d directly from result to next round", (round) => {
    const game = createGame(17);
    game.round = round;
    game.phase = "ROUND_RESULT";
    const next = leaveRoundResult(game);
    expect(next.phase).toBe("NEXT_ROUND");
    expect(startNextRound(next).round).toBe(round + 1);
  });

  it("uses only the base economy, score formula and public protocol", () => {
    const game = createGame(19);
    const player = game.players[0]!;
    const cardId = player.shopCardIds[0]!;
    const card = game.ownershipCardPool.find((entry) => entry.card.id === cardId)!.card;
    expect(getCardPrice(game, player.id, cardId)).toBeGreaterThanOrEqual(1);
    expect(getCardPrice(game, player.id, cardId)).toBe(cardPrice(card.rank));
    for (const seat of game.players) for (const offer of seat.shopCardIds) {
      const rank = game.ownershipCardPool.find((entry) => entry.card.id === offer)!.card.rank;
      expect(getCardPrice(game, seat.id, offer)).toBe(cardPrice(rank));
    }
    expect(finalStandings(game).every((row) => row.total === row.points + row.handScore + row.stackScore)).toBe(true);
    expect(() => parseClientMessage(JSON.stringify({ type: "SELECT_AUGMENT", augmentId: "win_bonus", requestId: "request-123", turnKey: "2:AUGMENT" }))).toThrow();
    expect(JSON.stringify(game)).not.toContain("augmentChoices");
  });

  it("migrates a legacy live room without changing earned resources", () => {
    const room = createRoom("LEGACY", 23);
    const player = room.game.players[0]!;
    player.points = 13;
    player.stackBB = 77;
    const owned = [...player.ownedCardIds];
    const old = structuredClone(room) as unknown as Record<string, unknown>;
    delete old.rulesRevision;
    const oldGame = old.game as Record<string, unknown>;
    oldGame.phase = "AUGMENT";
    old.status = "PLAYING";
    old.sessions = [{ playerId: "p1", tokenHash: "one", requests: [] }, { playerId: "p2", tokenHash: "two", requests: [] }];
    old.augmentChoices = { p1: [{ id: "win_bonus" }] };
    oldGame.augmentChoices = [{ id: "win_bonus" }];
    const oldPlayers = oldGame.players as Record<string, unknown>[];
    oldPlayers[0]!.augments = [{ id: "shop_plus_two" }];
    oldPlayers[0]!.shopSize = 5;
    old.readyIds = ["p1"];
    const migrated = migrateRoomSnapshot(old as unknown as typeof room);
    expect(migrated.game.phase).toBe("NEXT_ROUND");
    expect(migrated.game.players[0]).toMatchObject({ points: 13, stackBB: 77, ownedCardIds: owned, shopSize: BALANCE.baseShopSize });
    expect(migrated.readyIds).toEqual([]);
    expect(pendingBarrierIds(migrated)).toEqual(["p1", "p2"]);
    expect(migrated.barrierSince).toBeTypeOf("number");
    expect(JSON.stringify(migrated)).not.toMatch(/augmentChoices|augments/);
    expect(JSON.stringify(createPlayerView(migrated, "p1"))).not.toMatch(/augment|AUGMENT/i);
    expect(migrateRoomSnapshot(migrated)).toBe(migrated);
  });
});
