import { describe, expect, it } from "vitest";
import { applyDelta, carryOver, humanBonus, rankDelta, scoreBonus, seasonAt, startingPoints, tierFor, SEASON_EPOCH_MS, SEASON_LENGTH_MS, TIERS } from "./rank";

const delta = (placement: number, finalScore: number, humanCount: number, forfeited = false) => rankDelta({ placement, finalScore, humanCount, forfeited }).delta;

describe("RANK-SYSTEM-002 RP rules", () => {
  it("matches the spec examples", () => {
    expect(delta(1, 110, 1)).toBe(8);
    expect(delta(1, 131, 1)).toBe(11);
    expect(delta(1, 131, 8)).toBe(15);
    expect(delta(2, 125, 8)).toBe(10);
    expect(delta(5, 131, 8)).toBe(2); // -1 + 3, no human bonus outside the top 3
    expect(delta(8, 140, 8, true)).toBe(-8); // a forfeit is 8th with no bonus
    expect(applyDelta(3, delta(8, 0, 1, true))).toBe(0);
  });

  it("floors the Final Score before the bonus bands", () => {
    expect([110, 110.99, 111, 120.5, 121, 130.99, 131, 200].map(scoreBonus)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("pays the human bonus by the humans seated at the start", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(humanBonus)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(rankDelta({ placement: 3, finalScore: 0, humanCount: 4, forfeited: false })).toEqual({ base: 2, scoreBonus: 0, humanBonus: 2, delta: 4 });
    expect(rankDelta({ placement: 4, finalScore: 0, humanCount: 8, forfeited: false }).humanBonus).toBe(0);
  });

  it("carries RP into the next season, once per season boundary", () => {
    expect([100, 150, 300, 600, 1000, 1500].map(carryOver)).toEqual([100, 120, 180, 300, 460, 660]);
    expect(carryOver(0)).toBe(60);
    expect(startingPoints(null, 5)).toBe(100);
    expect(startingPoints({ seasonId: 1, points: 600 }, 2)).toBe(300);
    expect(startingPoints({ seasonId: 1, points: 600 }, 3)).toBe(180); // skipped season 2: applied twice
  });

  it("places tier boundaries exactly", () => {
    for (const [i, tier] of TIERS.entries()) {
      expect(tierFor(tier.min)).toBe(tier.id);
      if (i) expect(tierFor(tier.min - 1)).toBe(TIERS[i - 1]!.id);
    }
    expect(tierFor(199)).toBe("HIGH_CARD");
    expect(tierFor(1499)).toBe("STRAIGHT_FLUSH");
    expect(tierFor(1500)).toBe("ROYAL_FLUSH");
  });

  it("numbers 28-day seasons from the epoch; earlier games count toward season 1", () => {
    expect(seasonAt(SEASON_EPOCH_MS - 1).id).toBe(1);
    expect(seasonAt(SEASON_EPOCH_MS).id).toBe(1);
    expect(seasonAt(SEASON_EPOCH_MS + SEASON_LENGTH_MS - 1).id).toBe(1);
    const second = seasonAt(SEASON_EPOCH_MS + SEASON_LENGTH_MS);
    expect(second).toEqual({ id: 2, startsAt: SEASON_EPOCH_MS + SEASON_LENGTH_MS, endsAt: SEASON_EPOCH_MS + 2 * SEASON_LENGTH_MS });
  });
});
