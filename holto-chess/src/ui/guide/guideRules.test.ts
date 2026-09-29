import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ABILITY_IDS } from "../../game/abilities";
import { createGame, finalStandings, leaveRoundResult, prepareShowdown, resolvePrimary, startNextRound } from "../../game/engine";
import { setLocale, t } from "../../i18n";
import { BeginnerGuide } from "./BeginnerGuide";
import { RuleBook } from "./RuleBook";
import { GameOverviewGuide, type GuideView } from "../GameOverviewGuide";
import { GUIDE_COPY } from "./guideCopy";
import { abilityThumb, GUIDE_RULES } from "./guideRules";

const render = (initialView: GuideView) => renderToStaticMarkup(createElement(GameOverviewGuide, { onClose: () => undefined, initialView }));

describe("game guide rules mirror the engine", () => {
  it("matches the engine's literal R1 BB rewards, R2 draft size and rank points", () => {
    let state = resolvePrimary(prepareShowdown(createGame(4242, "seeded", 2), []));
    const firstDay = state.matches.filter((match) => match.matchday === 1 && match.winnerIds.length === 1);
    expect(firstDay.length).toBeGreaterThan(0);
    for (const match of firstDay) for (const reward of match.rewards ?? []) {
      expect(reward.deltaBB).toBe(match.winnerIds.includes(reward.playerId) ? GUIDE_RULES.matchBB.r1.win : GUIDE_RULES.matchBB.r1.loss);
    }
    expect(finalStandings(state).map((row) => row.rankPoints)).toEqual(GUIDE_RULES.rankPoints);
    state = startNextRound(leaveRoundResult(state));
    expect(state.draft?.cardIds).toHaveLength(GUIDE_RULES.draftCards[2]);
  }, 60_000);
});

describe("game guide content", () => {
  beforeEach(() => setLocale("ko-KR"));

  it("covers every implemented ability with copy in both locales and a guide thumbnail", () => {
    for (const locale of ["ko-KR", "en-US"] as const) {
      expect(Object.keys(GUIDE_COPY[locale].abilities).sort()).toEqual([...ABILITY_IDS].sort());
    }
    for (const ability of ABILITY_IDS) expect(existsSync(resolve("public", abilityThumb(ability).slice(1))), ability).toBe(true);
  });

  it("keeps English guide copy free of Korean text", () => {
    const strings: string[] = [];
    const walk = (value: unknown) => { if (typeof value === "string") strings.push(value); else if (value && typeof value === "object") Object.values(value).forEach(walk); };
    walk(GUIDE_COPY["en-US"]);
    for (const value of strings) expect(value, value).not.toMatch(/[가-힣]/);
  });

  it("opens on a two-way chooser", () => {
    const html = render("home");
    expect(html).toContain("처음부터 알아보기");
    expect(html).toContain("전체 규칙 보기");
  });

  it("walks a beginner from the shared pool to the final score and links to the rule book", () => {
    const html = render("beginner");
    for (const text of ["카드는 모두가 함께 사용합니다", "RUN IT TWICE", "반드시 내 카드 2장 + 보드 3장", "최종 점수 = 누적 승점 + R5 족보 점수 + ⌊남은 BB ÷ 10⌋", "전체 규칙서 보기"]) expect(html).toContain(text);
    for (const ability of ABILITY_IDS) expect(html).toContain(`/assets/abilities/guide/${ability}.webp`);
  });

  it("lists exact rule numbers without exposing implementation names", () => {
    const html = render("rules");
    for (const text of ["승 +3P · Split +1P", "+20 / +12 / +5 / +3", "퍼스트 클래스 보유자", "R2는 8장, R4는 16장", "초보자 가이드 보기"]) expect(html).toContain(text);
    for (const hidden of ["firstCardId", "server", "raw", "Monte Carlo", "abilityId", "insuranceEligible"]) expect(html).not.toContain(hidden);
  });

  it("renders both English views without Korean text", () => {
    // Server rendering always snapshots ko-KR, so the English views are rendered with English copy directly.
    setLocale("en-US");
    const copy = GUIDE_COPY["en-US"];
    const rules = renderToStaticMarkup(createElement(RuleBook, { copy, t, scroller: { current: null }, onBeginner: () => undefined }));
    const beginner = renderToStaticMarkup(createElement(BeginnerGuide, { copy, t, onRules: () => undefined }));
    expect(rules).toContain("PORENA Rule Book");
    expect(beginner).toContain("Everyone shares the cards");
    expect(rules + beginner).not.toMatch(/[가-힣]/);
  });
});
