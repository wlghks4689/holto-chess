import { describe, expect, it } from "vitest";
import { createGame, getCard, resolvePrimary, leaveRoundResult, startNextRound } from "./engine";
import { releasePlayerCards, assertPoolIntegrity } from "./cardPool";
import { emptySwissRecord, swissPairs } from "./swiss";
import { createMatchView } from "./matchView";

describe("R1 Swiss", () => {
  it.each([4, 6, 8])("runs three unique opponents for every player in a %i-player field", (count) => {
    let splits = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const before = createGame(seed);
      for (const p of before.players.slice(count)) releasePlayerCards(before, p);
      before.players = before.players.slice(0, count);
      for (const p of before.players) {
        const id = p.shopCardIds.shift()!;
        p.ownedCardIds.push(id);
        const entry = before.ownershipCardPool.find((e) => e.card.id === id)!;
        entry.state = "OWNED"; entry.ownerPlayerId = p.id; delete entry.reservedPlayerId;
      }
      before.phase = "SHOWDOWN_PRIMARY";
      const after = resolvePrimary(before);
      expect(after.roundResults).toHaveLength(count * 3 / 2);
      expect(after.players.every((p) => !p.eliminated)).toBe(true);
      expect(assertPoolIntegrity(after)).toBe(true);
      for (const day of [1, 2, 3]) {
        const ids = after.roundResults.filter((m) => m.matchday === day).flatMap((m) => m.playerIds);
        expect(new Set(ids).size).toBe(count); expect(ids).toHaveLength(count);
      }
      for (const p of after.players) {
        const matches = after.roundResults.filter((m) => m.playerIds.includes(p.id));
        expect(new Set(matches.flatMap((m) => m.playerIds.filter((id) => id !== p.id))).size).toBe(3);
        const record = matches.at(-1)!.swissAfter![p.id]!;
        expect(record.wins + record.draws + record.losses).toBe(3);
        expect(record.score).toBe(record.wins + record.draws * 0.5);
        expect(p.points).toBe(record.wins * 3 + record.draws);
        expect(p.points).toBeLessThanOrEqual(9);
      }
      for (const m of after.roundResults) {
        if (m.winnerIds.length === 2) {
          splits++;
          for (const id of m.playerIds) {
            expect(m.pointAwards![id]).toBe(1);
            expect(m.swissAfter![id].score - m.swissBefore![id].score).toBe(0.5);
          }
        }
        const excluded = m.playerIds.flatMap((id) => before.players.find((p) => p.id === id)!.ownedCardIds);
        expect(m.boards).toHaveLength(1); expect(m.suddenDeathCount).toBe(0);
        expect(m.boards[0].every((c) => !excluded.includes(c.id))).toBe(true);
        expect(new Set(m.boards[0].map((c) => c.id)).size).toBe(5);
        expect(createMatchView(after, m).swissAfter).toEqual(m.swissAfter);
      }
      expect(() => resolvePrimary(after)).toThrow();
      expect(startNextRound(leaveRoundResult(after)).round).toBe(2);
      expect(getCard(after, before.players[0].ownedCardIds[0])).toBeDefined();
    }
    expect(splits).toBeGreaterThan(0);
  });

  it("pairs equal scores even when input order alternates winners and losers", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const records = Object.fromEntries(ids.map((id, i) => [id, { ...emptySwissRecord(), score: i % 2 }]));
    const pairs = swissPairs(ids, records, []);
    expect(pairs.every(([a, b]) => records[a].score === records[b].score)).toBe(true);
  });

  it("uses adjacent groups to avoid repeats and minimizes repeats if unavoidable", () => {
    const ids = ["a", "b", "c", "d"];
    const records = Object.fromEntries(ids.map((id, i) => [id, { ...emptySwissRecord(), score: i < 2 ? 1 : 0 }]));
    const history = [["a", "b"], ["c", "d"]];
    expect(swissPairs(ids, records, history).every(([a, b]) => records[a].score !== records[b].score)).toBe(true);
    const fullHistory = [["a", "b"], ["a", "c"], ["a", "d"], ["b", "c"], ["b", "d"], ["c", "d"]];
    expect(swissPairs(ids, records, fullHistory)).toHaveLength(2);
  });
});
