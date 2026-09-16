import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { createGame, getCard } from "./engine";
import { createShowdownDeck, drawCommunityBoards } from "./showdownDeck";

describe("match-scoped showdown deck", () => {
  it("excludes every card owned by the encounter participants", () => {
    const deck = makeDeck();
    const excluded = [deck.find((card) => card.id === "As")!, deck.find((card) => card.id === "Ks")!, deck.find((card) => card.id === "Qh")!, deck.find((card) => card.id === "Qd")!];
    const showdownDeck = createShowdownDeck(excluded, () => 0.5);
    expect(showdownDeck).toHaveLength(48);
    expect(showdownDeck.some((card) => excluded.some((owned) => owned.id === card.id))).toBe(false);
  });

  it("supports the eight-card exclusion required by an Omaha heads-up", () => {
    const owned = makeDeck().slice(0, 8);
    const showdownDeck = createShowdownDeck(owned, () => 0.4);
    expect(showdownDeck).toHaveLength(44);
    expect(showdownDeck.some((card) => owned.some((excluded) => excluded.id === card.id))).toBe(false);
  });

  it("draws Run It Twice boards from one deck without overlap", () => {
    const boards = drawCommunityBoards(createShowdownDeck(makeDeck().slice(0, 6), () => 0.25), 2);
    expect(boards[0]).toHaveLength(5); expect(boards[1]).toHaveLength(5);
    expect(new Set(boards.flat().map((card) => card.id)).size).toBe(10);
  });

  it("keeps reservations and cards owned by outsiders eligible", () => {
    const state = createGame(91); const participants = state.players.slice(0, 2);
    const participantOwned = participants.flatMap((player) => player.ownedCardIds.map((id) => getCard(state, id)));
    const reservedId = participants[0]!.shopCardIds[0]!;
    const outsiderOwnedId = state.players[2]!.ownedCardIds[0]!;
    const candidateIds = new Set(createShowdownDeck(participantOwned, () => 0.75).map((card) => card.id));
    expect(candidateIds.has(reservedId)).toBe(true);
    expect(candidateIds.has(outsiderOwnedId)).toBe(true);
  });
});
