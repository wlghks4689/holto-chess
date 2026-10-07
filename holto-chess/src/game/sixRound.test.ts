import { describe, expect, it } from "vitest";
import { assertPoolIntegrity } from "./cardPool";
import { cardPrice, handLimitFor, minHandFor, purchaseLimitFor, R3_AUCTION, regularShopSizeFor, rerollLimitFor, TRIPLE_RUN } from "./config";
import {
  autoChooseOpponent, autoPickAbility, autoPickDraft, beginSecondary, buyCard, chooseOpponent, completeDraft, completeOpponentSelect, createAbilityGame, createGame,
  finalStandings, finishAbilitySelection, finishCardAuctionReveal, getCard, isDraftRevealing, isOpponentRevealing, leaveRoundResult,
  lockRunLoadouts, openAbilitySelection, openDraft, pickDraftCard, prepareShowdown, resolvePrimary, resolveSecondary, resolveSurvival,
  burnCardIds, sellCard, setRunLoadout, startNextRound,
} from "./engine";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import type { RoomSnapshot } from "./room";
import { bidFinalAuction, settleFinalAuction } from "./finalAuction";
import { tickAuctionBots } from "./finalAuctionBot";
import type { PorenaGameState, Round } from "./types";

/** One engine step for a game with no human seats, mirroring what the room does on its timers. */
function step(state: PorenaGameState): PorenaGameState {
  switch (state.phase) {
    case "ABILITY_ORDER": return openAbilitySelection(state);
    case "ABILITY_PICK": return autoPickAbility(state);
    case "ABILITY_REVEAL": return finishAbilitySelection(state);
    case "SHOP": return prepareShowdown(state, []);
    case "DRAFT_ORDER": return openDraft(state);
    case "OPEN_DRAFT": return isDraftRevealing(state) ? completeDraft(state) : autoPickDraft(state, true);
    case "FINAL_AUCTION": {
      const auction = state.finalAuction!;
      if (auction.settledAt !== null) return finishCardAuctionReveal(state, auction.loadoutStartsAt!);
      let next = state;
      for (let now = auction.startedAt; now < auction.endsAt; now += 500) next = tickAuctionBots(next, [], now);
      return settleFinalAuction(next, next.finalAuction!.endsAt);
    }
    case "OPPONENT_SELECT": return isOpponentRevealing(state) ? completeOpponentSelect(state) : autoChooseOpponent(state);
    case "RUN_LOADOUT": return lockRunLoadouts(state, []);
    case "SHOWDOWN_PRIMARY": return resolvePrimary(state);
    case "GROUP_ASSIGNMENT": return beginSecondary(state);
    case "SHOWDOWN_SECONDARY": return resolveSecondary(state);
    case "SURVIVAL_READY": return resolveSurvival(state);
    case "ROUND_RESULT": return leaveRoundResult(state);
    case "NEXT_ROUND": return startNextRound(state, 1_000_000);
    default: throw new Error(`unhandled ${state.phase}`);
  }
}

function playUntil(start: PorenaGameState, done: (state: PorenaGameState) => boolean, seen?: (state: PorenaGameState) => void): PorenaGameState {
  let state = start;
  for (let guard = 0; !done(state); guard += 1) {
    if (guard > 400) throw new Error(`stuck at R${state.round} ${state.phase}`);
    state = step(state);
    assertPoolIntegrity(state);
    seen?.(state);
  }
  return state;
}

const alive = (state: PorenaGameState) => state.players.filter((p) => !p.eliminated);

// Whole games run the real bot brain for every seat.
describe("six-round format", { timeout: 120_000 }, () => {
  it("is the default for new games and keeps five-round games available", () => {
    expect(createGame(5).sixRounds).toBe(true);
    expect(createAbilityGame(5).sixRounds).toBe(true);
    expect(createGame(5, "seeded", 2, false, false).sixRounds).toBeUndefined();
    expect(createGame(5, "seeded", 1).sixRounds).toBeUndefined();
  });

  it("uses the agreed R5/R6 limits and keeps five-round values", () => {
    const six = { rulesVersion: 2 as const, sixRounds: true };
    expect([handLimitFor(5, six), minHandFor(5, six), purchaseLimitFor(5, six), rerollLimitFor(5, six), regularShopSizeFor(5, six)]).toEqual([6, 6, 3, 2, 3]);
    expect([handLimitFor(6, six), minHandFor(6, six), purchaseLimitFor(6, six), rerollLimitFor(6, six), regularShopSizeFor(6, six)]).toEqual([7, 5, 5, 2, 4]);
    expect(regularShopSizeFor(3, six)).toBe(0);
    expect([handLimitFor(5), purchaseLimitFor(5), rerollLimitFor(5), regularShopSizeFor(3)]).toEqual([7, 3, 3, 2]);
  });

  it.each([11, 2026, 90210])("plays seed %i from R1 to the three-way R6 final", (seed) => {
    const survivors: Partial<Record<Round, number>> = {};
    const end = playUntil(createAbilityGame(seed), (state) => state.phase === "GAME_RESULT", (state) => {
      if (state.phase === "ROUND_RESULT" && !state.survival) survivors[state.round] = alive(state).length;
    });
    expect(survivors).toEqual({ 1: 8, 2: 8, 3: 6, 4: 4, 5: 3 });
    expect(end.round).toBe(6);
    const final = end.roundResults[0]!;
    expect(final.stage).toBe("final");
    expect(final.playerIds).toHaveLength(3);
    // R6 plays a chosen five on one community board; extra cards are burned.
    expect(final.boards).toHaveLength(1);
    for (const id of final.playerIds) expect(final.revealedCardIds[id]).toHaveLength(5);
    const standings = finalStandings(end);
    expect(standings).toHaveLength(8);
    expect(standings.slice(0, 3).every((row) => row.eliminatedRound === undefined)).toBe(true);
    expect(standings[3]!.eliminatedRound).toBe(5);
    expect(standings.slice(4, 6).every((row) => row.eliminatedRound === 4)).toBe(true);
  });
});

describe("R3 card auction", { timeout: 60_000 }, () => {
  const toR3 = (seed: number) => playUntil(createGame(seed), (state) => state.round === 3);

  it("replaces the shop with a 16-card auction that opens after a ten-second intro", () => {
    const state = toR3(41);
    const auction = state.finalAuction!;
    expect(state.phase).toBe("FINAL_AUCTION");
    expect(auction.cardIds).toHaveLength(R3_AUCTION.cardCount);
    expect(auction.startedAt - 1_000_000).toBe(R3_AUCTION.introMs);
    expect(auction.maxWins).toBe(1);
    expect(auction.minRaiseBB).toBe(3);
    expect(alive(state).every((p) => p.shopCardIds.length === 0)).toBe(true);
    const card = auction.cardIds[0]!;
    expect(() => bidFinalAuction(state, "p1", { cardId: card, expectedHighestAmount: null }, auction.startedAt - 1)).toThrow("AUCTION_CLOSED");
  });

  it("allows one leading card per seat and a 3BB minimum raise", () => {
    let state = toR3(42);
    const auction = state.finalAuction!; const [first, second] = auction.cardIds;
    const open = auction.startedAt;
    state = bidFinalAuction(state, "p1", { cardId: first!, expectedHighestAmount: null }, open);
    expect(() => bidFinalAuction(state, "p1", { cardId: second!, expectedHighestAmount: null }, open)).toThrow("MAX_LEADING_REACHED");
    const base = cardPrice(getCard(state, first!).rank);
    expect(() => bidFinalAuction(state, "p2", { cardId: first!, expectedHighestAmount: base, amount: base + 2 }, open)).toThrow("BELOW_MIN_RAISE");
    state = bidFinalAuction(state, "p2", { cardId: first!, expectedHighestAmount: base, amount: base + 3 }, open);
    expect(state.finalAuction!.bids[first!]!.playerId).toBe("p2");
  });

  it("sells unsold cards at double price, in draft order, to seats that won nothing", () => {
    let state = toR3(43);
    const auction = state.finalAuction!; const card = auction.cardIds[0]!;
    state = bidFinalAuction(state, "p1", { cardId: card, expectedHighestAmount: null }, auction.startedAt);
    state = settleFinalAuction(state, auction.endsAt);
    expect(state.phase).toBe("FINAL_AUCTION");
    expect(state.players[0]!.ownedCardIds).toContain(card);
    expect(finishCardAuctionReveal(state, state.finalAuction!.loadoutStartsAt! - 1)).toBe(state);
    state = finishCardAuctionReveal(state, state.finalAuction!.loadoutStartsAt!);
    expect(state.phase).toBe("DRAFT_ORDER");
    expect(state.finalAuction).toBeUndefined();
    expect(state.draft!.priceMultiplier).toBe(2);
    expect(state.draft!.order.map((entry) => entry.playerId)).not.toContain("p1");
    expect(state.draft!.order).toHaveLength(7);
    const points = state.draft!.order.map((entry) => entry.points);
    expect(points).toEqual([...points].sort((a, b) => a - b));
    expect(state.draft!.cardIds).not.toContain(card);
    state = openDraft(state);
    const buyer = state.draft!.order[0]!.playerId; const pick = state.draft!.cardIds[0]!;
    const before = state.players.find((p) => p.id === buyer)!.stackBB;
    state = pickDraftCard(state, buyer, pick, true);
    expect(state.players.find((p) => p.id === buyer)!.stackBB).toBe(before - cardPrice(getCard(state, pick).rank) * 2);
    state = playUntil(state, (next) => next.phase !== "OPEN_DRAFT");
    expect(state.phase).toBe("SHOWDOWN_PRIMARY");
    expect(alive(state).every((p) => p.ownedCardIds.length === 4)).toBe(true);
  });

  it("sells the doubled card back at the base price rate", () => {
    const state = playUntil(toR3(44), (next) => next.round === 5 && next.phase === "SHOP");
    const seller = state.players.find((p) => !p.eliminated)!; const card = seller.ownedCardIds[0]!;
    const sold = sellCard(state, seller.id, card);
    expect(sold.players.find((p) => p.id === seller.id)!.stackBB - seller.stackBB).toBe(Math.floor(cardPrice(getCard(state, card).rank) * (seller.abilityId === "golden-hand" ? 1 : 0.6)));
  });
});

describe("R5 RUN IT THREE TIMES", { timeout: 60_000 }, () => {
  const toR5 = (seed: number) => playUntil(createGame(seed), (state) => state.round === 5);

  it("pays R4 to R5 income and lets the leader choose an opponent", () => {
    const before = playUntil(createGame(51), (state) => state.round === 4 && state.phase === "NEXT_ROUND");
    const state = startNextRound(before, 0);
    expect(state.phase).toBe("OPPONENT_SELECT");
    for (const p of alive(state)) expect(p.stackBB).toBe(before.players.find((x) => x.id === p.id)!.stackBB + 30);
    const pick = state.opponentSelect!;
    expect(pick.order).toHaveLength(4);
    expect(pick.chooserId).toBe(pick.order[0]);
    expect(() => chooseOpponent(state, pick.order[1]!, pick.order[2]!)).toThrow();
    expect(() => chooseOpponent(state, pick.chooserId, pick.chooserId)).toThrow();
    const chosen = chooseOpponent(state, pick.chooserId, pick.order[2]!);
    expect(isOpponentRevealing(chosen)).toBe(true);
    const shop = completeOpponentSelect(chosen);
    expect(shop.phase).toBe("SHOP");
    expect(alive(shop).every((p) => p.shopCardIds.length >= 3)).toBe(true);
    expect(autoChooseOpponent(state).opponentSelect!.opponentId).toBe(pick.order[3]);
  });

  it("plays the leader against the chosen seat and the other two against each other", () => {
    let state = toR5(52);
    const pick = state.opponentSelect!;
    state = completeOpponentSelect(chooseOpponent(state, pick.chooserId, pick.order[1]!));
    state = prepareShowdown(state, []);
    expect(state.phase).toBe("RUN_LOADOUT");
    expect(alive(state).every((p) => p.ownedCardIds.length === 6 && p.selectedCardIds.length === 6)).toBe(true);
    state = lockRunLoadouts(state, []);
    expect(state.primaryPairings).toEqual([[pick.chooserId, pick.order[1]], [pick.order[2], pick.order[3]]]);
    const placed = Object.fromEntries(state.players.map((p) => [p.id, [...p.selectedCardIds]]));
    state = resolvePrimary(state);
    expect(state.roundResults).toHaveLength(2);
    for (const match of state.roundResults) {
      expect(match.boards).toHaveLength(3);
      expect(match.runoutCount).toBe(3);
      expect(new Set(match.boards.flat().map((card) => card.id)).size).toBe(15);
      for (const id of match.playerIds) {
        const runs = match.runCards![id]!;
        expect(runs).toHaveLength(3);
        expect(runs.flat()).toEqual(placed[id]);
      }
    }
  });

  it("awards 5P a RUN, 2P a split and 15P for a 3:0 with no split", () => {
    for (let seed = 60; seed < 64; seed += 1) {
      let state = playUntil(toR5(seed), (next) => next.phase === "SHOWDOWN_PRIMARY");
      const before = Object.fromEntries(state.players.map((p) => [p.id, p.points]));
      state = resolvePrimary(state);
      for (const match of state.roundResults) for (const id of match.playerIds) {
        const won = match.boardWinnerIds.filter((ids) => ids.length === 1 && ids[0] === id).length;
        const split = match.boardWinnerIds.filter((ids) => ids.length > 1 && ids.includes(id)).length;
        const sweep = won === TRIPLE_RUN.runs ? TRIPLE_RUN.sweepBonus : 0;
        const ability = (state.abilityEvents ?? []).filter((event) => event.playerId === id && event.round === 5).reduce((sum, event) => sum + event.points, 0);
        expect(state.players.find((p) => p.id === id)!.points - before[id]!).toBe(won * 5 + split * 2 + sweep + ability);
      }
    }
  }, 120_000);

  it("eliminates the lowest total, using BB before a RUN-hand tiebreak", () => {
    let state = playUntil(toR5(80), (next) => next.phase === "SHOWDOWN_PRIMARY");
    const ids = alive(state).map((p) => p.id);
    // Force a clean ordering: the seat with the fewest points is out, even if it won its RUNs.
    state.players.forEach((p, i) => { if (!p.eliminated) { p.points = 100 + i * 50; p.stackBB = 50; } });
    const lowest = ids[0]!;
    state.players.find((p) => p.id === lowest)!.points = -100;
    state = resolvePrimary(state);
    expect(state.players.find((p) => p.id === lowest)!.eliminated).toBe(true);
    expect(state.players.find((p) => p.id === lowest)!.eliminatedRound).toBe(5);
    expect(state.players.find((p) => p.id === lowest)!.ownedCardIds).toEqual([]);
    expect(alive(state)).toHaveLength(3);
  });

  it("sends a points and BB tie to a tiebreak on the tied seats' RUN hands", () => {
    let state = playUntil(toR5(81), (next) => next.phase === "SHOWDOWN_PRIMARY");
    const [a, b, c, d] = alive(state);
    for (const p of [a!, b!, c!, d!]) { p.points = 0; p.stackBB = 70; }
    c!.points = 1000; d!.points = 1000; c!.stackBB = 10; d!.stackBB = 10;
    state = resolvePrimary(state);
    // Points after RUNs differ by results, so only check the boundary rule when the RUNs tied the bottom.
    const low = alive(state).sort((x, y) => x.points - y.points || x.stackBB - y.stackBB);
    if (state.survival) {
      expect(state.survival.eliminateCount).toBe(1);
      state = resolveSurvival(leaveRoundResult(state));
      const tiebreak = state.roundResults[0]!;
      expect(tiebreak.tiebreakKind).toBe("SURVIVAL_TIEBREAK");
      expect(tiebreak.runCards).toBeDefined();
      expect(alive(state)).toHaveLength(3);
    } else expect(low[0]!.points < low[1]!.points || low[0]!.stackBB < low[1]!.stackBB || state.players.filter((p) => p.eliminated && p.eliminatedRound === 5).length === 1).toBe(true);
  });

  it("accepts a six-card split as RUN 1, RUN 1, RUN 2, RUN 2, RUN 3, RUN 3", () => {
    let state = playUntil(toR5(82), (next) => next.phase === "RUN_LOADOUT");
    const me = alive(state)[0]!;
    const order = [...me.ownedCardIds].reverse();
    expect(() => setRunLoadout(state, me.id, order.slice(0, 3))).toThrow();
    state = setRunLoadout(state, me.id, order);
    state = lockRunLoadouts(state, [me.id]);
    expect(state.players.find((p) => p.id === me.id)!.selectedCardIds).toEqual(order);
  });
});

describe("R6 lineup and burn cards", { timeout: 60_000 }, () => {
  const toLineup = () => {
    const shop = playUntil(createGame(92), (next) => next.round === 6 && next.phase === "SHOP");
    const human = alive(shop)[0]!;
    return { human: human.id, state: prepareShowdown(shop, [human.id]) };
  };

  it("pre-selects the strongest five and opens the lineup step only for a human with more than five", () => {
    const { state, human } = toLineup();
    expect(state.phase).toBe("RUN_LOADOUT");
    for (const p of alive(state)) {
      expect(p.selectedCardIds).toHaveLength(Math.min(5, p.ownedCardIds.length));
      expect(p.selectedCardIds.every((id) => p.ownedCardIds.includes(id))).toBe(true);
    }
    const me = state.players.find((p) => p.id === human)!;
    expect(me.ownedCardIds.length).toBeGreaterThan(5);
    expect(burnCardIds(state, human)).toEqual(me.ownedCardIds.filter((id) => !me.selectedCardIds.includes(id)));
  });

  it("plays the chosen five on one board, burns the rest and shows burns but not opponents' five", () => {
    const start = toLineup(); const human = start.human; let state = start.state;
    const me = state.players.find((p) => p.id === human)!;
    const burned = burnCardIds(state, human);
    // Swap a burned card in: the lineup is the player's call, not the default.
    const lineup = [burned[0]!, ...me.selectedCardIds.slice(1)];
    expect(() => setRunLoadout(state, human, lineup.slice(0, 4))).toThrow();
    state = setRunLoadout(state, human, lineup);
    state = lockRunLoadouts(state, [human]);
    expect(state.phase).toBe("SHOWDOWN_PRIMARY");
    const room: RoomSnapshot = { schema: 1, roomId: "R6", revision: 0, status: "PLAYING", game: state,
      sessions: [{ playerId: human, tokenHash: "r6", requests: [] }], readyIds: [], endedShopIds: [] };
    const prep = createPlayerView(room, human).showdownPrep!;
    expect(prep.viewer.cards.map((card) => card.id)).toEqual(lineup);
    expect(prep.viewer.blockCards!.map((card) => card.id)).toEqual(me.ownedCardIds.filter((id) => !lineup.includes(id)));
    for (const seat of prep.opponents!) {
      expect(seat.cards).toHaveLength(5);
      expect(seat.cards.every((card) => card.hidden)).toBe(true);
      expect(seat.blockCards!.every((card) => !card.hidden)).toBe(true);
    }
    const end = resolvePrimary(state);
    const final = end.roundResults[0]!;
    expect(final.boards).toHaveLength(1);
    expect(final.revealedCardIds[human]).toEqual(lineup);
    const view = createMatchView(end, final);
    expect(view.blockCards![human]!.map((card) => card.id)).toEqual(me.ownedCardIds.filter((id) => !lineup.includes(id)));
    const row = finalStandings(end).find((entry) => entry.playerId === human)!;
    expect(row.cards.slice(0, 5).map((card) => card.id)).toEqual(lineup);
    expect(row.usedCardIds).toEqual(lineup);
  });
});

describe("R5/R6 shop assistance", { timeout: 60_000 }, () => {
  it("tops up a short human hand from its own shop when the shop closes", () => {
    let state = playUntil(createGame(91), (next) => next.round === 5 && next.phase === "SHOP");
    const human = alive(state)[0]!;
    // Sell down to four cards: two purchases short of the six R5 needs.
    for (const id of human.ownedCardIds.slice(0, 1)) state = sellCard(state, human.id, id);
    expect(state.players.find((p) => p.id === human.id)!.ownedCardIds).toHaveLength(4);
    state = prepareShowdown(state, [human.id]);
    expect(state.players.find((p) => p.id === human.id)!.ownedCardIds).toHaveLength(6);
  });

  it("buys toward the R6 minimum of five and accepts five to seven cards", () => {
    let state = playUntil(createGame(92), (next) => next.round === 6 && next.phase === "SHOP");
    const human = alive(state)[0]!;
    expect(human.ownedCardIds).toHaveLength(6);
    state = sellCard(state, human.id, human.ownedCardIds[0]!);
    state = sellCard(state, human.id, state.players.find((p) => p.id === human.id)!.ownedCardIds[0]!);
    expect(state.players.find((p) => p.id === human.id)!.ownedCardIds).toHaveLength(4);
    const shopCard = state.players.find((p) => p.id === human.id)!.shopCardIds[0]!;
    state = buyCard(state, human.id, shopCard);
    const done = prepareShowdown(state, [human.id]);
    expect(done.players.find((p) => p.id === human.id)!.ownedCardIds).toHaveLength(5);
    expect(done.phase).toBe("SHOWDOWN_PRIMARY");
  });
});
