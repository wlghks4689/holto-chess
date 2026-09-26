// Candidate 3-hand hero pools used to hunt for representative branch
// exemplars (solo regulation win, regulation tie -> 1 sudden death, 2-way
// tie only at 2nd with no tiebreak, etc.) via seed sweep, not hand-authored
// guesses. Every triple must be 15 DISTINCT card ids (checked below).
export type HandTriple = [string[], string[], string[]];

export const HAND_POOLS: { id: string; label: string; hands: HandTriple }[] = [
  {
    id: "distinct-strength",
    label: "뚜렷한 강도차(쿼드-투페어-투페어 재료)",
    hands: [
      ["As", "Ah", "Kd", "Kc", "2s"],
      ["7c", "7d", "9h", "Jc", "4s"],
      ["Qs", "Qh", "Tc", "8d", "3h"],
    ],
  },
  {
    id: "near-mirror-pairs",
    label: "서로 다른 슈트의 유사 강도 페어 3개(동률 유도)",
    hands: [
      ["8s", "8h", "3d", "5c", "9h"],
      ["8d", "8c", "3h", "5d", "9c"],
      ["7s", "7h", "3c", "5h", "9d"],
    ],
  },
  {
    id: "weak-disconnected-trio",
    label: "약하고 무관한 로우카드 3명(보드 지배 → 동률 빈발 예상)",
    hands: [
      ["2c", "4d", "6h", "8s", "Tc"],
      ["3d", "5h", "7s", "9c", "Jd"],
      ["2d", "4h", "6c", "8d", "Th"],
    ],
  },
  {
    id: "two-strong-one-weak",
    label: "강한 2명(2위 동점 유도) + 약한 1명",
    hands: [
      ["As", "Ah", "Ks", "Kh", "2c"],
      ["Ad", "Ac", "Kd", "Kc", "3s"],
      ["7h", "5d", "3c", "9s", "Jh"],
    ],
  },
  {
    id: "all-suited-runup",
    label: "런다운/수티드 위주 3명(플러시·스트레이트 경합)",
    hands: [
      ["9s", "8s", "7h", "6d", "2c"],
      ["Jh", "Th", "9d", "8c", "3s"],
      ["Qd", "Jd", "Tc", "9h", "4s"],
    ],
  },
];

export function validateTriple(hands: HandTriple): void {
  const all = hands.flat();
  const unique = new Set(all);
  if (all.length !== 15 || unique.size !== 15) throw new Error(`Hand triple must be 15 distinct cards, got ${all.length} (${unique.size} unique)`);
}

for (const pool of HAND_POOLS) validateTriple(pool.hands);
