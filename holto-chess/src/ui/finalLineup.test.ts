import { describe, expect, it } from "vitest";
import { lineupOf, swapLineup } from "./finalLineup";

describe("R6 lineup", () => {
  const owned = ["As", "Ad", "Kh", "Qh", "9c", "8c", "2d"];
  it("keeps a valid saved five and falls back to the first five owned", () => {
    expect(lineupOf(["Kh", "Qh", "As", "Ad", "9c"], owned)).toEqual(["Kh", "Qh", "As", "Ad", "9c"]);
    expect(lineupOf(["Kh", "Qh"], owned)).toEqual(owned.slice(0, 5));
    expect(lineupOf(["Kh", "Kh", "As", "Ad", "9c"], owned)).toEqual(owned.slice(0, 5));
    expect(lineupOf(["Kh", "Qh", "As", "Ad", "3s"], owned)).toEqual(owned.slice(0, 5));
  });
  it("swaps a burned card into the played card's slot", () => {
    expect(swapLineup(["As", "Ad", "Kh", "Qh", "9c"], "Qh", "2d")).toEqual(["As", "Ad", "Kh", "2d", "9c"]);
  });
});
