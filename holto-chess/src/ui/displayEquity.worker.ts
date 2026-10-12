import { calculateDisplayEquity } from "./displayEquityCalculation";
import type { EquityJob } from "./displayEquity";

self.onmessage = (event: MessageEvent<{ key: string; jobs: EquityJob[] }>) => {
  const { key, jobs } = event.data;
  try { self.postMessage({ key, values: calculateDisplayEquity(jobs) }); }
  catch { self.postMessage({ key, values: jobs.map(() => null) }); }
};
