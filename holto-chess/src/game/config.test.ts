import { describe, expect, it } from "vitest";
import { cardPrice } from "./config";

describe("card prices", () => {
  it("uses the approved low-rank price curve", () => {
    expect(cardPrice(2)).toBe(2);
    expect(cardPrice(3)).toBe(3);
    expect(cardPrice(4)).toBe(4);
    expect(cardPrice(5)).toBe(5);
  });
});
