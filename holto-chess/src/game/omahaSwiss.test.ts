import { describe, expect, it, vi } from "vitest";
import * as poker from "../core/poker/evaluate";
import { assertPoolIntegrity } from "./cardPool";
import { createGame, prepareShowdown, resolvePrimary, resolveSurvival, startNextRound, toggleSelectedCard } from "./engine";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import { syncPresentation } from "./presentation";
import { addSession, createRoom } from "./room";
import { emptySwissRecord, swissPairs } from "./swiss";

function entry(seed = 100) {
  const state = createGame(seed);
  state.round = 2; state.phase = "NEXT_ROUND";
  for (const e of state.ownershipCardPool) { e.state = "AVAILABLE"; delete e.ownerPlayerId; delete e.reservedPlayerId; }
  state.players.forEach((p, i) => {
    p.ownedCardIds = state.ownershipCardPool.slice(i * 4, i * 4 + 4).map((e) => e.card.id);
    p.shopCardIds = []; p.selectedCardIds = []; p.points = 0;
    for (const id of p.ownedCardIds) {
      const e = state.ownershipCardPool.find((e) => e.card.id === id)!;
      e.state = "OWNED"; e.ownerPlayerId = p.id;
    }
  });
  return state;
}
function prepared(seed = 100) {
  const state = startNextRound(entry(seed));
  return prepareShowdown(state, state.players.map((p) => p.id));
}

describe("R3 Omaha Swiss", () => {
  it("uses only two holes preflop and exact 2+3 after the flop in public snapshots", () => {
    const before = entry();
    before.round = 3; before.phase = "SHOWDOWN_PRIMARY";
    const desired = ["5h", "Ah", "5s", "5d"];
    // Swap ownership to reproduce the reported hand without corrupting the pool.
    const me = before.players[0];
    for (let index = 0; index < desired.length; index++) {
      const wanted = desired[index];
      if (me.ownedCardIds.includes(wanted)) continue;
      const replaced = me.ownedCardIds.find((id) => !desired.includes(id))!;
      const owner = before.players.find((player) => player.ownedCardIds.includes(wanted));
      const targetEntry = before.ownershipCardPool.find((entry) => entry.card.id === wanted)!;
      const oldEntry = before.ownershipCardPool.find((entry) => entry.card.id === replaced)!;
      if (owner) {
        owner.ownedCardIds[owner.ownedCardIds.indexOf(wanted)] = replaced;
        oldEntry.ownerPlayerId = owner.id;
      } else {
        oldEntry.state = "AVAILABLE"; delete oldEntry.ownerPlayerId;
      }
      me.ownedCardIds[me.ownedCardIds.indexOf(replaced)] = wanted;
      targetEntry.state = "OWNED"; targetEntry.ownerPlayerId = me.id;
    }
    expect(assertPoolIntegrity(before)).toBe(true);
    const after = resolvePrimary(before);
    for (const match of after.roundResults.filter((m) => m.playerIds.includes(me.id))) {
      const snapshots = createMatchView(after, match).streetSnapshots![0];
      const preflop = snapshots[0].results.find((result) => result.playerId === me.id)!;
      expect(preflop).toMatchObject({ category: "PAIR", kickers: [5] });
      expect(preflop.usedCardIds).toHaveLength(2);
      for (const snapshot of snapshots.slice(1)) {
        const result = snapshot.results.find((entry) => entry.playerId === me.id)!;
        expect(result.usedCardIds.filter((id) => desired.includes(id))).toHaveLength(2);
        expect(result.usedCardIds.filter((id) => !desired.includes(id))).toHaveLength(3);
        const visible = match.boards[0].slice(0, snapshot.street === "FLOP" ? 3 : snapshot.street === "TURN" ? 4 : 5);
        expect(result.usedCardIds.every((id) => desired.includes(id) || visible.some((card) => card.id === id))).toBe(true);
      }
    }
  });
  it("restores three authoritative matches on reconnect without exposing other tables or server seeds", () => {
    let room = addSession(createRoom("ABCDEF", 100), "one").room;
    room = addSession(room, "two").room;
    room.status = "PLAYING"; room.game = prepared();
    const hidden = createPlayerView(room, "p1", [], 1000);
    expect(hidden.matches).toEqual([]);
    expect(hidden.me.ownedCards).toHaveLength(4);
    expect(hidden.me.loadoutSlots).toBeUndefined();
    expect("r3Seeds" in hidden).toBe(false);
    expect(hidden.players.every((p) => !("ownedCardIds" in p) && !("selectedCardIds" in p))).toBe(true);
    room.game = resolvePrimary(room.game);
    syncPresentation(room, 1000);
    const view = createPlayerView(room, "p1", [], 2000);
    expect(view.matches.map((m) => m.matchday)).toEqual([1, 2, 3]);
    expect(view.matches.every((m) => m.participantIds.includes("p1"))).toBe(true);
    expect(view.matches.every((m) => m.revealedCards.p1.length === 4)).toBe(true);
    expect(view.presentation?.matches).toHaveLength(3);
    expect(createPlayerView(JSON.parse(JSON.stringify(room)), "p1", [], 2000)).toEqual(view);
  });
  it("freezes Point then BB seeds at entry, before shop changes, with deterministic exact ties", () => {
    const before = entry();
    before.players.forEach((p, i) => { p.points = i < 4 ? 8 : 4; p.stackBB = i === 0 ? 500 : 20 + i; });
    const state = startNextRound(before);
    expect(state.r3Seeds).toEqual(["p1", "p4", "p3", "p2", "p8", "p7", "p6", "p5"]);
    state.players.forEach((p, i) => { p.stackBB = i * 1000; });
    const after = resolvePrimary(prepareShowdown(state, state.players.map((p) => p.id)));
    expect(after.roundResults.filter((m) => m.matchday === 1).map((m) => m.playerIds)).toEqual([
      ["p1", "p4"], ["p3", "p2"], ["p8", "p7"], ["p6", "p5"],
    ]);
    before.players.forEach((p) => { p.points = 5; p.stackBB = 50; });
    expect(startNextRound(before).r3Seeds).toEqual(startNextRound(structuredClone(before)).r3Seeds);
    expect(new Set(Array.from({ length: 8 }, (_, i) => startNextRound(entry(i + 1)).r3Seeds!.join())).size).toBeGreaterThan(1);
  });

  it.each([1, 17, 303, 707, 9001])("uses all four hole cards, exact 2+3, fresh excluded boards and three nonrepeating matches (seed %i)", (seed) => {
    const before = prepared(seed);
    expect(before.phase).toBe("SHOWDOWN_PRIMARY");
    expect(() => toggleSelectedCard(before, "p1", before.players[0].ownedCardIds[0])).toThrow(/R2/);
    const after = resolvePrimary(before);
    expect(after.roundResults).toHaveLength(12);
    expect(assertPoolIntegrity(after)).toBe(true);
    for (const day of [1, 2, 3]) {
      const matches = after.roundResults.filter((m) => m.matchday === day);
      expect(new Set(matches.flatMap((m) => m.playerIds)).size).toBe(8);
      const records = Object.fromEntries(matches.flatMap((m) => Object.entries(m.swissBefore!)));
      const history = after.roundResults.filter((m) => m.matchday! < day).map((m) => m.playerIds);
      if (day > 1) {
        const gap = (pairs: string[][]) => pairs.reduce((sum, [a, b]) => sum + (records[a].score - records[b].score) ** 2, 0);
        expect(gap(matches.map((m) => m.playerIds))).toBe(gap(swissPairs(before.players.map((p) => p.id), records, history)));
      }
    }
    for (const p of before.players) {
      const matches = after.roundResults.filter((m) => m.playerIds.includes(p.id));
      expect(new Set(matches.flatMap((m) => m.playerIds.filter((id) => id !== p.id))).size).toBe(3);
      for (const m of matches) expect(m.revealedCardIds[p.id]).toEqual(p.ownedCardIds);
      const record = matches.at(-1)!.swissAfter![p.id];
      expect(record.wins + record.draws + record.losses).toBe(3);
      expect(record.score).toBe(record.wins + record.draws * 0.5);
      const earned = after.players.find((x) => x.id === p.id)!.points - p.points;
      expect(earned).toBe(record.wins * 4 + record.draws * 2);
      expect(earned).toBeLessThanOrEqual(12);
    }
    for (const m of after.roundResults) {
      const owned = m.playerIds.flatMap((id) => m.revealedCardIds[id]);
      expect(owned).toHaveLength(8);
      expect(m.boards).toHaveLength(1);
      expect(new Set(m.boards[0].map((c) => c.id)).size).toBe(5);
      expect(m.boards[0].every((c) => !owned.includes(c.id))).toBe(true);
      for (const r of m.results) {
        expect(r.usedCardIds.filter((id) => m.revealedCardIds[r.playerId].includes(id))).toHaveLength(2);
        expect(r.usedCardIds.filter((id) => m.boards[0].some((c) => c.id === id))).toHaveLength(3);
      }
      expect(createMatchView(after, m).swissAfter).toEqual(m.swissAfter);
    }
    // Independent draws may overlap across matches, but must not reuse a board object.
    expect(new Set(after.roundResults.map((m) => m.boards[0])).size).toBe(12);
    expect(resolvePrimary(structuredClone(before))).toEqual(after);
  });

  it("pays only 10BB per win, 15/20/25BB for losses, and no win-streak or augment bonus", () => {
    const before = prepared();
    before.players.forEach((p) => { p.winStreak = 5; p.loseStreak = 0; p.augments = [{ id: "win_bonus", name: "test", description: "test" }]; });
    const fixed = poker.findBestFive(before.ownershipCardPool.slice(0, 5).map((e) => e.card));
    const spy = vi.spyOn(poker, "findBestOmaha").mockImplementation((hole) => ({
      ...fixed, kickers: [before.players.findIndex((p) => p.ownedCardIds.includes(hole[0].id))],
    }));
    try {
      const after = resolvePrimary(before);
      const losses = Object.fromEntries(before.players.map((p) => [p.id, 0]));
      for (const m of after.roundResults) for (const r of m.rewards!) {
        const won = m.winnerIds.includes(r.playerId);
        expect(r.deltaPoints).toBe(won ? 4 : 0);
        expect(r.deltaBB).toBe(won ? 10 : 15 + losses[r.playerId] * 5);
        losses[r.playerId] = won ? 0 : losses[r.playerId] + 1;
      }
      const undefeated = after.players.find((p) => p.winStreak === 8)!;
      expect(undefeated.points).toBe(12);
      const loser = after.players.find((p) => p.loseStreak === 3)!;
      expect(after.roundResults.flatMap((m) => m.rewards!).filter((r) => r.playerId === loser.id).map((r) => r.deltaBB)).toEqual([15, 20, 25]);
    } finally { spy.mockRestore(); }
  });

  it("awards split 2P/0BB, resets streaks and resolves the points-only survival boundary without rewards", () => {
    const before = prepared();
    before.players.forEach((p, i) => { p.winStreak = 3; p.loseStreak = 2; p.stackBB = i * 100; });
    const fixed = poker.findBestFive(before.ownershipCardPool.slice(0, 5).map((e) => e.card));
    const spy = vi.spyOn(poker, "findBestOmaha").mockReturnValue(fixed);
    try {
      const after = resolvePrimary(before);
      after.players.forEach((p, i) => {
        expect(p.points).toBe(6); expect(p.stackBB).toBe(before.players[i].stackBB);
        expect(p.winStreak).toBe(0); expect(p.loseStreak).toBe(0);
      });
      expect(after.roundResults.every((m) => m.rewards!.every((r) => r.deltaPoints === 2 && r.deltaBB === 0))).toBe(true);
      expect(after.survival?.playerIds).toHaveLength(8);
      expect(after.survival?.eliminateCount).toBe(2);
      after.phase = "SURVIVAL_READY";
      const survived = resolveSurvival(after);
      expect(survived.players.filter((p) => !p.eliminated)).toHaveLength(6);
      expect(survived.roundResults[0].rewards!.every((r) => r.deltaPoints === 0 && r.deltaBB === 0)).toBe(true);
    } finally { spy.mockRestore(); }
  });

  it("eliminates the cumulative points bottom two only on the third result, regardless of BB", () => {
    const before = prepared();
    before.players.forEach((p, i) => { p.points = i < 2 ? 0 : 100; p.stackBB = i < 2 ? 10000 : 10; });
    const after = resolvePrimary(before);
    expect(after.players.filter((p) => p.eliminated).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(after.players.filter((p) => !p.eliminated)).toHaveLength(6);
    expect(after.roundResults.filter((m) => m.matchday! < 3).every((m) => m.rewards!.every((r) => r.outcome !== "ELIMINATED"))).toBe(true);
    expect(after.roundResults.filter((m) => m.matchday === 3).flatMap((m) => m.rewards!).filter((r) => r.outcome === "ELIMINATED")).toHaveLength(2);
    expect(emptySwissRecord()).toEqual({ wins: 0, draws: 0, losses: 0, score: 0 });
  });
});
