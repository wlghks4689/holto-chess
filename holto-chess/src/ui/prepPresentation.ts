import type { Phase, Round } from "../game/types";

const PREP_COPY: Record<Exclude<Round, 1>, { title: string; rules: string[] }> = {
  2: {
    title: "RUN IT TWICE",
    rules: ["8장 공개 풀 드래프트", "대표 카드 + RUN별 보조 카드", "RUN별 독립 승점", "탈락 없이 전원 진출"],
  },
  3: {
    title: "OMAHA SWISS",
    rules: [
      "홀카드 4장",
      "동일한 4장으로 모든 매치 진행",
      "세 번의 Swiss 매치",
      "게임마다 새로운 보드",
      "정확히 홀카드 2장 + 보드 3장 사용",
    ],
  },
  4: {
    title: "BEST FIVE",
    rules: ["홀카드 5장", "게임마다 새로운 보드", "홀카드 5장 + 보드 5장 중 자유 BEST5"],
  },
  5: {
    title: "THE LAST HAND",
    rules: ["홀카드 7장", "커뮤니티 보드 없음", "7장 중 BEST5 구성"],
  },
};

export type PrepPresentation = {
  completedRound: Round;
  targetRound: Exclude<Round, 1>;
  title: string;
  rules: string[];
};

/**
 * PREP is presentation-only: combat completion keeps the old round during
 * NEXT_ROUND, while the following SHOP already carries the new round.
 */
export function getPrepPresentation(round: Round, phase: Phase | "LOBBY"): PrepPresentation | null {
  let completedRound: Round;
  let targetRound: Exclude<Round, 1>;

  if (phase === "NEXT_ROUND" && round < 5) {
    completedRound = round;
    targetRound = (round + 1) as Exclude<Round, 1>;
  } else if (phase === "SHOP" && round > 1) {
    completedRound = (round - 1) as Round;
    targetRound = round as Exclude<Round, 1>;
  } else {
    return null;
  }

  return { completedRound, targetRound, ...PREP_COPY[targetRound] };
}
