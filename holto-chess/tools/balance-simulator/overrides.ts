import { BALANCE, FINAL_ROUND_PLACEMENT_POINTS } from "../../src/game/config";

/**
 * Temporarily rewrites numeric balance constants for an experiment and returns the undo.
 * `rankPrices.2=5` edits BALANCE.rankPrices[2]; `final.1=25` edits FINAL_ROUND_PLACEMENT_POINTS[1].
 * Only constants the engine reads at call time can be experimented on; values it hard-codes are not reachable here.
 */
export function applyOverrides(overrides: Readonly<Record<string, number>>): () => void {
  const undo: (() => void)[] = [];
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split(".");
    const isFinal = keys[0] === "final";
    const walk = isFinal ? keys.slice(1) : keys;
    let holder = (isFinal ? FINAL_ROUND_PLACEMENT_POINTS : BALANCE) as unknown as Record<string, unknown>;
    for (const key of walk.slice(0, -1)) holder = holder?.[key] as Record<string, unknown>;
    const leaf = walk[walk.length - 1]!;
    if (!holder || typeof holder[leaf] !== "number") throw new Error(`Cannot override "${path}": not an existing numeric balance constant`);
    const previous = holder[leaf];
    holder[leaf] = value;
    undo.push(() => { holder[leaf] = previous; });
  }
  return () => undo.reverse().forEach((fn) => fn());
}
