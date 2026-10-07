import type { Phase, Round } from "../game/types";

type PrepCopy = { title: string; rules: string[] };
const PREP_COPY: Record<Exclude<Round, 1 | 6>, PrepCopy> = {
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

/** Six-round games replace R3's shop with an auction, add RUN IT THREE TIMES and move the final to R6. */
const SIX_ROUND_PREP_COPY: Partial<Record<Exclude<Round, 1>, PrepCopy>> = {
  3: { title: "OMAHA SWISS", rules: ["16장 카드 옥션 · 1인 1장", "낙찰 실패 시 2배 가격 구매", "홀카드 4장 Omaha Swiss"] },
  5: { title: "RUN IT THREE TIMES", rules: ["1위가 매칭 상대 선택", "카드 6장 → 2장씩 3핸드", "RUN 3번 · 승리 5P · 3:0 +15P"] },
  6: { title: "THE LAST HAND", rules: ["보유 5~7장", "출전 5장 + 커뮤니티 보드 · 3-WAY", "출전 5장과 보드 10장 중 BEST5"] },
};

export type PrepPresentation = {
  completedRound: Round;
  targetRound: Exclude<Round, 1>;
  title: string;
  rules: string[];
  sixRounds: boolean;
};

/**
 * PREP is presentation-only: combat completion keeps the old round during
 * NEXT_ROUND, while the following SHOP already carries the new round.
 */
export function getPrepPresentation(round: Round, phase: Phase | "LOBBY", lastRound: Round = 5): PrepPresentation | null {
  let completedRound: Round;
  let targetRound: Exclude<Round, 1>;

  if (phase === "NEXT_ROUND" && round < lastRound) {
    completedRound = round;
    targetRound = (round + 1) as Exclude<Round, 1>;
  } else if (phase === "SHOP" && round > 1) {
    completedRound = (round - 1) as Round;
    targetRound = round as Exclude<Round, 1>;
  } else {
    return null;
  }

  const sixRounds = lastRound === 6;
  const copy = (sixRounds ? SIX_ROUND_PREP_COPY[targetRound] : undefined) ?? PREP_COPY[targetRound as Exclude<Round, 1 | 6>];
  return { completedRound, targetRound, ...copy, sixRounds };
}
