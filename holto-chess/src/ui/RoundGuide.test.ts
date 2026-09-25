import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoundGuide } from "./RoundGuide";

describe("round guide", () => {
  it("uses the approved R1 Hold'em and Swiss-stage wording", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 1, onClose: () => undefined }));

    expect(html).toContain("2장의 카드로 커뮤니티 보드와 조합하여 승패 결정");
    expect(html).toContain("텍사스 홀덤 규칙, 첫 경기는 무작위 매칭 이후에는 비슷한 성적의 상대와 대결하는 스위스 대진 방식으로 진행합니다.");
    expect(html).toContain("기본으로 지급하는 카드 1장과 상점에 등장하는 카드 중 1장을 구매하여 총 2장의 카드를 사용합니다.");
    expect(html).toContain("2장의 핸드로 3경기를 SWISS 스테이지로 진행");
    expect(html).toContain("2장의 카드와 커뮤니티 보드를 조합하여 BEST 5를 만들어 승패를 결정");
  });

  it("describes the R2 round itself and omits the redundant display notice", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 2, onClose: () => undefined, secondsLeft: 17 }));

    expect(html).toContain("총 3장의 카드를 두장의 조합으로 나누어 2번 승부.");
    expect(html).toContain("기존 카드 2장 + 드래프트 1장 = 3장");
    expect(html).toContain("대표 카드 1장과 + RUN별 보조 카드 배치");
    expect(html).toContain("각각의 조합으로 두번의 RUN을 진행, 승패 결정");
    expect(html).toContain("RUN1에 등장한 카드는 RUN2에 등장하지 않습니다.");
    expect(html).toContain("RUN별 승리 +4P · Split +2P · 패배 +0P");
    expect(html).not.toContain("전원 생존");
    expect(html).not.toContain("기존 두 장을 공개하고 8장 공개 풀");
    expect(html).toContain("남은 시간 17초");
    expect(html).not.toContain("라운드가 시작될 때");
  });

  it("shows all four R3 Omaha hole cards and explains the exact 2+3 rule", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 3, onClose: () => undefined }));

    expect(html).toContain("홀카드 4장 · 정확히 2장 사용");
    expect(html).toContain("Match 1: 누적 승점 순으로 매칭 상대 결정");
    expect(html).toContain("Match 2·3: Swiss Score가 가까운 상대와 대결");
    expect(html).toContain("홀카드 4장 중 2장 + 보드 5장 중 3장으로 BEST5");
    expect(html).toContain("MATCH RULE");
    expect(html).toContain("타이브레이크 3판 모두 SPLIT이면 하이카드 드로우로 승패를 결정합니다.");
    expect(html).toContain("2♦");
    expect(html).toContain("2♣");
    expect(html).toContain("A♥");
    expect(html).toContain("9♠");
    expect(html).toContain("5 하이 스트레이트");
    expect(html).toContain("A♥ · 2♦ · 3♠ · 4♣ · 5♠");
    expect(html).not.toContain("2 원페어");
    expect(html).not.toContain("스트레이트 불가");
  });

  it("summarizes only R4 match points and the winner/loser bracket outcomes", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 4, onClose: () => undefined }));

    expect(html).toContain("1차전: 승리 +6P · Split +3P");
    expect(html).toContain("2차전 승자조: 1위 +10P · 2위 +5P · 3위 +3P (공동 2위 각 +3P)");
    expect(html).toContain("2차전 패자조: 승자 생존 · 패자 탈락");
    expect(html).not.toContain("기본 BB");
    expect(html).not.toContain("연승·연패");
  });

  it("supports a neutral return label when opened manually during a game", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 3, onClose: () => undefined, confirmLabel: "게임으로 돌아가기" }));
    expect(html).toContain("게임으로 돌아가기");
    expect(html).not.toContain("이해했습니다 · ROUND 3 시작");
  });
});
