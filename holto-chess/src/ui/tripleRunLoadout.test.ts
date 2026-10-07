import { describe, expect, it } from "vitest";
import { swapPlacement, swapRuns, tripleRunOrder } from "./tripleRunLoadout";

describe("R5 RUN placement", () => {
  const owned = ["As", "Ad", "Kh", "Qh", "9c", "8c"];
  it("keeps a complete saved split and falls back to the owned order otherwise", () => {
    const split = ["Kh", "Qh", "As", "Ad", "9c", "8c"];
    expect(tripleRunOrder(split, owned)).toEqual(split);
    expect(tripleRunOrder(split.slice(0, 4), owned)).toEqual(owned);
    expect(tripleRunOrder(["Kh", "Kh", "As", "Ad", "9c", "8c"], owned)).toEqual(owned);
    expect(tripleRunOrder([...split.slice(0, 5), "2d"], owned)).toEqual(owned);
  });
  it("swaps two positions across RUNs", () => {
    expect(swapPlacement(owned, 1, 4)).toEqual(["As", "9c", "Kh", "Qh", "Ad", "8c"]);
    expect(swapPlacement(owned, 2, 2)).toEqual(owned);
  });
  it("swaps whole neighbouring RUNs without reordering their pairs", () => {
    expect(swapRuns(owned, 0, 1)).toEqual(["Kh", "Qh", "As", "Ad", "9c", "8c"]);
    expect(swapRuns(owned, 1, 2)).toEqual(["As", "Ad", "9c", "8c", "Kh", "Qh"]);
  });
});
