import { resolve } from "node:path";
import { POLICY_NAMES, type PolicyName, type SimConfig } from "./types";

export type CliOptions = { config: SimConfig; compare: boolean; jobs: number };

export const DEFAULT_CONFIG: SimConfig = {
  games: 100, seed: 12_345, policies: ["ENGINE_BOT"], assignment: "rotate", maxRerolls: 1, overrides: {},
  outputPath: resolve("tools/balance-simulator/output"), writeRows: false, verbose: false,
};

function integer(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`--${name} needs a non-negative integer, got: ${value}`);
  return n;
}

export function parseCliArgs(args: string[]): CliOptions {
  const flags = new Set(["verbose", "rows", "compare"]);
  const known = new Set([...flags, "games", "seed", "policies", "assignment", "rerolls", "set", "out", "jobs"]);
  const values = new Map<string, string[]>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const eq = arg.indexOf("=");
    const key = arg.slice(2, eq < 0 ? undefined : eq);
    if (!known.has(key)) throw new Error(`Unknown option --${key}`);
    const value = flags.has(key) ? "true" : eq >= 0 ? arg.slice(eq + 1) : args[++i];
    if (value === undefined || (!flags.has(key) && value.startsWith("--"))) throw new Error(`Missing value for --${key}`);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const one = (key: string) => values.get(key)?.at(-1);
  const policies = (one("policies")?.split(",") ?? DEFAULT_CONFIG.policies) as PolicyName[];
  const bad = policies.filter((p) => !POLICY_NAMES.includes(p));
  if (bad.length) throw new Error(`Unknown policies: ${bad.join(", ")} (choose from ${POLICY_NAMES.join(", ")})`);
  const assignment = (one("assignment") ?? DEFAULT_CONFIG.assignment) as SimConfig["assignment"];
  if (!["rotate", "fixed", "random"].includes(assignment)) throw new Error("--assignment must be rotate, fixed or random");
  const overrides: Record<string, number> = {};
  for (const item of values.get("set") ?? []) {
    const [path, raw] = item.split("=");
    if (!path || raw === undefined || raw.trim() === "" || !Number.isFinite(Number(raw))) throw new Error(`--set needs path=number, got: ${item}`);
    overrides[path] = Number(raw);
  }
  const compare = values.has("compare");
  if (compare && !Object.keys(overrides).length) throw new Error("--compare needs at least one --set override to compare against");
  return {
    compare, jobs: Math.max(1, integer("jobs", one("jobs"), 1)),
    config: {
      games: integer("games", one("games"), DEFAULT_CONFIG.games), seed: integer("seed", one("seed"), DEFAULT_CONFIG.seed),
      policies, assignment, maxRerolls: integer("rerolls", one("rerolls"), DEFAULT_CONFIG.maxRerolls), overrides,
      outputPath: resolve(one("out") ?? DEFAULT_CONFIG.outputPath), writeRows: values.has("rows"), verbose: values.has("verbose"),
    },
  };
}
