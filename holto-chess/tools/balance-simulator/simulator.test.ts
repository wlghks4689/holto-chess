import { describe, expect, it } from "vitest";
import { cardPrice, BALANCE } from "../../src/game/config";
import { summarize } from "./aggregate";
import { DEFAULT_CONFIG, parseCliArgs } from "./config";
import { playGame } from "./driver";
import { applyOverrides } from "./overrides";
import { POLICY_NAMES, type SimConfig } from "./types";

const config = (patch: Partial<SimConfig> = {}): SimConfig => ({ ...DEFAULT_CONFIG, games: 4, seed: 777, ...patch });
const strip = (o: ReturnType<typeof playGame>) => JSON.stringify({ ...o, game: { ...o.game, ms: 0 } });

describe("balance simulator", () => {
  it("plays every phase of a full game for all heuristic policies and mixes them with the engine bot", () => {
    const cfg = config({ policies: [...POLICY_NAMES] });
    for (let game = 0; game < 3; game += 1) {
      const outcome = playGame(cfg, game);
      expect(outcome.game.error).toBeUndefined();
      expect(outcome.game.aliveAfter).toEqual([8, 8, 6, 4, 4]);
      expect(outcome.game.matchStats.map((m) => m.round)).toEqual([1, 2, 3, 4, 5]);
      expect(outcome.players.map((p) => p.placement).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const p of outcome.players) {
        expect(p.total).toBe(p.points + p.handScore + p.stackScore);
        expect(p.rounds[0]!.entered && p.rounds[1]!.entered).toBe(true);
        expect(p.rounds[4]!.entered).toBe(p.placement <= 4);
      }
    }
  });

  it("is reproducible for the same seed and config, and differs across seeds", () => {
    const cfg = config({ policies: ["HIGH_RANK", "PAIR_BUILDER", "RANDOM"] });
    expect(strip(playGame(cfg, 1))).toBe(strip(playGame(cfg, 1)));
    expect(strip(playGame(cfg, 1))).not.toBe(strip(playGame(cfg, 2)));
  });

  it("drives the engine's own bot brain through a complete game", () => {
    const outcome = playGame(config({ policies: ["ENGINE_BOT"] }), 0);
    expect(outcome.game.error).toBeUndefined();
    expect(outcome.players).toHaveLength(8);
    expect(outcome.players.every((p) => p.policy === "ENGINE_BOT")).toBe(true);
  });

  it("aggregates only completed games and reports empty groups as absent, not zero", () => {
    const cfg = config({ policies: ["HIGH_RANK", "ECONOMY"] });
    const outcomes = [0, 1, 2].map((g) => playGame(cfg, g));
    const failed = { game: { game: 3, seed: 780, ok: false, error: "boom", failedAt: "R2 OPEN_DRAFT", aliveAfter: [], matchStats: [], ms: 0 }, players: [] };
    const summary = summarize(cfg, [...outcomes, failed].map((o) => o.game), [...outcomes, failed].flatMap((o) => o.players));
    expect(summary.games).toMatchObject({ requested: 4, completed: 3, failed: 1 });
    expect(summary.games.failures[0]).toMatchObject({ message: "boom", count: 1 });
    expect(summary.policies.reduce((a, p) => a + p.n, 0)).toBe(24);
    expect(summary.r1Groups.every((g) => g.n > 0)).toBe(true);
  });

  describe("overrides", () => {
    it("applies only inside the run and restores the original constants", () => {
      const before = cardPrice(2);
      const restore = applyOverrides({ "rankPrices.2": before + 3, "rerollCostBB": 9 });
      expect(cardPrice(2)).toBe(before + 3);
      expect(BALANCE.rerollCostBB).toBe(9);
      restore();
      expect(cardPrice(2)).toBe(before);
      expect(BALANCE.rerollCostBB).toBe(5);
    });

    it("changes game outcomes, rejects unknown paths, and leaves state clean after a bad path", () => {
      expect(() => applyOverrides({ "rankPrices.99": 1 })).toThrow(/Cannot override/);
      expect(() => applyOverrides({ "nope.deep": 1 })).toThrow(/Cannot override/);
      const cfg = config({ policies: ["HIGH_RANK"] });
      const base = playGame(cfg, 0);
      const restore = applyOverrides({ "rankPrices.14": 1 });
      const changed = playGame(cfg, 0);
      restore();
      expect(strip(base)).not.toBe(strip(changed));
      expect(strip(playGame(cfg, 0))).toBe(strip(base));
    });
  });

  describe("cli", () => {
    it("parses options and validates input", () => {
      const parsed = parseCliArgs(["--games", "5", "--policies", "HIGH_RANK,ECONOMY", "--set", "rankPrices.2=4", "--set=points.r1.win=5", "--compare", "--jobs", "3"]);
      expect(parsed).toMatchObject({ compare: true, jobs: 3, config: { games: 5, policies: ["HIGH_RANK", "ECONOMY"], overrides: { "rankPrices.2": 4, "points.r1.win": 5 } } });
      expect(() => parseCliArgs(["--policies", "NOPE"])).toThrow(/Unknown policies/);
      expect(() => parseCliArgs(["--games", "-1"])).toThrow(/non-negative/);
      expect(() => parseCliArgs(["--bogus", "1"])).toThrow(/Unknown option/);
      expect(() => parseCliArgs(["--compare"])).toThrow(/--set/);
      expect(() => parseCliArgs(["--set", "rankPrices.2"])).toThrow(/path=number/);
    });
  });
});
