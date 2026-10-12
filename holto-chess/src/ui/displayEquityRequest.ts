import type { EquityJob, EquityValues } from "./displayEquity";

export const DISPLAY_EQUITY_TIMEOUT_MS = 8000;
export type EquityWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">;

/** Each mounted display owns its job. Cancellation also stops obsolete computation, not just its response. */
export function requestDisplayEquity(worker: EquityWorker, key: string, jobs: readonly EquityJob[], publish: (values: EquityValues) => void): () => void {
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false; clearTimeout(timeout); worker.terminate();
  };
  const finish = (values: EquityValues) => { if (!active) return; stop(); publish(values); };
  const timeout = setTimeout(() => finish(jobs.map(() => null)), DISPLAY_EQUITY_TIMEOUT_MS);
  worker.onmessage = event => {
    const data = event.data as { key: string; values: EquityValues };
    if (data?.key === key && Array.isArray(data.values) && data.values.length === jobs.length) finish(data.values);
  };
  worker.onerror = worker.onmessageerror = () => finish(jobs.map(() => null));
  try { worker.postMessage({ key, jobs }); } catch { finish(jobs.map(() => null)); }
  return stop;
}
