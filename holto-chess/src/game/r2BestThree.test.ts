import { describe, expect, it } from "vitest";
import { findBestFive } from "../core/poker/evaluate";
import { BARRIER_TIMEOUT_MS } from "../shared/barrierTimeouts";
import { cinematicTimeline, presentationDurationMs } from "../shared/presentationTimeline";
import { assertPoolIntegrity } from "./cardPool";
import { BALANCE } from "./config";
import { discloseMatch } from "./disclosure";
import {
  autoPickDraft, completeR2Briefing, createAbilityGame, createGame, getCard, leaveRoundResult, lockRunLoadouts, openDraft,
  prepareShowdown, resolvePrimary, setRunLoadout, startNextRound,
} from "./engine";
import { createMatchView } from "./matchView";
import { createPlayerView } from "./playerView";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, turnKey, type RoomSnapshot } from "./room";
import { avoidingPairs, emptySwissRecord } from "./swiss";
import type { MatchResult, PorenaGameState } from "./types";

/** R1 under the bot brain, then the R2 draft; `legacy` is a room saved before R2 BEST FIVE. */
function drafted(seed = 789, sixRounds = true, legacy = false): PorenaGameState {
  const created = createGame(seed, "seeded", 2, false, sixRounds);
  if (legacy) delete created.r2BestThree;
  let g = resolvePrimary(prepareShowdown(created, []));
  g = openDraft(startNextRound(leaveRoundResult(g)));
  while (g.phase === "OPEN_DRAFT") g = autoPickDraft(g);
  return g;
}
const r1Pairs = (g: PorenaGameState) => g.matches.filter((match) => match.matchday && !match.runCards).map((match) => match.playerIds);
const met = (pairs: string[][], a: string, b: string) => pairs.some((pair) => pair.includes(a) && pair.includes(b));
const owned = (g: PorenaGameState, id: string) => g.players.find((p) => p.id === id)!.ownedCardIds;
const r2Matches = (g: PorenaGameState): MatchResult[] => g.roundResults;

describe("R2 BEST FIVE rules marker", () => {
  it("marks every new game, five or six rounds, and leaves version 1 and saved rooms on the old R2", () => {
    expect(createGame(1).r2BestThree).toBe(true);
    expect(createGame(1, "seeded", 2, false, false).r2BestThree).toBe(true);
    expect(createAbilityGame(1).r2BestThree).toBe(true);
    expect(createGame(1, "seeded", 1).r2BestThree).toBeUndefined();
    expect(drafted(789, true, true).phase).toBe("RUN_LOADOUT");
  });
});

describe("R2 BEST FIVE resolution", () => {
  it.each([[789, true], [11, false], [2026, true]] as const)("plays all three cards on both RUNs as the best five of eight (seed %i)", (seed, sixRounds) => {
    const brief = drafted(seed, sixRounds);
    expect(brief.phase).toBe("R2_BRIEFING");
    const g = resolvePrimary(completeR2Briefing(brief));
    expect(r2Matches(g)).toHaveLength(8);
    for (const m of r2Matches(g)) {
      expect(m.boards).toHaveLength(2);
      for (const id of m.playerIds) {
        const hand = owned(g, id);
        expect(m.runCards![id]!.map((cards) => [...cards].sort())).toEqual([[...hand].sort(), [...hand].sort()]);
        m.boards.forEach((board, run) => {
          const expected = findBestFive([...hand.map((cardId) => getCard(g, cardId)), ...board]);
          const row = m.boardResults[run]!.find((result) => result.playerId === id)!;
          expect(row.hand.category).toBe(expected.category);
          expect(row.hand.bestFive.map((card) => card.id).sort()).toEqual(expected.bestFive.map((card) => card.id).sort());
        });
      }
    }
  });

  it("draws two boards that share no card with each other or either seat's cards", () => {
    for (const seed of [789, 1, 2, 3, 4]) {
      const g = resolvePrimary(completeR2Briefing(drafted(seed)));
      for (const m of r2Matches(g)) {
        expect(new Set(m.boards.flat().map((card) => card.id)).size).toBe(10);
        const held = m.playerIds.flatMap((id) => owned(g, id));
        expect(m.boards.flat().some((card) => held.includes(card.id))).toBe(false);
      }
      expect(assertPoolIntegrity(g)).toBe(true);
    }
  });

  it("pays 2P a RUN win, 1P a split and a 2P sweep only for two outright wins", () => {
    let sweeps = 0; let splits = 0;
    for (const seed of [789, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const before = completeR2Briefing(drafted(seed)); const g = resolvePrimary(before);
      for (const m of r2Matches(g)) for (const id of m.playerIds) {
        const outright = (run: number) => m.boardWinnerIds[run]!.length === 1 && m.boardWinnerIds[run]![0] === id;
        const sweep = outright(0) && outright(1);
        sweeps += Number(sweep); splits += m.boardWinnerIds.filter((ids) => ids.length > 1).length;
        m.runRewards!.forEach((rows, run) => {
          const won = m.boardWinnerIds[run]!.includes(id); const split = m.boardWinnerIds[run]!.length > 1;
          const base = won ? split ? BALANCE.points.r2Run.split : BALANCE.points.r2Run.win : 0;
          expect(rows.find((row) => row.playerId === id)!.deltaPoints).toBe(base + (run === 1 && sweep ? BALANCE.points.r2Run.sweepBonus : 0));
          expect(rows.find((row) => row.playerId === id)!.deltaBB).toBe(won ? 0 : BALANCE.matchLossBB[2].base);
        });
      }
      for (const p of g.players) expect(p.points - before.players.find((x) => x.id === p.id)!.points).toBeLessThanOrEqual(12);
    }
    expect(sweeps).toBeGreaterThan(0); expect(splits).toBeGreaterThan(0);
  });

  it("has no card switch beat, and the client timeline matches the server's at every frame", () => {
    const g = resolvePrimary(completeR2Briefing(drafted()));
    for (const m of r2Matches(g)) {
      const view = createMatchView(g, m);
      const frames = cinematicTimeline(view);
      expect(frames.some((frame) => frame.phase.startsWith("CARD_SWITCH"))).toBe(false);
      expect(frames.filter((frame) => frame.phase === "RUN_RESULT")).toHaveLength(1);
      const duration = presentationDurationMs(view);
      for (const frame of frames) {
        const disclosed = discloseMatch(view, { matchId: view.id, offsetMs: 0, durationMs: duration }, 0, frame.at)!;
        expect(presentationDurationMs(JSON.parse(JSON.stringify(disclosed)))).toBe(duration);
      }
    }
  });

  it("keeps the card switch for a legacy room's anchor + secondary RUNs", () => {
    const g = resolvePrimary(lockRunLoadouts(drafted(789, true, true)));
    for (const m of r2Matches(g)) {
      for (const id of m.playerIds) expect(m.runCards![id]!.map((cards) => cards.length)).toEqual([2, 2]);
      expect(cinematicTimeline(createMatchView(g, m)).some((frame) => frame.phase === "CARD_SWITCH_OUT")).toBe(true);
    }
  });
});

describe("R2 BEST FIVE hand size", () => {
  // Round income keeps every R2 draft affordable, so every seat enters R2 with three cards.
  it("gives every seat exactly three cards at the briefing, across seeds and both formats", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = drafted(seed * 7919, seed % 2 === 0);
      expect(g.phase).toBe("R2_BRIEFING");
      expect(g.players.every((p) => p.ownedCardIds.length === 3)).toBe(true);
      expect(g.draft!.picks.every((pick) => pick.cardId !== null)).toBe(true);
    }
  }, 120_000);
});

describe("R2 BEST FIVE pairings", () => {
  /** Three Swiss-style R1 matchdays: random perfect matchings that never repeat a pairing. */
  function randomR1(random: () => number): string[][] {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const history: string[][] = [];
    for (let day = 0; day < 3; day++) {
      const order = [...ids].sort(() => random() - 0.5);
      history.push(...avoidingPairs(order, Object.fromEntries(ids.map((id) => [id, emptySwissRecord()])), [history]).pairs);
    }
    return history;
  }

  it("never repeats an R1 opponent or a match-1 opponent over 1,200 random R1 histories", () => {
    let state = 20261014;
    const random = () => (state = (state * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let trial = 0; trial < 1200; trial++) {
      const r1 = randomR1(random);
      expect(new Set(r1.map((pair) => [...pair].sort().join())).size).toBe(12);
      const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`).sort(() => random() - 0.5);
      const first = avoidingPairs(ids, Object.fromEntries(ids.map((id) => [id, emptySwissRecord()])), [r1]);
      expect(first.repeats).toEqual([0]);
      const records = Object.fromEntries(ids.map((id) => [id, { ...emptySwissRecord(), score: Math.floor(random() * 6) }]));
      const second = avoidingPairs([...ids].sort(() => random() - 0.5), records, [first.pairs, r1]);
      expect(second.repeats).toEqual([0, 0]);
      for (const [a, b] of [...first.pairs, ...second.pairs]) expect(met(r1, a!, b!)).toBe(false);
      for (const [a, b] of second.pairs) expect(met(first.pairs, a!, b!)).toBe(false);
      expect(new Set([...first.pairs, ...second.pairs].flat()).size).toBe(8);
    }
  });

  it("pairs similar match-1 points in match 2", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const score = { p1: 6, p2: 6, p3: 0, p4: 0, p5: 3, p6: 3, p7: 1, p8: 1 } as Record<string, number>;
    const records = Object.fromEntries(ids.map((id) => [id, { ...emptySwissRecord(), score: score[id]! }]));
    const { pairs } = avoidingPairs(ids, records, [[["p1", "p3"], ["p2", "p4"], ["p5", "p7"], ["p6", "p8"]], []]);
    expect(pairs.map((pair) => pair.map((id) => score[id]!))).toEqual([[6, 6], [0, 0], [3, 3], [1, 1]]);
  });

  it("relaxes R1 before match 1 when no clean pairing exists", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const zero = Object.fromEntries(ids.map((id) => [id, emptySwissRecord()]));
    const everyone = [["p1", "p2"], ["p3", "p4"], ["p1", "p3"], ["p2", "p4"], ["p1", "p4"], ["p2", "p3"]];
    const { pairs, repeats } = avoidingPairs(ids, zero, [[["p1", "p2"], ["p3", "p4"]], everyone]);
    expect(repeats[0]).toBe(0); expect(repeats[1]).toBe(2);
    expect(pairs.some(([a, b]) => met([["p1", "p2"], ["p3", "p4"]], a!, b!))).toBe(false);
  });

  it("plays both matches against new opponents in real games, the same way for the same seed", () => {
    for (const seed of [789, 1, 2, 3, 4, 5, 6, 7, 11, 2026]) {
      const brief = drafted(seed, seed % 2 === 0);
      const r1 = r1Pairs(brief);
      expect(r1).toHaveLength(12);
      const g = resolvePrimary(completeR2Briefing(brief));
      const day = (n: number) => r2Matches(g).filter((m) => m.matchday === n).map((m) => m.playerIds);
      for (const [a, b] of [...day(1), ...day(2)]) expect(met(r1, a!, b!)).toBe(false);
      for (const [a, b] of day(2)) expect(met(day(1), a!, b!)).toBe(false);
      const again = resolvePrimary(completeR2Briefing(drafted(seed, seed % 2 === 0)));
      expect(r2Matches(again).map((m) => m.playerIds)).toEqual(r2Matches(g).map((m) => m.playerIds));
    }
  }, 120_000);

  it("keeps the legacy pairing for a room saved before R2 BEST FIVE", () => {
    // The old rule ignores R1, so across seeds some legacy match-1 pairing repeats an R1 opponent.
    let repeated = false;
    for (const seed of [789, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const g = lockRunLoadouts(drafted(seed, true, true));
      if (g.primaryPairings!.some(([a, b]) => met(r1Pairs(g), a!, b!))) repeated = true;
    }
    expect(repeated).toBe(true);
  }, 120_000);
});

describe("R2 briefing barrier", () => {
  function roomAtBriefing(humans: number, game = drafted()): RoomSnapshot {
    let room = createRoom("BRIEF1", 789);
    for (let i = 0; i < humans; i++) room = addSession(room, `hash-${i}`).room;
    room.status = "PLAYING"; room.game = game;
    room.barrierKey = undefined; room.barrierSince = 1_000;
    return room;
  }
  const ready = (room: RoomSnapshot, id: string, now = 2_000) => applyRoomAction(room, id, { type: "READY" }, turnKey(room), now);

  it("opens the match loading screen as soon as every human confirms, with the pairing frozen there", () => {
    let room = roomAtBriefing(3);
    expect(barrierDeadline(room)).toBe(1_000 + BARRIER_TIMEOUT_MS.R2_BRIEFING);
    room = ready(room, "p1"); room = ready(room, "p2");
    expect(room.game.phase).toBe("R2_BRIEFING");
    expect(createPlayerView(room, "p3").waitingOn).toEqual(["p3"]);
    room = ready(room, "p3");
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(room.game.primaryPairings).toHaveLength(4);
  });

  it("advances on the 15-second deadline when someone never confirms", () => {
    // The phase deadline starts when the briefing opens; a confirmation never restarts it.
    let room = ready(roomAtBriefing(2), "p1", 1_000);
    expect(barrierDeadline(room)).toBe(1_000 + BARRIER_TIMEOUT_MS.R2_BRIEFING);
    expect(forceBarrier(room, 1_000 + BARRIER_TIMEOUT_MS.R2_BRIEFING - 1)).toBeNull();
    room = forceBarrier(room, 1_000 + BARRIER_TIMEOUT_MS.R2_BRIEFING)!;
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
  });

  it("does not wait for bots: one human with seven bots goes on that human's confirmation", () => {
    const room = ready(roomAtBriefing(1), "p1");
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
  });

  it("ignores repeated confirmations and keeps them across a reconnect", () => {
    let room = roomAtBriefing(2);
    room = ready(room, "p1"); room = ready(room, "p1", 2_100);
    expect(room.game.phase).toBe("R2_BRIEFING");
    expect(room.readyIds).toEqual(["p1"]);
    // A reconnect is a fresh view of the same room: the confirmation is still there.
    const view = createPlayerView(structuredClone(room), "p1", ["p1"]);
    expect(view.players.find((p) => p.playerId === "p1")!.ready).toBe(true);
    expect(view.waitingOn).toEqual(["p2"]);
    room = ready(room, "p2", 2_200);
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
  });

  it("does not wait for a seat that left, and a spectator cannot confirm", () => {
    let room = roomAtBriefing(2);
    room.sessions[1]!.departed = true;
    expect(() => ready(room, "p2")).toThrow();
    room = ready(room, "p1");
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
  });

  it("sends nothing new during the briefing: no pairing, matchup or opponent placement", () => {
    const room = roomAtBriefing(2);
    const view = createPlayerView(room, "p1");
    expect(view.phase).toBe("R2_BRIEFING");
    expect(view.r2BestThree).toBe(true);
    expect(view.showdownPrep).toBeUndefined();
    expect(view.pairings).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(/primaryPairings|"runCards"/);
  });

  it("rejects RUN placement in the new R2", () => {
    const room = roomAtBriefing(2);
    const cards = room.game.players[0]!.ownedCardIds;
    expect(() => applyRoomAction(room, "p1", { type: "RUN_LOADOUT", cardIds: cards }, turnKey(room), 2_000)).toThrow();
    expect(() => applyRoomAction(room, "p1", { type: "LOCK_RUN_LOADOUT" }, turnKey(room), 2_000)).toThrow();
    expect(() => setRunLoadout(room.game, "p1", cards)).toThrow();
    expect(() => lockRunLoadouts(room.game)).toThrow();
  });

  it("plays a legacy room's R2 placement to the end", () => {
    let room = roomAtBriefing(2, drafted(789, true, true));
    expect(room.game.phase).toBe("RUN_LOADOUT");
    room = applyRoomAction(room, "p1", { type: "LOCK_RUN_LOADOUT" }, turnKey(room), 2_000);
    room = applyRoomAction(room, "p2", { type: "LOCK_RUN_LOADOUT" }, turnKey(room), 2_000);
    expect(room.game.phase).toBe("SHOWDOWN_PRIMARY");
    expect(room.game.players.every((p) => p.selectedCardIds.length === 3)).toBe(true);
    const g = resolvePrimary(room.game);
    expect(r2Matches(g)).toHaveLength(8);
    expect(g.phase).toBe("ROUND_RESULT");
  });
});

describe("RUN match win chances need every locked hole card", () => {
  it("adds every seat's RUN cards to the match view while a RUN hand is still concealed", () => {
    let room = createRoom("DEADCARDS", 7, "seeded", 2, false, true);
    room = addSession(room, "hash-0").room;
    room.status = "PLAYING";
    room.game = resolvePrimary(completeR2Briefing(drafted(789)));
    room.game.roundResults = room.game.roundResults.filter((item) => item.playerIds.includes("p1"));
    const match = room.game.roundResults[0]!;
    room.presentation = { key: "k", version: 99, startsAt: 0, endsAt: 1e12,
      perPlayer: { p1: [{ matchId: match.id, offsetMs: 0, durationMs: 1e6 }] } } as never;
    const view = createPlayerView(room, "p1", [], 1);
    const mine = view.matches.find((item) => item.id === room.game.roundResults[0]!.id);
    expect(mine, "the viewer's own match is disclosed").toBeDefined();
    const held = new Set(room.game.roundResults[0]!.playerIds.flatMap((id) => owned(room.game, id)));
    expect(new Set((mine!.deadCards ?? []).map((card) => card.id))).toEqual(held);
  });
});
