import { describe, expect, it, vi } from "vitest";
import { createGame as createGameCurrent, resolvePrimary, resolveSecondary } from "./engine";
import { createMatchView } from "./matchView";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShowdownCinematic } from "../ui/ShowdownCinematic";
import { assertPoolIntegrity, releasePlayerCards } from "./cardPool";
import { BALANCE } from "./config";

// A royal board forces every player to share the best five, exercising the cap.
vi.mock("./showdownDeck", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./showdownDeck")>();
  return { ...actual, drawCommunityBoards: (_deck: unknown, count: number) =>
    Array.from({ length: count }, () => [10, 11, 12, 13, 14].map((rank) => ({
      id: ({ 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] + "s", rank, suit: "s",
    }))) };
});

// Regression coverage for persisted games created before the open-draft rules.
function createGame(...args: Parameters<typeof createGameCurrent>) { return createGameCurrent(args[0], args[1], 1); }

function fillLegalHands(game: ReturnType<typeof createGameCurrent>) {
  for (const player of game.players) releasePlayerCards(game, player);
  for (const player of game.players.filter((p) => !p.eliminated)) {
    // The old fixture left one R1 card in later rounds. That now correctly forfeits;
    // give this tie test complete hands disjoint from its forced royal board.
    const entries = game.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE" && !(entry.card.suit === "s" && entry.card.rank >= 10));
    for (const entry of entries.slice(0, BALANCE.handLimits[game.round])) {
      entry.state = "OWNED"; entry.ownerPlayerId = player.id; player.ownedCardIds.push(entry.card.id);
    }
    player.selectedCardIds = player.ownedCardIds.slice(0, 2);
  }
  expect(assertPoolIntegrity(game)).toBe(true);
}

describe("bounded high-card decider", () => {
  it("awards both R4 regulation split players 3P but sends only the decider winner to Winner Group", () => {
    const game = createGame(2026);
    game.round = 4; game.phase = "SHOWDOWN_PRIMARY";
    game.players.slice(6).forEach((player) => { player.eliminated = true; });
    fillLegalHands(game);

    const result = resolvePrimary(game);

    expect(result.roundResults).toHaveLength(3);
    for (const match of result.roundResults) {
      expect(match.regulationWinnerIds).toHaveLength(2);
      expect(match.regulationWinnerIds!.map((id) => match.pointAwards![id])).toEqual([3, 3]);
      expect(match.winnerIds).toHaveLength(1);
      expect(match.highCardDraw?.winnerId).toBe(match.winnerIds[0]);
    }
    expect(result.winnerGroup).toHaveLength(3);
    expect(result.loserGroup).toHaveLength(3);
  });

  it("bounds R2 run-it-twice to four boards and reproduces a persisted seeded result", () => {
    const game = createGame(404);
    game.round = 2; game.phase = "SHOWDOWN_SECONDARY";
    game.winnerGroup = ["p1", "p2", "p3", "p4"];
    game.loserGroup = ["p5", "p6", "p7", "p8"];
    fillLegalHands(game);
    const result = resolveSecondary(game);
    expect(resolveSecondary(game)).toEqual(result);
    for (const match of result.roundResults) {
      expect(match.boards).toHaveLength(4);
      expect(match.suddenDeathCount).toBe(2);
      expect(match.highCardDraw!.draws).toHaveLength(2);
      expect(match.winnerIds).toHaveLength(1);
    }
    expect(result.players.filter((p) => p.eliminated)).toHaveLength(2);
  });
  it("ends forced ties after two boards, eliminates exactly three and presents the warning before ranks", () => {
    const game = createGame(303);
    game.round = 4; game.phase = "SHOWDOWN_SECONDARY";
    fillLegalHands(game);
    game.winnerGroup = ["p1", "p2", "p3", "p4"];
    game.loserGroup = ["p5", "p6", "p7", "p8"];
    const result = resolveSecondary(game);
    const match = result.roundResults.find((m) => m.group === "loser")!;
    expect(match.suddenDeathCount).toBe(2);
    expect(match.boards).toHaveLength(3);
    expect(match.winnerIds).toHaveLength(1);
    expect(new Set(match.highCardDraw!.draws.map((d) => d.rank)).size).toBe(4);
    expect(result.players.filter((p) => p.eliminated)).toHaveLength(3);
    const winner = match.highCardDraw!.draws.find((d) => d.playerId === match.winnerIds[0])!;
    expect(winner.rank).toBe(Math.max(...match.highCardDraw!.draws.map((d) => d.rank)));
    const view = createMatchView(result, match);
    const frames = cinematicTimeline(view);
    const notice = frames.find((f) => f.phase === "HIGH_CARD_NOTICE")!;
    const draw = frames.find((f) => f.phase === "HIGH_CARD_DRAW")!;
    expect(draw.at - notice.at).toBe(6500);
    const html = renderToStaticMarkup(createElement(ShowdownCinematic, {
      match: view, profiles: [], viewerId: "p5", elapsedMs: notice.at, onComplete: () => {},
    }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("나머지 플레이어는 탈락합니다.");
    expect(html).not.toContain('aria-label="하이카드 드로우 결과"');
  });
});
