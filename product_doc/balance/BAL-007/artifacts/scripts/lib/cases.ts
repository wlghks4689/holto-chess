// >=20 deterministic R2 matchups (each hand = [anchor, secondary1, secondary2],
// 6 total distinct cards per case). Chosen to cover: strong/weak anchors,
// paired/unpaired secondaries, suited/offsuit, connected/disconnected, and
// cases designed to probe RUN1-RUN2 correlation (shared anchor strength,
// divergent secondary strength) per REQUEST Q3/Q4.
export type R2Case = { id: string; category: string; label: string; leftCards: [string, string, string]; rightCards: [string, string, string] };

export const R2_CASES: R2Case[] = [
  { id: "r2-01", category: "강한 앵커 vs 약한 앵커", label: "A-anchor(AKQ) vs 7-anchor(789)", leftCards: ["As", "Kd", "Qc"], rightCards: ["7c", "8d", "9h"] },
  { id: "r2-02", category: "페어 앵커 vs 페어 앵커", label: "K-anchor+pair-ish vs Q-anchor", leftCards: ["Kh", "Kc", "2s"], rightCards: ["Qh", "Qd", "3s"] },
  { id: "r2-03", category: "동일 앵커 강도, 보조만 다름", label: "A-anchor, 보조 극단 차이", leftCards: ["As", "Ks", "2c"], rightCards: ["Ad", "Th", "3c"] },
  { id: "r2-04", category: "약한 앵커 동률", label: "2-anchor vs 2-anchor(다른 슈트)", leftCards: ["2s", "9d", "Th"], rightCards: ["2h", "9c", "Tc"] },
  { id: "r2-05", category: "수티드 vs 오프수트", label: "A-suited-run vs A-offsuit", leftCards: ["As", "Ks", "Qs"], rightCards: ["Ah", "Kd", "Qc"] },
  { id: "r2-06", category: "커넥티드 vs 산개", label: "8-anchor 커넥티드 vs 8-anchor 산개", leftCards: ["8s", "7h", "6d"], rightCards: ["8c", "3d", "Jh"] },
  { id: "r2-07", category: "보조1만 강함", label: "보조1=A, 보조2=2 (RUN 간 격차 극대)", leftCards: ["9s", "As", "2c"], rightCards: ["9h", "Kd", "3d"] },
  { id: "r2-08", category: "높은 카드 산개", label: "K-anchor 산개 vs J-anchor 산개", leftCards: ["Kd", "4h", "9c"], rightCards: ["Jc", "5s", "8h"] },
  { id: "r2-09", category: "낮은 카드 산개", label: "4-anchor 산개 vs 5-anchor 산개", leftCards: ["4s", "9h", "Jc"], rightCards: ["5d", "8c", "Th"] },
  { id: "r2-10", category: "동일 랭크 앵커 미러", label: "A-anchor 미러(슈트만 다름)", leftCards: ["As", "Kc", "2d"], rightCards: ["Ah", "Kd", "2c"] },
  { id: "r2-11", category: "낮은 페어 앵커", label: "3-anchor+pair 흔적 vs 4-anchor", leftCards: ["3s", "3h", "Kd"], rightCards: ["4c", "4d", "Qh"] },
  { id: "r2-12", category: "커넥티드 vs 커넥티드", label: "9-8-7 vs T-9-8", leftCards: ["9s", "8h", "7d"], rightCards: ["Tc", "9d", "8s"] },
  { id: "r2-13", category: "강한 앵커 vs 강한 앵커", label: "A-anchor vs K-anchor(둘 다 강)", leftCards: ["As", "Qd", "Jc"], rightCards: ["Ks", "Qh", "Jd"] },
  { id: "r2-14", category: "보조 둘 다 약함", label: "Q-anchor 강한 보조 없음", leftCards: ["Qs", "3d", "2c"], rightCards: ["Jh", "4d", "3c"] },
  { id: "r2-15", category: "수티드 코네티드 앵커", label: "6-anchor 수티드런 vs 6-anchor 산개", leftCards: ["6s", "5s", "4s"], rightCards: ["6h", "Jd", "2c"] },
  { id: "r2-16", category: "높은 페어 앵커 대칭", label: "K-anchor+K 보조 vs A-anchor+낮은 보조", leftCards: ["Kc", "Kh", "5d"], rightCards: ["As", "3d", "2h"] },
  { id: "r2-17", category: "중간 카드 미러", label: "9-anchor 미러", leftCards: ["9s", "Jd", "4c"], rightCards: ["9h", "Jc", "4d"] },
  { id: "r2-18", category: "낮은 앵커 vs 높은 앵커", label: "2-anchor vs A-anchor", leftCards: ["2s", "Kd", "Qc"], rightCards: ["As", "4d", "3c"] },
  { id: "r2-19", category: "보조1/보조2 역전", label: "보조2가 보조1보다 강함", leftCards: ["Ts", "2d", "Ac"], rightCards: ["Th", "3d", "Kc"] },
  { id: "r2-20", category: "완전 무관 산개", label: "완전 무관 6장(랜덤 산개)", leftCards: ["3s", "9d", "Kh"], rightCards: ["4c", "Td", "Qs"] },
  { id: "r2-21", category: "동일 secondary 강도 대칭", label: "양쪽 보조 강도 동일 패턴", leftCards: ["7s", "As", "2d"], rightCards: ["7h", "Ad", "2c"] },
  { id: "r2-22", category: "강한 앵커+약한 두 보조 vs 약한 앵커+강한 두 보조", label: "앵커·보조 강도 반전", leftCards: ["As", "3d", "2c"], rightCards: ["3s", "Ad", "Kc"] },
  { id: "r2-23", category: "낮은 페어 vs 오버카드 산개", label: "5-anchor pair-ish vs K-anchor 산개", leftCards: ["5s", "5h", "9c"], rightCards: ["Kd", "8c", "3h"] },
  { id: "r2-24", category: "브로드웨이 전부", label: "브로드웨이 카드로만 구성된 양쪽", leftCards: ["As", "Kd", "Qc"], rightCards: ["Jh", "Th", "9c"] },
];

export function validateCases(cases: readonly R2Case[]): void {
  for (const c of cases) {
    const all = [...c.leftCards, ...c.rightCards];
    if (all.length !== 6) throw new Error(`${c.id}: expected 6 cards, got ${all.length}`);
    const unique = new Set(all);
    if (unique.size !== 6) throw new Error(`${c.id} (${c.label}): duplicate card id across hands — ${all.join(",")}`);
  }
}
