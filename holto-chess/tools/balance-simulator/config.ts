import { resolve } from "node:path";
import { POLICY_NAMES, type PolicyName, type SimulationConfig } from "./types";

export const DEFAULT_CONFIG: SimulationConfig = {
  simulationCount: 1_000,
  baseSeed: 12_345,
  policies: [...POLICY_NAMES],
  assignment: "fixed",
  outputPath: resolve("tools/balance-simulator/output"),
  verbose: false,
  maxRerollsPerPlayerRound: 1,
};

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Expected a non-negative integer, received: ${value}`);
  return parsed;
}

export function parseCliArgs(args: string[]): SimulationConfig {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--verbose") values.set("verbose", "true");
    else if (arg.startsWith("--")) {
      const [inlineKey, inlineValue] = arg.slice(2).split("=", 2);
      const value = inlineValue ?? args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for --${inlineKey}`);
      values.set(inlineKey, value);
    }
  }
  const policies = (values.get("policies")?.split(",") ?? DEFAULT_CONFIG.policies) as PolicyName[];
  const invalid = policies.filter((policy) => !POLICY_NAMES.includes(policy));
  if (invalid.length) throw new Error(`Unknown policies: ${invalid.join(", ")}`);
  const assignment = values.get("assignment") ?? DEFAULT_CONFIG.assignment;
  if (assignment !== "fixed" && assignment !== "random") throw new Error("--assignment must be fixed or random");
  return {
    simulationCount: integer(values.get("games"), DEFAULT_CONFIG.simulationCount),
    baseSeed: integer(values.get("seed"), DEFAULT_CONFIG.baseSeed),
    policies,
    assignment,
    outputPath: resolve(values.get("output") ?? DEFAULT_CONFIG.outputPath),
    verbose: values.get("verbose") === "true",
    maxRerollsPerPlayerRound: integer(values.get("rerolls"), DEFAULT_CONFIG.maxRerollsPerPlayerRound),
  };
}
