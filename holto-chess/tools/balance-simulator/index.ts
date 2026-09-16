import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCliArgs } from "./config";
import { aggregateResults } from "./metrics";
import { renderConsoleSummary, renderMarkdownReport } from "./report";
import { simulateGame } from "./simulator";
import type { FailureRecord, GameTrace, SimulationConfig, SimulationResult } from "./types";

export function runSimulation(config: SimulationConfig): SimulationResult {
  const games: GameTrace[] = []; const failures: FailureRecord[] = [];
  for (let index = 0; index < config.simulationCount; index += 1) {
    const seed = (config.baseSeed + index) >>> 0 || 1;
    try { games.push(simulateGame(config, index)); }
    catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      failures.push({ gameIndex: index, seed, message: failure.message, stack: failure.stack });
      if (config.verbose) console.error(`Game ${index + 1} (seed ${seed}) failed: ${failure.message}`);
    }
    if (config.verbose && (index + 1) % 100 === 0) console.log(`Completed ${index + 1}/${config.simulationCount}`);
  }
  return aggregateResults(config, games, failures);
}

export async function writeReports(result: SimulationResult, outputPath: string, runtimeMs?: number): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputPath, { recursive: true });
  const jsonPath = join(outputPath, "result.json"); const markdownPath = join(outputPath, "report.md");
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdownReport(result, runtimeMs), "utf8");
  return { jsonPath, markdownPath };
}

export async function main(args: string[]): Promise<void> {
  const config = parseCliArgs(args); const started = performance.now();
  const result = runSimulation(config); const runtimeMs = performance.now() - started;
  const paths = await writeReports(result, config.outputPath, runtimeMs);
  console.log(`${renderConsoleSummary(result, runtimeMs)}\nJSON: ${paths.jsonPath}\nMarkdown: ${paths.markdownPath}`);
  if (result.games.failed) process.exitCode = 1;
}
