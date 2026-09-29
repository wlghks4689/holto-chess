// Usage: node tools/balance-simulator/abilityAnalysis.mjs <players.jsonl> [<out.md>] [<out.json>]
// Per-ability outcome table from a `--abilities --rows` run. Nothing here is estimated: every number is a count over
// simulated players, with a Wilson interval and a z-test against the no-edge expectation.
import { readFileSync, writeFileSync } from "node:fs";

const [input, outMd, outJson] = process.argv.slice(2);
if (!input) throw new Error("players.jsonl path required");
const rows = readFileSync(input, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.ability);
const games = new Set(rows.map((r) => r.game)).size;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const ci = (xs) => 1.96 * sd(xs) / Math.sqrt(xs.length);
function wilson(k, n) { const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [c - h, c + h]; }
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
// Two-sided normal p-value.
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const pNormal = (z) => 1 - erf(Math.abs(z) / Math.SQRT2);
// Chi-square survival via regularised upper incomplete gamma.
function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) { let sum = 1 / a, term = sum; for (let n = 1; n < 500; n += 1) { term *= x / (a + n); sum += term; if (Math.abs(term) < 1e-14) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i += 1) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
function lgamma(z) { const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; z -= 1; let x = p[0]; for (let i = 1; i < g + 2; i += 1) x += p[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }

const WIN = 1 / 8, FINAL = 4 / 8;
const byAbility = new Map();
for (const r of rows) { if (!byAbility.has(r.ability)) byAbility.set(r.ability, []); byAbility.get(r.ability).push(r); }

const stats = [...byAbility].map(([ability, list]) => {
  const n = list.length, wins = list.filter((r) => r.placement === 1).length, fin = list.filter((r) => r.rounds[4].entered);
  const [lo, hi] = wilson(wins, n); const p = wins / n;
  const z = (p - WIN) / Math.sqrt(WIN * (1 - WIN) / n);
  const finWins = fin.filter((r) => r.placement === 1).length;
  return {
    ability, n, wins, win: p, winLo: lo, winHi: hi, z, pValue: pNormal(z),
    reachR5: fin.length / n, winGivenR5: fin.length ? finWins / fin.length : NaN,
    place: mean(list.map((r) => r.placement)), placeCi: ci(list.map((r) => r.placement)),
    top4: fin.length / n,
    total: fin.length ? mean(fin.map((r) => r.total)) : NaN,
    survR3: list.filter((r) => r.rounds[3].entered).length / n,
    acts: mean(list.map((r) => r.abilityActs)), bb: mean(list.map((r) => r.abilityBB)), pts: mean(list.map((r) => r.abilityPoints)),
    payoutP: mean(list.map((r) => r.abilityBB / 10 + r.abilityPoints)),
    finalBB: mean(list.map((r) => r.finalBB)),
  };
}).sort((a, b) => b.win - a.win);

const N = stats.reduce((a, s) => a + s.n, 0), K = stats.reduce((a, s) => a + s.wins, 0), pooled = K / N;
const chi = stats.reduce((a, s) => a + (s.wins - s.n * pooled) ** 2 / (s.n * pooled) + ((s.n - s.wins) - s.n * (1 - pooled)) ** 2 / (s.n * (1 - pooled)), 0);
const chiP = gammaQ((stats.length - 1) / 2, chi / 2);
const top = stats[0], rest = stats.slice(1); const restN = rest.reduce((a, s) => a + s.n, 0), restK = rest.reduce((a, s) => a + s.wins, 0);
const pp = (top.wins + restK) / (top.n + restN); const zTop = (top.win - restK / restN) / Math.sqrt(pp * (1 - pp) * (1 / top.n + 1 / restN));
const bonferroniZ = 2.807; // two-sided alpha 0.05 over 10 abilities

const lines = [];
lines.push(`# 어빌리티별 승률 (게임 ${games}판, 플레이어 ${rows.length}명${process.env.POLICY ? `, 정책 ${process.env.POLICY}` : ""})`, "");
lines.push(`- 승리 = 최종 1위. 어빌리티 효과가 없다면 좌석당 기대 승률은 12.5% (8명 중 1위), R5 진출률은 50%, 평균 순위는 4.5.`);
lines.push(`- 매 게임 10개 중 8개가 무작위로 배정되고 좌석도 무작위라 특정 어빌리티가 유리한 좌석·뽑기 순서를 갖지 않습니다.`, "");
lines.push("| 어빌리티 | n | 승률 [95% CI] | z vs 12.5% | R5 진출 | R5 진출 시 승률 | 평균 순위 | R5 진출자 평균 점수 | 발동/판 | 어빌리티 BB | 어빌리티 P | 환산 P |");
lines.push("|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const s of stats) lines.push(`| ${s.ability} | ${s.n} | ${pct(s.win)} [${pct(s.winLo)}–${pct(s.winHi)}] | ${s.z.toFixed(2)} | ${pct(s.reachR5)} | ${pct(s.winGivenR5)} | ${s.place.toFixed(2)} ±${s.placeCi.toFixed(2)} | ${s.total.toFixed(1)} | ${s.acts.toFixed(2)} | ${s.bb.toFixed(1)} | ${s.pts.toFixed(2)} | ${s.payoutP.toFixed(2)} |`);
lines.push("", "## 검정");
lines.push(`- 10개 어빌리티 승률이 모두 같다는 가설 (카이제곱, df=${stats.length - 1}): χ²=${chi.toFixed(2)}, p=${chiP.toFixed(4)}`);
lines.push(`- 최고 승률 ${top.ability} ${pct(top.win)} vs 나머지 합산 ${pct(restK / restN)}: z=${zTop.toFixed(2)}, p=${pNormal(zTop).toFixed(4)}`);
lines.push(`- 승률과 12.5%의 차이가 다중비교 보정(|z|≥${bonferroniZ})을 넘는 어빌리티: ${stats.filter((s) => Math.abs(s.z) >= bonferroniZ).map((s) => `${s.ability}(${s.z.toFixed(2)})`).join(", ") || "없음"}`);
lines.push(`- 최고와 최저 승률 격차: ${pct(top.win - stats.at(-1).win)}p (${top.ability} ${pct(top.win)} / ${stats.at(-1).ability} ${pct(stats.at(-1).win)})`);
const md = `${lines.join("\n")}\n`;
console.log(md);
if (outMd) writeFileSync(outMd, md, "utf8");
if (outJson) writeFileSync(outJson, `${JSON.stringify({ games, players: rows.length, chi, chiP, zTop, stats }, null, 2)}\n`, "utf8");
