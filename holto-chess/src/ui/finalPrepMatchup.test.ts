import { describe, expect, it } from "vitest";
import { finalPrepMatchup } from "./finalPrepMatchup";

describe("final loading public identities", () => {
  const seats = [2,3,4,5].map(i => ({ playerId:`p${i}`,name:`PLAYER ${i}`,points:i }));
  it("shows the four finalists even when the original viewer was eliminated", () => {
    const view=finalPrepMatchup(seats,"p1")!;
    expect([view.viewer,...view.opponents!].map(p=>p.playerId)).toEqual(["p2","p3","p4","p5"]);
    expect([view.viewer,...view.opponents!].every(p=>p.cards.length===0)).toBe(true);
  });
  it("preserves a surviving perspective without duplicating it", () => {
    const view=finalPrepMatchup(seats,"p4")!;
    expect(view.viewer.playerId).toBe("p4");
    expect(view.opponents!.map(p=>p.playerId)).toEqual(["p2","p3","p5"]);
  });
});
