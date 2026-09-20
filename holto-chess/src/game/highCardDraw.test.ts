import { describe, expect, it, vi } from "vitest";
import { createGame as createGameCurrent, resolveSecondary } from "./engine";
import { createMatchView } from "./matchView";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShowdownCinematic } from "../ui/ShowdownCinematic";

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

describe("bounded high-card decider", () => {
  it("bounds R2 run-it-twice to four boards and reproduces a persisted seeded result", () => {
    const game = createGame(404);
    game.round = 2; game.phase = "SHOWDOWN_SECONDARY";
    for (const player of game.players) player.selectedCardIds = [...player.ownedCardIds];
    game.winnerGroup = ["p1", "p2", "p3", "p4"];
    game.loserGroup = ["p5", "p6", "p7", "p8"];
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
