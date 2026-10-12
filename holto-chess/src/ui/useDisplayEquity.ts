import { useEffect, useState } from "react";
import type { EquityJob, EquityValues } from "./displayEquity";
import { requestDisplayEquity } from "./displayEquityRequest";

const cache = new Map<string, EquityValues>();

/** No evaluator runs during render, including SSR or Worker failure. Unknown odds never delay the cinematic. */
export function useDisplayEquity(jobs: readonly EquityJob[], displayJobs: readonly EquityJob[] = jobs): EquityValues | null {
  const key = JSON.stringify(jobs);
  const displayKey = JSON.stringify(displayJobs);
  const [result, setResult] = useState<{ key: string; values: EquityValues } | null>(null);
  useEffect(() => {
    const inputs = JSON.parse(key) as EquityJob[];
    if (!inputs.length || cache.has(key) || typeof Worker === "undefined") return;
    let worker: Worker;
    try { worker = new Worker(new URL("./displayEquity.worker.ts", import.meta.url), { type: "module" }); }
    catch { return; }
    return requestDisplayEquity(worker, key, inputs, values => {
      if (values.every(value => value !== null)) {
        if (cache.size >= 128) cache.clear();
        cache.set(key, values);
      }
      setResult({ key, values });
    });
  }, [key]);
  // Reject stale results immediately, before the next effect runs after a RUN/street change.
  return cache.get(displayKey) ?? (result?.key === displayKey ? result.values : null);
}
