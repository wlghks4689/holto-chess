import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSession, createRoom } from "../game/room";
import { createPlayerView } from "../game/playerView";
import { FinalResultsPanel } from "./FinalResultsPanel";
import { loadSavedFinalResults, makeSavedFinalResult, saveFinalResult } from "./finalResultArchive";
import { MatchHistoryPage } from "./MatchHistory";
import { FinalStandingRow } from "./FinalStandingRow";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function finalView() {
  const view = createPlayerView(addSession(createRoom("ABCDEF", 101), "one").room, "p1");
  const opponentId = view.players[1].playerId;
  view.phase = "GAME_RESULT";
  view.players[0].name = "지팡스키";
  view.players[1].name = "클럽 레이븐";
  view.standings = [
    { playerId: "p1", points: 58, handScore: 19, stackScore: 22, stackBB: 229, total: 99, displayName: "로열 스트레이트 플러시", finalPlace: 1, placement: 1, rankPoints: 8 },
    { playerId: opponentId, points: 39, handScore: 15, stackScore: 19, stackBB: 198, total: 73, displayName: "투페어", finalPlace: 2, placement: 2, rankPoints: 4, eliminatedRound: 5 },
  ];
  return view;
}

describe("final result panel", () => {
  it("conceals only eliminated players below fourth place", () => {
    const row = { ...finalView().standings[0], cards: [{ id: "Ah", rank: 14 as const, suit: "h" as const }], usedCardIds: ["Ah"] };
    for (const placement of [4, 5, 8]) {
      const html = renderToStaticMarkup(createElement(FinalStandingRow, { row: { ...row, placement, eliminatedRound: 3 }, name: "테스트" }));
      expect(html.includes("is-card-back")).toBe(placement > 4);
      expect(html.includes("is-best")).toBe(placement === 4);
      if (placement > 4) expect(html).not.toContain("A♥");
    }
    const finalist = renderToStaticMarkup(createElement(FinalStandingRow, { row: { ...row, placement: 5 }, name: "결승 참가자" }));
    expect(finalist).not.toContain("is-card-back");
    expect(finalist).toContain("is-best");
  });
  beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));

  it("renders centered final-standing columns and keeps score details in the total popover", () => {
    const html = renderToStaticMarkup(createElement(FinalResultsPanel, { view: finalView() }));
    expect(html).toContain("지팡스키");
    for (const label of ["순위", "닉네임", "BEST 5", "누적", "승점", "족보", "점수", "스택", "총점", "랭크"]) expect(html).toContain(label);
    expect(html).not.toContain('class="panel final-panel"');
    expect(html).not.toContain("최종 결과</h2>");
    expect(html).toContain('class="final-score-part">19</span>');
    expect(html).not.toContain("19<small>로열 플러시</small>");
    expect(html).not.toContain("로열 스트레이트 플러시");
    expect(html).toContain('class="final-score-part">22</span>');
    expect(html).not.toContain("22<small>229BB</small>");
    expect(html).not.toContain("증강 보너스");
    expect(html).not.toContain("누적 승점 + 족보 점수");
    expect(html).not.toContain("총점 P");
    expect(html).not.toContain("RANK");
    expect(html).not.toContain("R5 탈락");
    expect(html).not.toContain("FINAL");
    expect(html).toContain("이 기기에 결과 저장");
  });

  it("stores a complete result locally and replaces a duplicate game save", () => {
    const view = finalView();
    saveFinalResult(makeSavedFinalResult(view, "2026-09-20T01:00:00.000Z"));
    saveFinalResult(makeSavedFinalResult(view, "2026-09-20T02:00:00.000Z"));
    const saved = loadSavedFinalResults();
    expect(saved).toHaveLength(1);
    expect(saved[0].savedAt).toBe("2026-09-20T02:00:00.000Z");
    expect(saved[0].standings[0]).toMatchObject({ name: "지팡스키", handName: "로열 스트레이트 플러시", stackBB: 229 });
    const history = renderToStaticMarkup(createElement(MatchHistoryPage, { onBack: () => {} }));
    expect(history).toContain("대전 기록");
    expect(history).toContain("지팡스키");
    expect(history).toContain("최종 229BB");
  });
});
