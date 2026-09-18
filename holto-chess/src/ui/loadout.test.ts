import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { LoadoutSockets } from "./LoadoutSockets";
import { clickLoadout, loadoutFromSelection, placeCard, selectionFromLoadout, type LoadoutClick, type LoadoutState } from "./loadout";

const empty: LoadoutState = { slots: [null, null, null, null], focus: null };
const run = (clicks: LoadoutClick[], start = empty) => clicks.reduce(clickLoadout, start);
const card = (cardId: string): LoadoutClick => ({ kind: "card", cardId });
const slot = (index: number): LoadoutClick => ({ kind: "slot", index });

describe("R3 loadout sockets", () => {
  it("places a card in the socket clicked next, in either order", () => {
    expect(run([card("Kc"), slot(2)]).slots).toEqual([null, null, "Kc", null]);
    expect(run([slot(1), card("2d")]).slots).toEqual([null, "2d", null, null]);
    expect(run([card("Kc"), slot(2)]).focus).toBeNull();
  });

  it("fills Game 2 before Game 1 without caring about click order", () => {
    const state = run([card("Kc"), slot(2), card("Ks"), slot(3), card("2d"), slot(0), card("2h"), slot(1)]);
    // Server contract: first two ids are Game 1, last two Game 2.
    expect(selectionFromLoadout(state.slots)).toEqual(["2d", "2h", "Kc", "Ks"]);
  });

  it("moves a socketed card and swaps with whatever occupies the target", () => {
    const full: LoadoutState = { slots: ["2d", "2h", "Kc", "Ks"], focus: null };
    expect(run([slot(0), slot(2)], full).slots).toEqual(["Kc", "2h", "2d", "Ks"]);
    const partial: LoadoutState = { slots: ["2d", null, null, null], focus: null };
    expect(run([slot(0), slot(3)], partial).slots).toEqual([null, null, null, "2d"]);
  });

  it("sends a displaced card back to the hand when the incoming card came from the hand", () => {
    expect(placeCard(["2d", null, null, null], "Kc", 0)).toEqual(["Kc", null, null, null]);
  });

  it("returns a socketed card to the hand and treats repeat clicks as cancel", () => {
    const state: LoadoutState = { slots: ["2d", "2h", null, null], focus: null };
    expect(run([slot(1), { kind: "hand" }], state).slots).toEqual(["2d", null, null, null]);
    expect(run([card("Kc"), card("Kc")]).focus).toBeNull();
    expect(run([slot(2), slot(2)]).focus).toBeNull();
    expect(selectionFromLoadout(["2d", null, "Kc", "Ks"])).toBeNull();
  });

  it("restores only a complete, owned selection", () => {
    const owned = ["2d", "2h", "Kc", "Ks"];
    expect(loadoutFromSelection(["2d", "2h", "Kc", "Ks"], owned)).toEqual(owned);
    expect(loadoutFromSelection(["2d", "2h"], owned)).toEqual([null, null, null, null]);
    expect(loadoutFromSelection(["2d", "2h", "Kc", "As"], owned)).toEqual([null, null, null, null]);
  });

  it("renders two Game sockets with two slots each and the unassigned cards in the hand", () => {
    const cards = makeDeck().slice(0, 4);
    const html = renderToStaticMarkup(createElement(LoadoutSockets, { cards, selectedCardIds: [], onChange: () => {} }));
    expect(html.match(/class="loadout-game /g)).toHaveLength(2);
    expect(html.match(/loadout-empty/g)).toHaveLength(4);
    expect(html).toContain("GAME 1");
    expect(html).toContain("GAME 2");
    const saved = renderToStaticMarkup(createElement(LoadoutSockets, { cards, selectedCardIds: cards.map((c) => c.id), onChange: () => {} }));
    expect(saved).toContain("모든 카드가 배정되었습니다");
    expect(saved).not.toContain("loadout-empty");
  });
});
