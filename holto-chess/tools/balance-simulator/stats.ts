export const mean = (xs: readonly number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** 95% Wilson interval. Returns null for n = 0 so an empty group prints N/A, never 0%. */
export function wilson(k: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.96; const p = k / n; const d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d; const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** 95% normal-approximation half width of a mean. */
export const ci95 = (xs: readonly number[]): number => xs.length < 2 ? NaN : 1.96 * sd(xs) / Math.sqrt(xs.length);

export const pct = (k: number, n: number): string => n ? `${(100 * k / n).toFixed(1)}%` : "N/A";
export function pctCi(k: number, n: number): string {
  const w = wilson(k, n);
  return w ? `${(100 * k / n).toFixed(1)}% [${(100 * w[0]).toFixed(1)}–${(100 * w[1]).toFixed(1)}]` : "N/A";
}
export const num = (x: number, digits = 2): string => Number.isFinite(x) ? x.toFixed(digits) : "N/A";
export const numCi = (xs: readonly number[], digits = 2): string => xs.length ? `${num(mean(xs), digits)} ±${num(ci95(xs), digits)}` : "N/A";

export function groupBy<T, K extends string | number>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) { const k = key(item); const list = out.get(k); if (list) list.push(item); else out.set(k, [item]); }
  return out;
}

/** Small xorshift so policy randomness and seat dealing never touch the engine's RNG. */
export function makeRandom(seed: number): () => number {
  let x = (seed >>> 0) || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
