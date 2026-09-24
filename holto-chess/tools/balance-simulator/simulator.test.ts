import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGame } from "../../src/game/engine";
import { DEFAULT_CONFIG } from "./config";
import { assertSimulationInvariants } from "./invariants";
import { runSimulation, writeReports } from "./index";
import { simulateGame } from "./simulator";
import type { SimulationConfig } from "./types";

const temporaryDirectories: string[] = [];
afterEach(async () => { while (temporaryDirectories.length) await rm(temporaryDirectories.pop()!, { recursive: true, force: true }); });

const config = (overrides: Partial<SimulationConfig> = {}): SimulationConfig => ({
  ...DEFAULT_CONFIG, simulationCount: 3, maxRerollsPerPlayerRound: 0, ...overrides,
});

describe("balance simulator", () => {
  it("reproduces identical results for the same seed and config", () => {
    expect(runSimulation(config({ baseSeed: 8080 }))).toEqual(runSimulation(config({ baseSeed: 8080 })));
  });

  it("allows different seeds to produce different game traces", () => {
    const first = simulateGame(config({ baseSeed: 100 }), 0);
    const second = simulateGame(config({ baseSeed: 101 }), 0);
    expect(first.seed).not.toBe(second.seed);
    expect(first.rankCounters).not.toEqual(second.rankCounters);
  });

  it("aggregates four R5 hands per completed game", () => {
    const result = runSimulation(config({ simulationCount: 5 }));
    expect(result.games).toMatchObject({ completed: 5, failed: 0 });
    expect(Object.values(result.rounds[5].hands).reduce((total, hand) => total + hand.count, 0)).toBe(20);
    expect(result.rounds[5].survived).toBe(4);
    expect(result.players.p1).toMatchObject({ games: 5 });
    expect(Object.values(result.policies).reduce((total, policy) => total + policy.entries * policy.r5Rate / 100, 0)).toBe(4 * 5);
    expect(Object.values(result.policies).reduce((total, policy) => total + policy.tournament.r2Eliminations, 0)).toBe(0);
    expect(Object.values(result.policies).reduce((total, policy) => total + policy.tournament.r4Eliminations, 0)).toBe(10);
  });

  it("validates sudden-death boards against their actual tied participants", () => {
    expect(() => simulateGame(config({ baseSeed: 12_480, simulationCount: 1, maxRerollsPerPlayerRound: 1 }), 0)).not.toThrow();
  });

  it("keeps final ranks within finalStandings and ignores draft-phase shop snapshots", () => {
    const trace = simulateGame(config({ baseSeed: 12_481, maxRerollsPerPlayerRound: 1 }), 0);
    expect(trace.players.map((player) => player.finalRank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(trace.poolSnapshots.every((snapshot) => snapshot.shopFillFailures === 0)).toBe(true);
  });

  it("detects duplicate ownership ledger corruption", () => {
    const state = createGame(42);
    state.players[1]!.ownedCardIds.push(state.players[0]!.ownedCardIds[0]!);
    expect(() => assertSimulationInvariants(state)).toThrow(/more than one player|assigned more than once/);
  });

  it("generates parseable JSON and a Markdown report", async () => {
    const output = await mkdtemp(join(tmpdir(), "porena-balance-")); temporaryDirectories.push(output);
    const result = runSimulation(config({ simulationCount: 1 }));
    const paths = await writeReports(result, output, 12.5);
    expect(JSON.parse(await readFile(paths.jsonPath, "utf8"))).toEqual(result);
    expect(await readFile(paths.markdownPath, "utf8")).toContain("# PORENA Balance Simulation Report");
  });
});
