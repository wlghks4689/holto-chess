// Independent PRNG, deliberately NOT the production `seededRandom` in
// showdownEquity.ts, so the reference estimate never shares bias/artifacts
// with the code under test.
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** 95% CI half-width for a Bernoulli-ish proportion (win=1/tie=0.5/loss=0), using
 * the sample variance of the per-trial outcome (not the p(1-p) binomial shortcut,
 * since ties make outcomes trinary, not binary). */
export function ci95HalfWidth(outcomes: readonly number[]): number {
  const n = outcomes.length;
  const mean = outcomes.reduce((a, b) => a + b, 0) / n;
  const variance = outcomes.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  return 1.96 * se;
}
