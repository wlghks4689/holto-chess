import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { assertPoolIntegrity, releasePlayerCards } from "./cardPool";
import { createGame, prepareShowdown, rerollShop, resolveSurvival, toggleShopLock } from "./engine";
import { drawCommunityBoards } from "./showdownDeck";

vi.mock("./showdownDeck", async (original) => {
  const actual = await original<typeof import("./showdownDeck")>();
  return { ...actual, drawCommunityBoards: vi.fn() };
});

const cards = (ids: string[]) => ids.map((id) => makeDeck().find((card) => card.id === id)!);

describe("independent release audit remediations", () => {
  beforeEach(() => vi.mocked(drawCommunityBoards).mockReset());

  it("clears AI-purchased locked cards while preserving the remaining shop reservation", () => {
    let game = createGame(20260923);
    game = rerollShop(game, "p1");
    const lockedIds = [...game.players[0]!.shopCardIds];
    for (const cardId of lockedIds) game = toggleShopLock(game, "p1", cardId);

    const prepared = prepareShowdown(game, []);
    const player = prepared.players[0]!;

    expect(prepared.phase).toBe("SHOWDOWN_PRIMARY");
    expect(player.ownedCardIds.some((id) => lockedIds.includes(id))).toBe(true);
    expect((player.lockedShopCardIds ?? []).every((id) => player.shopCardIds.includes(id))).toBe(true);
    expect((player.lockedShopCardIds ?? []).every((id) => !player.ownedCardIds.includes(id))).toBe(true);
    expect(assertPoolIntegrity(prepared)).toBe(true);
  });

  it("summarizes a survival rematch with each player's latest deciding hand", () => {
    const game = createGame(77);
    game.round = 3; game.phase = "SURVIVAL_READY"; game.survival = { playerIds: ["p1", "p2"], eliminateCount: 1 };
    for (const player of game.players) { releasePlayerCards(game, player); player.eliminated = !["p1", "p2"].includes(player.id); }
    const hands = { p1: ["As", "Ks", "2c", "3d"], p2: ["Ah", "Kh", "4c", "6d"] };
    for (const [playerId, ids] of Object.entries(hands)) {
      const player = game.players.find((candidate) => candidate.id === playerId)!;
      for (const id of ids) {
        const entry = game.ownershipCardPool.find((candidate) => candidate.card.id === id)!;
        entry.state = "OWNED"; entry.ownerPlayerId = player.id; player.ownedCardIds.push(id);
      }
    }
    vi.mocked(drawCommunityBoards)
      .mockReturnValueOnce([cards(["Qc", "Jd", "Ts", "8s", "7h"])])
      .mockReturnValueOnce([cards(["2h", "2d", "3c", "Qh", "9s"])]);

    const resolved = resolveSurvival(game);
    const match = resolved.roundResults[0]!;
    expect(match.boardResults).toHaveLength(2);
    expect(match.results.find((result) => result.playerId === "p1")?.hand.category).toBe("FULL_HOUSE");
    expect(match.results.find((result) => result.playerId === "p2")?.hand.category).toBe("PAIR");
    expect(match.results.find((result) => result.playerId === "p1")?.place).toBe(1);
    expect(match.results.find((result) => result.playerId === "p2")?.place).toBe(2);
    expect(assertPoolIntegrity(resolved)).toBe(true);
  });
});
