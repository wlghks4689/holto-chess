import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { summarize, type Summary } from "./aggregate";
import { parseCliArgs } from "./config";
import { playGame } from "./driver";
import { applyOverrides } from "./overrides";
import { renderComparison, renderConsole, renderReport } from "./report";
import type { GameOutcome, SimConfig } from "./types";

/** Plays the given game indices in this thread with the config's overrides applied. */
export function runShard(config: SimConfig, indices: readonly number[]): GameOutcome[] {
  const restore = applyOverrides(config.overrides);
  try {
    return indices.map((game) => {
      const outcome = playGame(config, game);
      if (config.verbose) console.log(`game ${game} seed ${outcome.game.seed}: ${outcome.game.ok ? "ok" : `FAILED ${outcome.game.failedAt} ${outcome.game.error}`}`);
      return outcome;
    });
  } finally { restore(); }
}

async function runAll(config: SimConfig, jobs: number, root: string): Promise<GameOutcome[]> {
  const indices = Array.from({ length: config.games }, (_, i) => i);
  const width = Math.min(jobs, config.games);
  if (width <= 1) return runShard(config, indices);
  const workerUrl = pathToFileURL(join(root, "tools/balance-simulator/worker.mjs"));
  const parts = await Promise.all(Array.from({ length: width }, (_, j) => new Promise<GameOutcome[]>((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData: { config, shard: indices.filter((i) => i % width === j), root } });
    worker.once("message", resolve); worker.once("error", reject);
  })));
  return parts.flat().sort((a, b) => a.game.game - b.game.game);
}

/** Card prices in the summary must be read under the same overrides the games ran with. */
export function summarizeRun(config: SimConfig, outcomes: readonly GameOutcome[]): Summary {
  const restore = applyOverrides(config.overrides);
  try { return summarize(config, outcomes.map((o) => o.game), outcomes.flatMap((o) => o.players)); } finally { restore(); }
}

async function writeRows(config: SimConfig, outcomes: readonly GameOutcome[]): Promise<void> {
  await mkdir(config.outputPath, { recursive: true });
  const lines = (rows: readonly unknown[]) => `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  await writeFile(join(config.outputPath, "players.jsonl"), lines(outcomes.flatMap((o) => o.players)), "utf8");
  await writeFile(join(config.outputPath, "games.jsonl"), lines(outcomes.map((o) => o.game)), "utf8");
}

export async function main(args: string[]): Promise<void> {
  const { config, compare, jobs } = parseCliArgs(args); const root = process.cwd();
  const started = performance.now();
  const outcomes = await runAll(config, jobs, root);
  if (config.writeRows) await writeRows(config, outcomes);
  const summary = summarizeRun(config, outcomes);
  const runtimeMs = performance.now() - started;
  await mkdir(config.outputPath, { recursive: true });
  await writeFile(join(config.outputPath, "result.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(config.outputPath, "report.md"), renderReport(summary, runtimeMs), "utf8");
  console.log(renderConsole(summary, runtimeMs));
  if (compare) {
    const baseConfig = { ...config, overrides: {} };
    const base = summarizeRun(baseConfig, await runAll(baseConfig, jobs, root));
    await writeFile(join(config.outputPath, "baseline.json"), `${JSON.stringify(base, null, 2)}\n`, "utf8");
    await writeFile(join(config.outputPath, "compare.md"), renderComparison(base, summary), "utf8");
    console.log(`Comparison: ${join(config.outputPath, "compare.md")}`);
  }
  console.log(`Report: ${join(config.outputPath, "report.md")}`);
  if (summary.games.failed) process.exitCode = 1;
}
