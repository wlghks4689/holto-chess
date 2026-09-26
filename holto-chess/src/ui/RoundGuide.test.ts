import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../i18n";
import { RoundGuide } from "./RoundGuide";

describe("round guide", () => {
  beforeEach(() => setLocale("ko-KR"));
  it("uses the approved R1 Hold'em and Swiss-stage wording", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 1, onClose: () => undefined }));

    expect(html).toContain("2장의 카드와 커뮤니티 보드로 승부합니다.");
    expect(html).toContain("텍사스 홀덤 규칙입니다.");
    expect(html).toContain("기본 카드 1장과 상점에서 구매한 카드 1장, 총 2장을 사용합니다.");
    expect(html).toContain("Swiss 방식의 3경기를 진행합니다.");
    expect(html).toContain("홀카드와 커뮤니티 보드를 조합해 BEST 5를 만들고 승패를 결정합니다.");
  });

  it("describes the R2 round itself and omits the redundant display notice", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 2, onClose: () => undefined, secondsLeft: 17 }));

    expect(html).toContain("대표 카드와 RUN별 보조 카드로 두 번 승부합니다.");
    expect(html).toContain("기존 카드 2장에 드래프트 카드 1장을 더해 총 3장을 사용합니다.");
    expect(html).toContain("대표 카드 1장과 RUN별 보조 카드 1장씩을 배치합니다.");
    expect(html).toContain("각 카드 조합으로 한 번씩, 총 두 번의 RUN을 진행합니다.");
    expect(html).toContain("RUN 1에 나온 카드는 RUN 2에 다시 나오지 않습니다.");
    expect(html).toContain("RUN별 승리 +4P · Split +2P · 패배 +0P");
    expect(html).not.toContain("전원 생존");
    expect(html).not.toContain("기존 두 장을 공개하고 8장 공개 풀");
    expect(html).toContain("남은 시간 17초");
    expect(html).not.toContain("라운드가 시작될 때");
  });

  it("shows all four R3 Omaha hole cards and explains the exact 2+3 rule", () => {
    const html = renderToStaticMarkup(createElement(RoundGuide, { round: 3, onClose: () => undefined }));

    expect(html).toContain("홀카드 4장 · 정확히 2장 사용");
    expect(html).toContain("Match 1 상대는 누적 승점 순으로 정합니다.");
    expect(html).toContain("Match 2와 3은 Swiss 점수가 가까운 상대와 대결합니다.");
    expect(html).toContain("홀카드 4장 중 정확히 2장, 보드 5장 중 정확히 3장");
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
    expect(html).toContain("2차전 승자조: 1위 +10P · 2위 +5P · 3위 +3P");
    expect(html).toContain("공동 2위는 각 +3P");
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
