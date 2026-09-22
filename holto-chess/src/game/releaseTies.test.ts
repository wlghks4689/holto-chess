import { describe, expect, it, vi } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { assertPoolIntegrity, releasePlayerCards } from "./cardPool";
import { createGame, resolveSecondary } from "./engine";

// Controlled boards, not a mocked evaluator: every card is physical and disjoint from ownership.
vi.mock("./showdownDeck", async (original) => {
  const actual = await original<typeof import("./showdownDeck")>();
  let draw = 0;
  return { ...actual, drawCommunityBoards: () => {
    const ids = draw++ === 0 ? ["Ts", "Js", "Qs", "Ks", "As"] : ["2c", "3d", "4h", "8s", "9s"];
    return [ids.map((id) => makeDeck().find((card) => card.id === id)!)];
  } };
});

describe("release audit: unresolved R4 placement policy", () => {
  it("documents a three-way regulation tie collapsing distinct decider places into two second places", () => {
    const game = createGame(20260922);
    game.round = 4; game.phase = "SHOWDOWN_SECONDARY";
    game.winnerGroup = ["p1", "p2", "p3"]; game.loserGroup = ["p4", "p5", "p6"];
    for (const player of game.players) releasePlayerCards(game, player);
    const hands = [
      ["Ac", "Ad", "Ah", "Kc", "Kd"], ["Qc", "Qd", "Qh", "Jc", "Jd"], ["Tc", "Td", "Th", "9c", "9d"],
      ["2d", "2h", "2s", "3c", "3h"], ["4c", "4d", "4s", "5c", "5d"], ["6c", "6d", "6h", "7c", "7d"],
    ];
    game.players.forEach((player, index) => {
      player.eliminated = index >= 6;
      for (const id of hands[index] ?? []) {
        const entry = game.ownershipCardPool.find((candidate) => candidate.card.id === id)!;
        entry.state = "OWNED"; entry.ownerPlayerId = player.id; player.ownedCardIds.push(id);
      }
    });
    expect(assertPoolIntegrity(game)).toBe(true);
    const result = resolveSecondary(game);
    const match = result.roundResults.find((candidate) => candidate.group === "winner")!;
    expect(match.boardResults[0].map((player) => player.place)).toEqual([1, 1, 1]);
    expect(match.boardResults[1].map((player) => player.place)).toEqual([1, 2, 3]);
    // Known issue, not desired behavior: settlement discards the distinct third place.
    expect(match.results.map((player) => player.place)).toEqual([1, 2, 2]);
    expect(Object.values(match.pointAwards!)).toEqual([10, 5, 5]);
    expect(assertPoolIntegrity(result)).toBe(true);
  });
});
