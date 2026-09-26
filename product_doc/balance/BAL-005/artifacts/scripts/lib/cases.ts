// Deterministic test matchups for BAL-005. Every case is a heads-up pair of
// hands drawn from a single 52-card deck (no id collisions between the two
// hands — checked by validateCases() below). Categories follow REQUEST.md's
// "기준 핸드 세트" list: strong/weak Omaha structure, paired ranks, suited vs
// rainbow, connected vs scattered, AAxx, low/high cards, R4 made/draw/scattered.

export type Case = { id: string; category: string; label: string; left: string[]; right: string[] };

export const R1_CASES: Case[] = [
  { id: "r1-01", category: "강한 vs 약한", label: "AA vs 72o", left: ["As", "Ah"], right: ["7c", "2d"] },
  { id: "r1-02", category: "강한 vs 강한", label: "AA vs KK", left: ["As", "Ah"], right: ["Kc", "Kd"] },
  { id: "r1-03", category: "지배 구조", label: "KK vs AQo", left: ["Ks", "Kh"], right: ["Ac", "Qd"] },
  { id: "r1-04", category: "코인플립", label: "QQ vs AKs", left: ["Qs", "Qh"], right: ["Ac", "Kc"] },
  { id: "r1-05", category: "suitedness", label: "AKs vs AKo(다른 슈트)", left: ["As", "Ks"], right: ["Ad", "Kc"] },
  { id: "r1-06", category: "지배 구조", label: "AKo vs KQo", left: ["Ah", "Kd"], right: ["Kc", "Qs"] },
  { id: "r1-07", category: "약한 페어 vs 오버카드", label: "22 vs AKo", left: ["2s", "2h"], right: ["Ac", "Kd"] },
  { id: "r1-08", category: "낮은 페어 레이스", label: "55 vs 44", left: ["5s", "5h"], right: ["4c", "4d"] },
  { id: "r1-09", category: "connectedness", label: "JTs vs 92o", left: ["Js", "Ts"], right: ["9c", "2d"] },
  { id: "r1-10", category: "connectedness", label: "76s vs 98s", left: ["7s", "6s"], right: ["9d", "8d"] },
  { id: "r1-11", category: "낮은 카드", label: "A2s vs 76s", left: ["As", "2s"], right: ["7d", "6d"] },
  { id: "r1-12", category: "낮은 페어 레이스", label: "33 vs 22", left: ["3s", "3h"], right: ["2c", "2d"] },
  { id: "r1-13", category: "높은 카드", label: "AJo vs KTo", left: ["As", "Jd"], right: ["Kc", "Th"] },
  { id: "r1-14", category: "suitedness", label: "K9s vs Q9s", left: ["Ks", "9s"], right: ["Qd", "9d"] },
  { id: "r1-15", category: "약한 vs 약한", label: "84o vs 73o", left: ["8s", "4h"], right: ["7c", "3d"] },
  { id: "r1-16", category: "코인플립", label: "AKo vs QQ", left: ["Ah", "Kd"], right: ["Qs", "Qc"] },
  { id: "r1-17", category: "코인플립", label: "TT vs AKs", left: ["Ts", "Th"], right: ["Ac", "Kc"] },
  { id: "r1-18", category: "connectedness", label: "89s vs KQo", left: ["8s", "9s"], right: ["Kd", "Qh"] },
  { id: "r1-19", category: "강한 vs 약한", label: "AA vs 22", left: ["As", "Ah"], right: ["2c", "2d"] },
  { id: "r1-20", category: "낮은 카드", label: "65s vs A9o", left: ["6s", "5s"], right: ["Ad", "9c"] },
  { id: "r1-21", category: "높은 카드", label: "KQs vs JTs", left: ["Ks", "Qs"], right: ["Jd", "Td"] },
  { id: "r1-22", category: "약한 vs 약한", label: "72o vs 83o", left: ["7s", "2h"], right: ["8c", "3d"] },
  { id: "r1-23", category: "블로커/미러", label: "AKo(hs) vs AKo(dc)", left: ["Ah", "Ks"], right: ["Ad", "Kc"] },
  { id: "r1-24", category: "suitedness", label: "A5s vs 66", left: ["As", "5s"], right: ["6d", "6c"] },
];

export const R3_CASES: Case[] = [
  { id: "r3-01", category: "강한 double-suited vs 약한", label: "AAKKds vs 876ss+5d", left: ["As", "Ac", "Ks", "Kc"], right: ["8h", "7h", "6d", "5d"] },
  { id: "r3-02", category: "런다운 vs AAxx rainbow", label: "JT98ds vs AA72 rainbow", left: ["Js", "Ts", "9h", "8h"], right: ["Ad", "Ac", "7d", "2c"] },
  { id: "r3-03", category: "AAxx single-suited vs scattered", label: "AAJT(ss) vs KQ98 rainbow", left: ["As", "Ac", "Js", "Th"], right: ["Kd", "Qc", "9h", "8s"] },
  { id: "r3-04", category: "런다운 vs 투페어", label: "9876ds vs 5544", left: ["9s", "8h", "7s", "6h"], right: ["5c", "5d", "4h", "4s"] },
  { id: "r3-05", category: "높은 카드 rainbow vs 더블페어", label: "KJ83 rainbow vs TT99ds", left: ["Kd", "Jc", "8h", "3s"], right: ["Ts", "Td", "9h", "9c"] },
  { id: "r3-06", category: "낮은 카드 double-suited vs broadway rainbow", label: "A234ds(wheel) vs KQJT rainbow", left: ["As", "2s", "3h", "4h"], right: ["Kd", "Qc", "Jh", "Ts"] },
  { id: "r3-07", category: "AAxx 함정", label: "AA27 rainbow vs QJT9ds", left: ["Ad", "Ah", "2c", "7s"], right: ["Qs", "Js", "Th", "9h"] },
  { id: "r3-08", category: "더블페어 vs 더블페어", label: "KK98ss vs QQJTss", left: ["Kc", "Kd", "9h", "8h"], right: ["Qc", "Qd", "Jh", "Th"] },
  { id: "r3-09", category: "강한 double-suited vs 약한 scattered", label: "AAKKds vs 2c3c9hTh", left: ["As", "Ad", "Ks", "Kd"], right: ["2c", "3c", "9h", "Th"] },
  { id: "r3-10", category: "산개 vs 런다운", label: "2sJcKd scattered vs 6789ds", left: ["2s", "7h", "Jc", "Kd"], right: ["6s", "7s", "8h", "9h"] },
  { id: "r3-11", category: "3-flush vs 런다운", label: "AKQ2(3-flush) vs JT98ds", left: ["As", "Ks", "Qs", "2h"], right: ["Jd", "Td", "9c", "8c"] },
  { id: "r3-12", category: "AAxx rainbow vs 강한 KK", label: "AA92 rainbow vs KKQJds", left: ["Ac", "Ad", "9h", "2s"], right: ["Ks", "Kh", "Qs", "Jh"] },
  { id: "r3-13", category: "단일-suited 런다운 vs 더블페어", label: "9876(단일suited) vs KK44", left: ["9c", "8c", "7d", "6h"], right: ["Ks", "Kd", "4h", "4c"] },
  { id: "r3-14", category: "낮은 페어 드로우 vs 프리미엄 더블페어", label: "3345(휠드로우) vs QQKKds", left: ["3s", "3h", "4d", "5c"], right: ["Qc", "Qd", "Ks", "Kh"] },
  { id: "r3-15", category: "AAxx 단일-suited vs 런다운", label: "AAK3(단일suited) vs T987ds", left: ["As", "Ah", "Kc", "3c"], right: ["Ts", "9s", "8h", "7h"] },
  { id: "r3-16", category: "약한 페어 vs 약한 페어", label: "229K rainbow vs 789Sk", left: ["2c", "2d", "9h", "Ks"], right: ["7c", "7d", "8h", "9s"] },
  { id: "r3-17", category: "너트 플러시 드로우 vs 메이드 투페어", label: "AK92(넛플드로우) vs JJTT", left: ["As", "Ks", "9h", "2d"], right: ["Jc", "Jd", "Th", "Ts"] },
  { id: "r3-18", category: "산개 vs 산개", label: "2s7hJcKd vs 3d8hTcQh", left: ["2s", "7h", "Jc", "Kd"], right: ["3d", "8h", "Tc", "Qh"] },
  { id: "r3-19", category: "높은 페어 double-suited vs 런다운", label: "AAKKds(별슈트) vs 5432ds", left: ["Ah", "Ac", "Kh", "Kc"], right: ["5s", "4s", "3d", "2d"] },
  { id: "r3-20", category: "중복 rank 트리플-투페어", label: "TT99 vs JJ88", left: ["Ts", "Td", "9h", "9c"], right: ["Jh", "Jc", "8s", "8d"] },
  { id: "r3-21", category: "AAxx vs AAxx(다른 킥커)", label: "AAK5 vs AAQ4 (덱 충돌 회피용 별 슈트)", left: ["As", "Ah", "Ks", "5h"], right: ["Ad", "Ac", "Qd", "4c"] },
  { id: "r3-22", category: "낮은 카드 rainbow vs 낮은 카드 런다운", label: "2469 rainbow vs 3456ds", left: ["2c", "4d", "6h", "9s"], right: ["3s", "4s", "5h", "6d"] },
  { id: "r3-23", category: "강한 브로드웨이 double-suited vs 약한 페어", label: "KQJTds vs 5566", left: ["Ks", "Qs", "Jh", "Th"], right: ["5c", "5d", "6s", "6h"] },
  { id: "r3-24", category: "AAxx vs 브로드웨이 rainbow", label: "AA83 rainbow vs KQJ9 rainbow", left: ["Ad", "Ah", "8c", "3s"], right: ["Kc", "Qd", "Jh", "9s"] },
];

export const R4_CASES: Case[] = [
  { id: "r4-01", category: "메이드(투페어) vs 산개", label: "AAKK2 vs 7 3 9 J 4 scattered", left: ["As", "Ah", "Kd", "Kc", "2s"], right: ["7c", "3d", "9h", "Jc", "4s"] },
  { id: "r4-02", category: "4-플러시 드로우 vs 커넥티드", label: "AK94(2)(4флаш) vs T9876 커넥티드", left: ["As", "Ks", "9s", "4s", "2h"], right: ["Tc", "9d", "8h", "7c", "6s"] },
  { id: "r4-03", category: "풀하우스 재료 vs 산개 높은카드", label: "QQQ77 vs AKJ94 scattered", left: ["Qs", "Qh", "Qc", "7d", "7c"], right: ["Ac", "Kd", "Jh", "9s", "4c"] },
  { id: "r4-04", category: "오픈엔드 드로우 vs 메이드 페어", label: "98762 vs KKQ93", left: ["9s", "8h", "7d", "6c", "2s"], right: ["Kd", "Kh", "Qc", "9h", "3d"] },
  { id: "r4-05", category: "산개 투페어 vs 드로우", label: "3388K vs JT982", left: ["3s", "3h", "8d", "8c", "Kh"], right: ["Jc", "Tc", "9d", "8s", "2h"] },
  { id: "r4-06", category: "높은 카드 산개 vs 메이드 페어", label: "AKQJ9 vs TT762", left: ["As", "Kd", "Qh", "Jc", "9s"], right: ["Th", "Td", "7c", "6d", "2h"] },
  { id: "r4-07", category: "완성된 플러시 vs 더블페어", label: "AK952(완성 플러시) vs AAKK7", left: ["As", "Ks", "9s", "5s", "2s"], right: ["Ac", "Ad", "Kc", "Kh", "7h"] },
  { id: "r4-08", category: "갭 스트레이트 드로우 vs 탑페어", label: "97642 vs KKJ83", left: ["9s", "7h", "6d", "4c", "2s"], right: ["Kc", "Kd", "Jh", "8s", "3c"] },
  { id: "r4-09", category: "페어+산개 vs 투톤 드로우", label: "TTJ48 vs QJ983", left: ["Th", "Tc", "Jd", "4s", "8h"], right: ["Qs", "Js", "9d", "8c", "3h"] },
  { id: "r4-10", category: "낮은 산개 vs 강한 페어", label: "24689 vs KKQJ9", left: ["2s", "4h", "6d", "8c", "9d"], right: ["Kh", "Kd", "Qc", "Js", "9h"] },
  { id: "r4-11", category: "AAxx 메이드 vs 런다운 드로우", label: "AAK72 vs JT986", left: ["As", "Ah", "Kd", "7c", "2h"], right: ["Jc", "Tc", "9d", "8s", "6h"] },
  { id: "r4-12", category: "트립스 vs 투페어 산개", label: "999K4 vs QQJ73", left: ["9s", "9h", "9c", "Kd", "4h"], right: ["Qc", "Qd", "Jh", "7s", "3d"] },
  { id: "r4-13", category: "낮은 스트레이트 메이드 vs 산개", label: "76543 vs AKQ92", left: ["7s", "6h", "5d", "4c", "3s"], right: ["Ac", "Kd", "Qh", "9s", "2c"] },
  { id: "r4-14", category: "너트 플러시 드로우 vs 메이드 트립스", label: "AK853(4플) vs 888Q2", left: ["Ah", "Kh", "8h", "5h", "3s"], right: ["8c", "8d", "8s", "Qc", "2d"] },
  { id: "r4-15", category: "산개 vs 산개", label: "2s7hJcKd4h vs 3d8hTc Qh9s", left: ["2s", "7h", "Jc", "Kd", "4h"], right: ["3d", "8h", "Tc", "Qh", "9s"] },
  { id: "r4-16", category: "더블페어 vs 더블페어", label: "AAKK3 vs QQJJ6", left: ["As", "Ah", "Kd", "Kc", "3s"], right: ["Qh", "Qc", "Jd", "Jh", "6s"] },
  { id: "r4-17", category: "낮은 커넥티드 드로우 vs 높은 산개", label: "65432(스트레이트 완성) vs AKQJ8", left: ["6s", "5h", "4d", "3c", "2s"], right: ["Ac", "Kd", "Qh", "Jc", "8s"] },
  { id: "r4-18", category: "AAxx vs 프리미엄 더블페어", label: "AAJ73 vs KKQQ9", left: ["Ad", "Ac", "Jh", "7s", "3d"], right: ["Kh", "Kc", "Qd", "Qs", "9h"] },
  { id: "r4-19", category: "약한 페어 vs 약한 페어", label: "2299J vs 7788K", left: ["2s", "2h", "9d", "9c", "Jh"], right: ["7s", "7h", "8d", "8c", "Kh"] },
  { id: "r4-20", category: "스트레이트 드로우 double gutshot vs 메이드", label: "97642(2) vs QQT85", left: ["9h", "7d", "6c", "4s", "2h"], right: ["Qs", "Qh", "Tc", "8d", "5c"] },
  { id: "r4-21", category: "브로드웨이 산개 vs 낮은 메이드 페어", label: "AKQJT(브로드웨이 산개) vs 3344 6", left: ["Ac", "Kh", "Qd", "Jc", "Ts"], right: ["3s", "3h", "4d", "4c", "6h"] },
  { id: "r4-22", category: "완성 플러시 vs 완성 스트레이트", label: "T8642(완성 플러시) vs 9876 5(완성 스트레이트)", left: ["Th", "8h", "6h", "4h", "2h"], right: ["9c", "8s", "7d", "6c", "5s"] },
  { id: "r4-23", category: "산개 킥커 싸움", label: "AKQ97 vs AJT86", left: ["As", "Kd", "Qh", "9c", "7s"], right: ["Ah", "Jc", "Td", "8h", "6d"] },
  { id: "r4-24", category: "낮은 카드 산개 vs 낮은 카드 산개", label: "2s4h7c9dTc vs 3d5h6c8s Jc", left: ["2s", "4h", "7c", "9d", "Tc"], right: ["3d", "5h", "6c", "8s", "Jc"] },
];

export function validateCases(cases: readonly Case[], expectedLen: number): void {
  for (const c of cases) {
    if (c.left.length !== expectedLen || c.right.length !== expectedLen) {
      throw new Error(`${c.id}: expected ${expectedLen} cards each, got left=${c.left.length} right=${c.right.length}`);
    }
    const all = [...c.left, ...c.right];
    const unique = new Set(all);
    if (unique.size !== all.length) {
      throw new Error(`${c.id} (${c.label}): duplicate card id across hero/villain — ${all.join(",")}`);
    }
  }
}
