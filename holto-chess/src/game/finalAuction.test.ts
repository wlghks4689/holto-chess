import { describe, expect, it } from "vitest";
import { makeDeck } from "../core/poker/cards";
import { compareHands, findBestFive } from "../core/poker/evaluate";
import { createGame, startNextRound, finishFinalLoadouts, resolvePrimary, finalStandings } from "./engine";
import { auctionBudget, bestFinalLoadout, bidFinalAuction, settleFinalAuction, setFinalLoadout } from "./finalAuction";
import { assertPoolIntegrity } from "./cardPool";
import { madeAbilityReward, quadCorePlacementBonus } from "./abilities";
import { cardPrice, FINAL_AUCTION_DURATION_MS, FINAL_AUCTION_HARD_CAP_MS, FINAL_EQUITY_SAMPLES } from "./config";
import { createPlayerView } from "./playerView";
import { createRoom, barrierDeadline, forceBarrier, applyRoomAction, turnKey, migrateRoomSnapshot } from "./room";
import { finalFourWayEquity, scoreUnrestricted } from "./showdownEquity";
import { createMatchView } from "./matchView";
import { discloseMatch } from "./disclosure";
import { cinematicTimeline } from "../shared/presentationTimeline";
import { parseClientMessage } from "../shared/protocol";

const NOW = 10_000;
function fixture() {
  const game = createGame(42, "seeded", 2, false, false);
  game.round = 4; game.phase = "NEXT_ROUND";
  game.ownershipCardPool.forEach(e => { e.state = "AVAILABLE"; delete e.ownerPlayerId; delete e.reservedPlayerId; });
  game.players.forEach((p, i) => {
    p.eliminated = i >= 4; p.ownedCardIds = []; p.shopCardIds = []; p.lockedShopCardIds = []; p.stackBB = 100;
    if (i < 4) for (const e of game.ownershipCardPool.slice(i * 5, i * 5 + 5)) { e.state = "OWNED"; e.ownerPlayerId = p.id; p.ownedCardIds.push(e.card.id); }
  });
  return startNextRound(game, NOW);
}
const first = (g: ReturnType<typeof fixture>, playerId = "p1", index = 0, now = NOW) => bidFinalAuction(g, playerId, { cardId: g.finalAuction!.cardIds[index]!, expectedHighestAmount: null }, now);

describe("R5 final auction contracts", () => {
  it("enters with no income, no shop reservations, and all 32 available singleton cards", () => {
    const g = fixture(); expect(g.phase).toBe("FINAL_AUCTION"); expect(g.players[0]!.stackBB).toBe(100);
    expect(g.finalAuction!.cardIds).toHaveLength(32); expect(g.players.every(p => !p.shopCardIds.length)).toBe(true);
    expect(g.finalAuction!.endsAt - NOW).toBe(FINAL_AUCTION_DURATION_MS); expect(g.finalAuction!.hardEndsAt - NOW).toBe(FINAL_AUCTION_HARD_CAP_MS);
    expect(assertPoolIntegrity(g)).toBe(true);
  });
  it("escrows base price, rejects own raises, frees budget and slot on outbid", () => {
    const g = first(fixture()), id = g.finalAuction!.cardIds[0]!, amount = g.finalAuction!.bids[id]!.amount;
    expect(g.players[0]!.stackBB).toBe(100); expect(auctionBudget(g, "p1").reservedBB).toBe(amount);
    expect(() => bidFinalAuction(g, "p1", { cardId: id, expectedHighestAmount: amount, amount: amount + 5 }, NOW)).toThrow("ALREADY_LEADING");
    const next = bidFinalAuction(g, "p2", { cardId: id, expectedHighestAmount: amount, amount: amount + 6 }, NOW);
    expect(auctionBudget(next, "p1")).toMatchObject({ reservedBB: 0, leadingCount: 0, availableBidBB: 100 });
    expect(next.finalAuction!.outbid.p1).toMatchObject({ cardId: id, amount });
  });
  it("enforces max two, reservation affordability, exact base price and integer raises", () => {
    let g = fixture(); const id = g.finalAuction!.cardIds[0]!, rank = g.ownershipCardPool.find(e => e.card.id === id)!.card.rank;
    expect(() => bidFinalAuction(g, "p1", { cardId: id, expectedHighestAmount: null, amount: cardPrice(rank) + 1 }, NOW)).toThrow("INVALID_AMOUNT");
    g = first(first(g), "p1", 1);
    expect(() => first(g, "p1", 2)).toThrow("MAX_LEADING_REACHED");
    for (const amount of [-1, NaN, 1.5]) expect(() => bidFinalAuction(g, "p2", { cardId: id, expectedHighestAmount: g.finalAuction!.bids[id]!.amount, amount }, NOW)).toThrow("INVALID_AMOUNT");
    const poor = fixture(); poor.players[0]!.stackBB = 0; expect(() => first(poor)).toThrow("INSUFFICIENT_BB");
  });
  it.each([5, 6, 17])("accepts a %i BB raise", raise => {
    const g = first(fixture()), id = g.finalAuction!.cardIds[0]!, amount = g.finalAuction!.bids[id]!.amount;
    expect(bidFinalAuction(g, "p2", { cardId: id, expectedHighestAmount: amount, amount: amount + raise }, NOW).finalAuction!.bids[id]!.amount).toBe(amount + raise);
  });
  it("serializes equal-price races and never extends rejected bids", () => {
    const g = first(fixture()), id = g.finalAuction!.cardIds[0]!, amount = g.finalAuction!.bids[id]!.amount;
    expect(() => bidFinalAuction(g, "p2", { cardId: id, expectedHighestAmount: amount, amount: amount + 4 }, NOW)).toThrow("BELOW_MIN_RAISE");
    const next = bidFinalAuction(g, "p2", { cardId: id, expectedHighestAmount: amount, amount: amount + 5 }, g.finalAuction!.endsAt - 1);
    const snapshot = structuredClone(next);
    expect(() => bidFinalAuction(next, "p3", { cardId: id, expectedHighestAmount: amount, amount: amount + 5 }, next.finalAuction!.endsAt - 1)).toThrow("STALE_PRICE");
    expect(next).toEqual(snapshot);
  });
  it("extends only in last three seconds and caps at 55 seconds", () => {
    let g = first(fixture(), "p1", 0, NOW + 36_000); const id = g.finalAuction!.cardIds[0]!;
    expect(g.finalAuction!.endsAt).toBe(NOW + 40_000);
    for (let i = 0; i < 8; i++) {
      const a = g.finalAuction!, current = a.bids[id]!;
      g.players.forEach(p => { p.stackBB = 1000; });
      g = bidFinalAuction(g, current.playerId === "p1" ? "p2" : "p1", { cardId: id, expectedHighestAmount: current.amount, amount: current.amount + 5 }, a.endsAt - 1);
    }
    expect(g.finalAuction!.endsAt).toBe(NOW + 55_000);
    expect(() => first(g, "p3", 1, g.finalAuction!.endsAt)).toThrow("AUCTION_CLOSED");
  });
  it("settles once and derives reveal/loadout clocks from server time", () => {
    const g = first(first(fixture()), "p2", 1), before = g.players.map(p => p.stackBB);
    const next = settleFinalAuction(g, g.finalAuction!.endsAt);
    expect(next.finalAuction!.loadoutStartsAt).toBe(g.finalAuction!.endsAt + 3000);
    for (const [i, p] of next.players.entries()) expect(p.stackBB).toBe(before[i]! - auctionBudget(g, p.id).reservedBB);
    expect(settleFinalAuction(next, 999999)).toBe(next); expect(assertPoolIntegrity(next)).toBe(true);
    expect(next.players[0]!.ownedCardIds).toHaveLength(6);
    const empty = fixture(), settled = settleFinalAuction(empty, empty.finalAuction!.endsAt);
    expect(settled.finalAuction!.loadoutStartsAt).toBe(settled.finalAuction!.settledAt);
    expect(finishFinalLoadouts(settled, settled.finalAuction!.loadoutStartsAt!).phase).toBe("SHOWDOWN_PRIMARY");
  });
  it("keeps bidding identities and opponent reservations out of player and spectator snapshots", () => {
    const room = createRoom("TEST", 1, "seeded", 2, false, false); room.status = "PLAYING"; room.game = first(fixture());
    room.sessions = ["p1", "p2", "p5"].map(playerId => ({ playerId, tokenHash: playerId, requests: [] }));
    for (const id of ["p1", "p2", "p5"]) {
      const view = createPlayerView(room, id, [], NOW), a = view.finalAuction!;
      expect(JSON.stringify(a.cards)).not.toMatch(/playerId|sequence|bidder/i);
      expect(a.cards[0]!.isMine).toBe(id === "p1");
      expect(a.settlement).toBeUndefined();
      expect(JSON.stringify(view)).not.toContain('"bids"');
      if (id === "p5") expect(a.mine).toBeUndefined();
    }
    room.game = settleFinalAuction(room.game, NOW + 40_000);
    expect(createPlayerView(room, "p2", [], NOW + 40_000).finalAuction!.settlement!.results[0]!.playerId).toBe("p1");
  });
  it("hides loadouts until every lock, rejects duplicates, and excludes all OWNED from the board", () => {
    let g = settleFinalAuction(first(fixture()), NOW + 40_000); const t = g.finalAuction!.loadoutStartsAt!;
    const ids = g.players[0]!.ownedCardIds.slice(0, 5);
    expect(() => setFinalLoadout(g, "p1", Array(5).fill(ids[0]), t)).toThrow("INVALID_LOADOUT");
    expect(() => setFinalLoadout(g, "p1", ids, t - 1)).toThrow("LOADOUT_CLOSED");
    g = setFinalLoadout(g, "p1", ids, t, true);
    const prepared = finishFinalLoadouts(g, t);
    expect(prepared.phase).toBe("SHOWDOWN_PRIMARY");
    const result = resolvePrimary(prepared), owned = new Set(result.players.flatMap(p => p.ownedCardIds));
    expect(result.roundResults[0]!.boards).toHaveLength(1);
    expect(result.roundResults[0]!.boards[0]!.every(c => !owned.has(c.id))).toBe(true);
    for (const row of result.roundResults[0]!.results) expect(compareHands(row.hand, findBestFive([...prepared.players.find(p => p.id === row.playerId)!.finalLoadoutCardIds!.map(id => prepared.ownershipCardPool.find(e => e.card.id === id)!.card), ...result.roundResults[0]!.boards[0]!]))).toBe(0);
    expect(finalStandings(result).slice(0, 4).every(s => s.handScore >= 0)).toBe(true);
  });
  it("never reveals future board results or ability cues before river", () => {
    const g = fixture(), settled = settleFinalAuction(g, NOW + 40_000), result = resolvePrimary(finishFinalLoadouts(settled, NOW + 40_000));
    const view = createMatchView(result, result.roundResults[0]!), frames = cinematicTimeline(view);
    const safe = discloseMatch(view, { matchId: view.id, offsetMs: 0, durationMs: frames.at(-1)!.at }, NOW, NOW + frames.find(f => f.phase === "TURN")!.at)!;
    expect(safe.results).toEqual([]); expect(safe.boards[0]![4]!.hidden).toBe(true); expect(safe.abilityCues).toEqual([]);
  });
  it("keeps old R5 snapshots unchanged", () => {
    const room = createRoom("LEGACY", 1, "seeded", 2, false, false); room.game.round = 5; room.game.phase = "SHOP"; room.status = "PLAYING";
    expect(migrateRoomSnapshot(room).game.finalAuction).toBeUndefined();
  });
  it("drives an online deadline without READY and rejects READY during auction", () => {
    const room = createRoom("TEST", 1, "seeded", 2, false, false); room.status = "PLAYING"; room.game = fixture();
    room.sessions = room.game.players.slice(0, 4).map(p => ({ playerId: p.id, tokenHash: p.id, requests: [] }));
    expect(barrierDeadline(room)).toBe(NOW + 40_000);
    expect(forceBarrier(room, NOW + 39_999)).toBeNull();
    expect(() => applyRoomAction(room, "p1", { type: "READY" }, turnKey(room), NOW)).toThrow();
    expect(forceBarrier(room, NOW + 40_000)!.game.phase).toBe("SHOWDOWN_PRIMARY");
  });
  it("uses the strongest five with original-card tie preference", () => {
    const deck = makeDeck(), ids = ["As", "Ah", "Ad", "Ac", "Ks", "Kh", "2s"], cards = ids.map(id => deck.find(c => c.id === id)!);
    expect(bestFinalLoadout(cards, ids.slice(0, 5))).toContain("Ks"); expect(bestFinalLoadout(cards, ids.slice(0, 5))).not.toContain("Kh");
  });
  it("four-way equity is deterministic, permutation invariant and shares ties", () => {
    const g = fixture(), hands = g.players.slice(0, 4).map(p => p.ownedCardIds.map(id => g.ownershipCardPool.find(e => e.card.id === id)!.card));
    const t = performance.now(), a = finalFourWayEquity(hands);
    console.info(`R5 equity ${FINAL_EQUITY_SAMPLES} samples: ${(performance.now() - t).toFixed(1)}ms`);
    expect(finalFourWayEquity([...hands].reverse())).toEqual([...a].reverse()); expect(a.reduce((s, n) => s + n, 0)).toBeCloseTo(100, 7);
    expect(finalFourWayEquity(hands)).toEqual(a);
  });
  it("ten-card fast ranking agrees with exact evaluator including dual flushes", () => {
    const deck = makeDeck();
    for (let i = 0; i < 60; i++) {
      const a = Array.from({ length: 10 }, (_, j) => deck[(i * 7 + j * 11) % 52]!);
      const b = Array.from({ length: 10 }, (_, j) => deck[(i * 3 + j * 9) % 52]!);
      expect(Math.sign(scoreUnrestricted(a) - scoreUnrestricted(b))).toBe(Math.sign(compareHands(findBestFive(a), findBestFive(b))));
    }
  });
  it("strict protocol accepts arbitrary integer raises and has no withdrawal action", () => {
    const base = { requestId: "abcdefgh", turnKey: "5:FINAL_AUCTION" };
    expect(parseClientMessage(JSON.stringify({ ...base, type: "FINAL_AUCTION_BID", cardId: "As", expectedHighestAmount: 20, amount: 26 })).type).toBe("FINAL_AUCTION_BID");
    expect(() => parseClientMessage(JSON.stringify({ ...base, type: "FINAL_AUCTION_BID", cardId: "As" }))).toThrow();
    expect(() => parseClientMessage(JSON.stringify({ ...base, type: "FINAL_AUCTION_WITHDRAW", cardId: "As" }))).toThrow();
  });
});

describe("final auction edge cases", () => {
  it("supports all eight wins, keeps unselected cards owned and charges full price with Royal Blood", () => {
    let g = fixture(); g.players[0]!.abilityId = "royal-blood";
    const previous = g.abilityEvents?.length ?? 0;
    for (let seat = 0; seat < 4; seat++) for (let slot = 0; slot < 2; slot++) g = first(g, `p${seat + 1}`, seat * 2 + slot);
    g = settleFinalAuction(g, g.finalAuction!.endsAt);
    expect(g.finalAuction!.results).toHaveLength(8);
    expect(g.players.slice(0, 4).every(p => p.ownedCardIds.length === 7)).toBe(true);
    expect(g.ownershipCardPool.filter(e => e.state === "AVAILABLE")).toHaveLength(24);
    expect(g.abilityEvents?.length ?? 0).toBe(previous);
    const room = createRoom("PRIVATE", 1, "seeded", 2, false, false); room.game = g; room.status = "PLAYING"; room.sessions = [{ playerId: "p2", tokenHash: "p2", requests: [] }];
    const privateBefore = createPlayerView(room, "p2", [], g.finalAuction!.loadoutStartsAt!);
    g = setFinalLoadout(g, "p1", g.players[0]!.ownedCardIds.slice(2, 7), g.finalAuction!.loadoutStartsAt!);
    room.game = g;
    expect(createPlayerView(room, "p2", [], g.finalAuction!.loadoutStartsAt!)).toEqual(privateBefore);
    const prepared = finishFinalLoadouts(g, g.finalAuction!.loadoutEndsAt!, ["p1", "p2", "p3", "p4"]);
    expect(prepared.players.slice(0, 4).every(p => p.finalLoadoutLocked)).toBe(true);
    expect(assertPoolIntegrity(resolvePrimary(prepared))).toBe(true);
  });
  it("preserves existing forfeits without fabricating missing cards", () => {
    const g = fixture(), p = g.players[0]!, removed = p.ownedCardIds.pop()!;
    const entry = g.ownershipCardPool.find(e => e.card.id === removed)!; entry.state = "AVAILABLE"; delete entry.ownerPlayerId;
    g.finalAuction!.cardIds.push(removed);
    const settled = settleFinalAuction(g, g.finalAuction!.endsAt);
    const result = resolvePrimary(finishFinalLoadouts(settled, settled.finalAuction!.loadoutEndsAt!));
    expect(result.players[0]!.ownedCardIds).toHaveLength(4);
    expect(result.roundResults[0]!.results.find(r => r.playerId === "p1")!.hand.categoryRank).toBe(0);
  });
  it("evaluates board-made ability hands without changing their rewards", () => {
    const cards = (ids: string[]) => ids.map(id => makeDeck().find(c => c.id === id)!);
    const p = fixture().players[0]!;
    p.abilityId = "underdog";
    const wheel = findBestFive(cards(["As", "2s", "3d", "4h", "5c", "Kh", "9d", "8c", "7h", "Qs"]));
    expect(madeAbilityReward(p, wheel, 5).points).toBe(20);
    p.abilityId = "quad-core";
    expect(quadCorePlacementBonus(p, findBestFive(cards(["As", "Ah", "Ad", "Ac", "Ks", "2s", "3d", "4h", "5c", "9h"])), 5, 12)).toBe(12);
  });
});
