import type { Summary } from "./aggregate";
import { mean, num, numCi, pct, pctCi, sd } from "./stats";

const CATEGORIES = ["HIGH_CARD", "PAIR", "TWO_PAIR", "TRIPS", "STRAIGHT", "FLUSH", "FULL_HOUSE", "QUADS", "STRAIGHT_FLUSH", "ROYAL_FLUSH"];
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
const dist = (counts: Record<string, number>) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return CATEGORIES.map((c) => pct(counts[c] ?? 0, total));
};

export function renderReport(s: Summary, runtimeMs?: number): string {
  const out: string[] = [];
  const cfg = s.config;
  out.push("# PORENA Balance Simulation Report", "",
    `- 게임: 요청 ${s.games.requested} · 완주 ${s.games.completed} · 실패 ${s.games.failed}${runtimeMs ? ` · ${(runtimeMs / 1000).toFixed(1)}s (${num(s.perf.msPerGame, 0)}ms/game)` : ""}`,
    `- seed ${cfg.seed}..${cfg.seed + cfg.games - 1} · 정책 ${cfg.policies.join(", ")} (${cfg.assignment}) · 리롤 상한 ${cfg.maxRerolls}`,
    `- 규칙 override: ${Object.keys(cfg.overrides).length ? JSON.stringify(cfg.overrides) : "없음(현행 코드 그대로)"}`,
    "- 모든 표의 분모는 **완주한 게임의 실제 플레이어 기록**입니다. 실패 게임은 어떤 수치에도 0으로 섞지 않습니다.", "");
  if (s.games.failures.length) {
    out.push("## 실패 게임", "", table(["횟수", "위치", "메시지", "첫 seed"], s.games.failures.map((f) => [f.count, f.at, f.message, f.firstSeed])), "");
  }
  if (!s.games.completed) return `${out.join("\n")}\n완주한 게임이 없어 지표를 만들지 못했습니다.\n`;

  out.push("## 1. 정책별 결과 (최종 순위 1이 최고)", "",
    table(["정책", "n", "평균 순위 ±95%", "우승률 [95% CI]", "R5 진출률 [95% CI]", "결승자 평균 총점", "평균 종료 BB"],
      s.policies.map((p) => [p.policy, p.n, numCi(p.placement), pctCi(p.win.k, p.win.n), pctCi(p.reachR5.k, p.reachR5.n), num(mean(p.total), 1), num(mean(p.finalBB), 0)])),
    "", "기대값: 평균 순위 4.5, 우승률 12.5%, R5 진출률 50%. 정책이 하나뿐이면 이 표는 모두 기준선 근처여야 합니다.", "",
    "## 2. 좌석 편향 점검", "",
    table(["좌석", "n", "평균 순위 ±95%", "우승률", "R5 진출률"],
      s.seats.map((x) => [`p${x.seat}`, x.n, numCi(x.placement), pct(x.win.k, x.win.n), pct(x.reachR5.k, x.reachR5.n)])), "",
    "## 3. 라운드 생존", "",
    table(["라운드", "게임당 평균 진입 인원", "다음 라운드 진출 비율"], s.survival.map((r) => [`R${r.round}`, num(r.entered, 2), r.round === 5 ? "—" : `${(100 * r.survivedPct).toFixed(1)}%`])), "",
    "## 4. R1 전적별 결과", "",
    table(["R1 전적", "n", "R3 이후 생존(R4 진입)", "R5 진출", "우승", "평균 순위 ±95%"],
      s.r1Groups.map((g) => [g.record, g.n, pctCi(g.reachR3Survive.k, g.reachR3Survive.n), pctCi(g.reachR5.k, g.reachR5.n), pctCi(g.win.k, g.win.n), numCi(g.placement)])), "",
    "관측되지 않은 전적은 표에 나타나지 않습니다(0%로 기록하지 않음).", "",
    "## 5. R1 Points 순위별 결과", "",
    table(["R1 순위", "n", "R5 진출", "우승", "평균 순위 ±95%"], s.r1Ranks.map((g) => [g.rank, g.n, pctCi(g.reachR5.k, g.reachR5.n), pctCi(g.win.k, g.win.n), numCi(g.placement)])), "",
    "## 6. 드래프트 순번별 결과 (R2 8장 · R4 16장 공개 풀)", "",
    table(["라운드", "순번", "n", "선택 rank", "선택 가격", "미선택(BB 부족)", "R5 진출", "평균 최종 순위"],
      s.draft.map((d) => [`R${d.round}`, d.order, d.n, num(mean(d.pickRank), 1), num(mean(d.pickPrice), 1), pct(d.skipped.k, d.skipped.n), pct(d.reachR5.k, d.reachR5.n), numCi(d.placement)])), "",
    "## 7. 카드 rank별 구매 (전 라운드)", "",
    table(["rank", "가격", "상점 구매", "드래프트 구매", "판매", "R5 최종 보유", "플레이어당 구매"],
      s.cards.map((c) => [c.rank, `${c.price}BB`, c.shopBuys, c.draftBuys, c.sold, c.finalHeld, num(c.buysPerPlayer, 3)])), "",
    "## 8. 경제 (라운드별 1인 평균)", "",
    table(["라운드", "n", "시작 BB", "카드 순지출(리롤 포함)", "경기 BB 손익", "종료 BB", "획득 Points", "구매 수", "리롤 수"],
      s.economy.map((e) => [`R${e.round}`, e.n, num(mean(e.startBB), 1), num(mean(e.investBB), 1), num(mean(e.matchBB), 1), num(mean(e.endBB), 1), num(mean(e.pointsGained), 2), num(mean(e.buys), 2), num(mean(e.rerolls), 2)])), "",
    "카드 순지출은 상점·드래프트 구매, 판매 환급, 리롤을 합친 R별 BB 변화이고, 경기 BB 손익은 쇼다운 보상입니다. 라운드 수입 +30BB는 시작 BB에 이미 포함됩니다.", "");

  const sc = s.score;
  out.push("## 9. 최종 점수 구성 (R5 결승자)", "",
    table(["항목", "평균 ±95%", "표준편차"], [
      ["Round Points", numCi(sc.points, 1), num(sd(sc.points), 1)], ["Hand Score", numCi(sc.hand, 1), num(sd(sc.hand), 1)],
      ["Stack Score", numCi(sc.stack, 1), num(sd(sc.stack), 1)], ["총점", numCi(sc.total, 1), num(sd(sc.total), 1)]]), "",
    `- 우승자가 결승자 중 Round Points 최다였던 비율: ${pctCi(sc.winnerHadMostPoints.k, sc.winnerHadMostPoints.n)} (낮을수록 Hand/Stack Score가 순위를 뒤집는 빈도가 큼)`,
    "- 결승자 최종 족보 분포: " + CATEGORIES.map((c) => `${c} ${pct(sc.finalHands[c] ?? 0, sc.finalists)}`).join(" · "), "",
    "## 10. 매치 통계", "",
    table(["라운드", "보드 수", "SPLIT 비율", "보드당 서든데스", "무작위 추첨 매치", "몰수패"],
      s.matches.map((m) => [`R${m.round}`, m.boards, pct(m.splitRate.k, m.splitRate.n), num(m.suddenDeathsPerBoard, 3), m.highCardDrawMatches, m.forfeits])), "",
    "### 라운드별 족보 분포 (정규 보드 기준)", "",
    table(["라운드", ...CATEGORIES], s.matches.map((m) => [`R${m.round}`, ...dist(m.categories)])), "",
    "## 해석 주의", "",
    "- 결과는 시뮬레이션 정책의 행동에 좌우됩니다. ENGINE_BOT은 게임의 실제 봇 로직이며 인간 플레이를 의미하지 않습니다.",
    "- 좌석·정책 편향은 `rotate` 배정과 2번 표로 확인합니다. 정책 간 차이는 표본 수와 신뢰구간을 함께 읽어야 합니다.",
    "- 수치 override 결과는 실험 규칙 결과이며 현행 규칙이 아닙니다.", "");
  return out.join("\n");
}

/** Baseline vs experiment on identical seeds and seat deals. */
export function renderComparison(base: Summary, exp: Summary): string {
  const delta = (a: number, b: number, digits = 2) => `${num(a, digits)} → ${num(b, digits)} (${b - a >= 0 ? "+" : ""}${num(b - a, digits)})`;
  const out = ["# Baseline vs Experiment", "",
    `- Experiment override: ${JSON.stringify(exp.config.overrides)}`,
    `- 게임(완주): 기준 ${base.games.completed} / 실험 ${exp.games.completed} · 같은 seed·같은 좌석 배정. 차이가 신뢰구간 안이면 노이즈로 봅니다.`, "",
    "## 정책별 평균 순위 · 우승률 · R5 진출률", "",
    table(["정책", "평균 순위", "우승률", "R5 진출률"], base.policies.map((b) => {
      const e = exp.policies.find((p) => p.policy === b.policy);
      return e ? [b.policy, delta(mean(b.placement), mean(e.placement)), delta(100 * b.win.k / b.win.n, 100 * e.win.k / e.win.n, 1) + "%p", delta(100 * b.reachR5.k / b.reachR5.n, 100 * e.reachR5.k / e.reachR5.n, 1) + "%p"] : [b.policy, "N/A", "N/A", "N/A"];
    })), "",
    "## 라운드별 경제 (1인 평균)", "",
    table(["라운드", "종료 BB", "카드 순지출", "구매 수", "획득 Points"], base.economy.map((b) => {
      const e = exp.economy.find((x) => x.round === b.round)!;
      return [`R${b.round}`, delta(mean(b.endBB), mean(e.endBB), 1), delta(mean(b.investBB), mean(e.investBB), 1), delta(mean(b.buys), mean(e.buys)), delta(mean(b.pointsGained), mean(e.pointsGained))];
    })), "",
    "## rank별 플레이어당 구매", "",
    table(["rank", "구매/인"], base.cards.map((b) => {
      const e = exp.cards.find((x) => x.rank === b.rank);
      return [b.rank, e ? delta(b.buysPerPlayer, e.buysPerPlayer, 3) : "N/A"];
    })), "",
    "## 최종 점수 구성 (결승자 평균)", "",
    table(["항목", "기준 → 실험"], [
      ["Round Points", delta(mean(base.score.points), mean(exp.score.points), 1)], ["Hand Score", delta(mean(base.score.hand), mean(exp.score.hand), 1)],
      ["Stack Score", delta(mean(base.score.stack), mean(exp.score.stack), 1)]]), ""];
  return out.join("\n");
}

export function renderConsole(s: Summary, runtimeMs: number): string {
  const lines = [`games ${s.games.completed}/${s.games.requested} completed, ${s.games.failed} failed, ${(runtimeMs / 1000).toFixed(1)}s`];
  for (const f of s.games.failures) lines.push(`  failure x${f.count} at ${f.at}: ${f.message} (first seed ${f.firstSeed})`);
  for (const p of s.policies) lines.push(`  ${p.policy.padEnd(16)} n=${p.n} avgPlace=${num(mean(p.placement))} win=${pct(p.win.k, p.win.n)} R5=${pct(p.reachR5.k, p.reachR5.n)}`);
  return lines.join("\n");
}
