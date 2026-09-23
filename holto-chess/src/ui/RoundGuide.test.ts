import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoundGuide } from "./RoundGuide";

describe("round guide", () => {
  it("uses the approved R1 Hold'em and Swiss-stage wording", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 1, onClose: () => undefined }));

    expect(html).toContain("1라운드 : 2장의 카드로 커뮤니티 보드와 조합하여 더 높은 플레이어가 승리하는 클래식 홀덤");
    expect(html).toContain("기본으로 지급하는 카드 1장과 상점에 등장하는 카드 중 1장을 구매하여 총 2장의 카드를 사용합니다.");
    expect(html).toContain("2장의 핸드로 3경기를 SWISS 스테이지로 진행");
    expect(html).toContain("2장의 카드와 커뮤니티 보드를 조합하여 BEST 5를 만들어 승패를 결정");
  });

  it("describes the R2 round itself and omits the redundant display notice", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 2, onClose: () => undefined, secondsLeft: 17 }));

    expect(html).toContain("대표 카드 한 장을 두 RUN에 공통으로 사용");
    expect(html).not.toContain("기존 두 장을 공개하고 8장 공개 풀");
    expect(html).toContain("남은 시간 17초");
    expect(html).not.toContain("라운드가 시작될 때");
  });

  it("shows all four R3 Omaha hole cards and explains the exact 2+3 rule", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 3, onClose: () => undefined }));

    expect(html).toContain("홀카드 4장 · 정확히 2장 사용");
    expect(html).toContain("홀카드 4장 중 정확히 2장 + 보드 5장 중 정확히 3장으로 BEST5");
    expect(html).toContain("2♦");
    expect(html).toContain("2♣");
    expect(html).toContain("A♥");
    expect(html).toContain("9♠");
    expect(html).toContain("5 하이 스트레이트");
    expect(html).toContain("A♥ · 2♦ · 3♠ · 4♣ · 5♠");
    expect(html).not.toContain("2 원페어");
    expect(html).not.toContain("스트레이트 불가");
  });
});
