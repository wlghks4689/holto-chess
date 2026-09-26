import { describe, expect, it } from "vitest";
import { classifyGameError } from "../shared/gameErrorCode";
import { renderGameError } from "./gameError";
import { setLocale, t } from "./index";

describe("structured game errors", () => {
  it("classifies existing engine errors without changing their thrown messages", () => {
    expect(classifyGameError("BB가 부족합니다.").code).toBe("INSUFFICIENT_BB");
    expect(classifyGameError("내 드래프트 차례가 아닙니다.").code).toBe("DRAFT_NOT_YOUR_TURN");
    expect(classifyGameError("보유 카드 2장을 선택하세요.").code).toBe("CARD_SELECTION_INVALID");
    for (const message of [
      "이번 라운드 보유 한도에 도달했습니다.", "이번 라운드 구매 횟수를 모두 사용했습니다.",
      "내 상점에 예약된 카드가 아닙니다.", "이번 라운드 리롤 횟수를 모두 사용했습니다.",
      "상점 단계가 아닙니다.", "R3은 보유 카드 4장이 필요합니다.",
      "선택 시간이 끝났습니다.", "최종 순위표 공개 이후에만 기록을 열 수 있습니다.",
      "출전 카드 2장을 선택하세요.", "지원하지 않는 명령입니다.",
    ]) expect(classifyGameError(message).code).not.toBe("ACTION_REJECTED");
  });

  it("renders the same code in either locale and preserves unknown legacy errors", () => {
    setLocale("ko-KR");
    expect(renderGameError({ code: "INSUFFICIENT_BB", message: "BB가 부족합니다." }, t)).toBe("BB가 부족합니다.");
    setLocale("en-US");
    expect(renderGameError({ code: "INSUFFICIENT_BB", message: "BB가 부족합니다." }, t)).toBe("Not enough BB.");
    expect(renderGameError({ code: "ACTION_REJECTED", message: "BB가 부족합니다." }, t)).toBe("Not enough BB.");
    expect(renderGameError({ code: "UNAUTHORIZED", message: "잘못된 세션입니다." }, t)).toBe("Your session could not be restored.");
    expect(renderGameError({ code: "FUTURE_CODE", message: "Legacy fallback" }, t)).toBe("Legacy fallback");
    setLocale("ko-KR");
  });
});
