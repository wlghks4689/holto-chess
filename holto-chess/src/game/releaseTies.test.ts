import { describe, expect, it, vi } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { assertPoolIntegrity, releasePlayerCards } from "./cardPool";
import { createGame, resolveSecondary } from "./engine";
import { drawCommunityBoards } from "./showdownDeck";

// Controlled boards, not a mocked evaluator: every card is physical and disjoint from ownership.
vi.mock("./showdownDeck", async (original) => {
  const actual = await original<typeof import("./showdownDeck")>();
  return { ...actual, drawCommunityBoards: vi.fn() };
});

describe("release audit: approved R4 tied runner-up policy", () => {
  it.each(["decider", "regulation", "fallback", "distinct"] as const)("settles approved runner-up points: %s", (scenario) => {
    let draw = 0;
    vi.mocked(drawCommunityBoards).mockImplementation(() => {
      const royal = scenario === "fallback" || scenario === "decider" && draw === 0;
      draw++;
      const ids = royal ? ["Ts", "Js", "Qs", "Ks", "As"] : ["2c", "3d", "4h", "8s", "9s"];
      return [ids.map((id) => makeDeck().find((card) => card.id === id)!)];
    });
    const game = createGame(20260922);
    game.round = 4; game.phase = "SHOWDOWN_SECONDARY";
    game.winnerGroup = ["p1", "p2", "p3"]; game.loserGroup = ["p4", "p5", "p6"];
    for (const player of game.players) releasePlayerCards(game, player);
    const hands = [
      ["Ac", "Ad", "Ah", "Kc", "Kd"], ["Qc", "Qd", "Qh", "Jc", "Jd"], ["Tc", "Td", "Th", "9c", "9d"],
      ["2d", "2h", "2s", "3c", "3h"], ["4c", "4d", "4s", "5c", "5d"], ["6c", "6d", "6h", "7c", "7d"],
    ];
    if (scenario === "regulation") {
      hands[0] = ["Ac", "Ad", "Ah", "7c", "7d"];
      hands[1] = ["Kc", "Kd", "Qh", "Jc", "9d"];
      hands[2] = ["Kh", "Ks", "Qd", "Jh", "9h"];
      hands[5] = ["6c", "6d", "6h", "Tc", "Td"];
    }
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
    if (scenario === "decider") {
      expect(match.boardResults[0].map((player) => player.place)).toEqual([1, 1, 1]);
      expect(match.boardResults[1].map((player) => player.place)).toEqual([1, 2, 3]);
    }
    // Approved policy: the decider determines first; both other regulation leaders share second.
    const placements = match.results.map((player) => player.place).sort();
    expect(placements).toEqual(scenario === "distinct" ? [1, 2, 3] : [1, 2, 2]);
    const awards = scenario === "distinct" ? [3, 5, 10] : [3, 3, 10];
    expect(Object.values(match.pointAwards!).sort((a, b) => a - b)).toEqual(awards);
    expect(result.players.slice(0, 3).map((player) => player.points).sort((a, b) => a - b)).toEqual(awards);
    if (scenario !== "distinct") for (const runnerUp of match.results.filter((r) => r.place === 2)) {
      expect(match.pointAwardDetails![runnerUp.playerId]).toContain("공동 2위 · +3P");
    }
    expect(match.rewards!.map((reward) => reward.deltaPoints).sort((a, b) => a - b)).toEqual(awards);
    if (scenario === "fallback") expect(match.highCardDraw).toBeDefined();
    expect(assertPoolIntegrity(result)).toBe(true);
  });
});
