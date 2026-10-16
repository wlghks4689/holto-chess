import { describe, expect, it } from "vitest";
import { makeDeck, type Card } from "../core/poker/cards";
import { autoChooseOpponent, completeOpponentSelect, createAbilityGame, isOpponentRevealing, lockRunLoadouts, prepareShowdown, resolvePrimary } from "../game/engine";
import { createMatchView } from "../game/matchView";
import { showdownEquity } from "../game/showdownEquity";
import type { MatchView } from "../shared/protocol";
import { fastForwardToRound } from "./devFastForward";
import { streetEquityJob } from "./displayEquity";
import { calculateDisplayEquity } from "./displayEquityCalculation";
import { discloseMatch } from "../game/disclosure";
import { cinematicTimeline, presentationDurationMs } from "../shared/presentationTimeline";

const deck = makeDeck();
const cards = (ids: string[]) => ids.map(id => deck.find(card => card.id === id)!);
const concealed = (card: Card): Card => ({ ...card, id: `hidden:${card.id}`, hidden: true });

/** AA / AA / QQ against KK / JJ / KK: all six pairs distinct, so twelve cards are out of the deck. */
function fixture(): MatchView {
  const mine = [cards(["As", "Ah"]), cards(["Ad", "Ac"]), cards(["Qs", "Qh"])];
  const theirs = [cards(["Ks", "Kh"]), cards(["Js", "Jh"]), cards(["Kd", "Kc"])];
  return { id: "m", stage: "primary", participantIds: ["p1", "p2"], winnerIds: ["p1"], round: 5, matchNumber: 1, final: false,
    boards: [cards(["2c", "3c", "4d", "5h", "7s"]), cards(["2d", "3d", "4c", "6h", "8s"]), cards(["2h", "3h", "9d", "Th", "7c"])],
    boardWinnerIds: [["p1"], ["p1"], ["p1"]], boardResults: [[], [], []], results: [], streetSnapshots: [], runoutCount: 3, suddenDeathCount: 0, rewards: [],
    runCards: { p1: mine, p2: theirs }, revealedCards: { p1: mine[0]!, p2: theirs[0]! } } as unknown as MatchView;
}
const prepEquity = (match: MatchView, run: number) => {
  const dead = Object.values(match.runCards!).flat(2);
  return showdownEquity(2, match.runCards!.p1![run]!, match.runCards!.p2![run]!, dead)!;
};

describe("R5 win chances: showdown meter and match loading screen", () => {
  it("excludes every RUN's hole cards from the deck in every RUN, as the loading screen does", () => {
    const match = fixture();
    for (const run of [0, 1, 2]) {
      const [job] = streetEquityJob(match, run, 0);
      expect(job!.kind).toBe("headsUp");
      expect(new Set((job as unknown as { dead: readonly Card[] }).dead.map(card => card.id)).size).toBe(12);
      expect(calculateDisplayEquity([job!])[0]).toEqual(prepEquity(match, run));
    }
  });

  it("gives a streets read that cannot draw any of the twelve cards", () => {
    const match = fixture();
    const [job] = streetEquityJob(match, 0, 3);
    expect(job!.kind).toBe("street");
    const owned = new Set(Object.values(match.runCards!).flat(2).map(card => card.id));
    expect((job as unknown as { dead: readonly Card[] }).dead.filter(card => owned.has(card.id))).toHaveLength(12);
    // AA over KK on a dry flop with the other aces and kings held elsewhere: far better than with them in the deck.
    const flop = calculateDisplayEquity([job!])[0]!;
    const naive = calculateDisplayEquity([{ ...job!, dead: match.revealedCards.p1!.concat(match.revealedCards.p2!) } as never])[0]!;
    expect(flop[0]).toBeGreaterThan(0); expect(flop[0]! + flop[1]!).toBeGreaterThanOrEqual(99);
    expect(flop).not.toEqual(naive);
  });

  it("shows no odds for a viewer who cannot exclude a concealed RUN hand, and exact odds once deadCards covers it", () => {
    const full = fixture();
    const hiddenRuns = { p1: full.runCards!.p1!.map((hand, run) => run ? hand.map(concealed) : hand), p2: full.runCards!.p2!.map((hand, run) => run ? hand.map(concealed) : hand) };
    const spectator: MatchView = { ...full, runCards: hiddenRuns };
    expect(streetEquityJob(spectator, 0, 0)).toEqual([]);
    expect(streetEquityJob(spectator, 0, 3)).toEqual([]);
    const withDead: MatchView = { ...spectator, deadCards: Object.values(full.runCards!).flat(2) };
    expect(calculateDisplayEquity(streetEquityJob(withDead, 0, 0))[0]).toEqual(prepEquity(full, 0));
  });

  it("matches the loading screen at the first frame of every RUN in a real six-round game", () => {
    let state = fastForwardToRound(createAbilityGame(7), 5);
    for (let guard = 0; guard < 40 && state.phase !== "SHOWDOWN_PRIMARY"; guard += 1) {
      if (state.phase === "OPPONENT_SELECT") state = isOpponentRevealing(state) ? completeOpponentSelect(state) : autoChooseOpponent(state);
      else if (state.phase === "SHOP") state = prepareShowdown(state, []);
      else if (state.phase === "RUN_LOADOUT") state = lockRunLoadouts(state, []);
      else break;
    }
    expect(state.phase).toBe("SHOWDOWN_PRIMARY");
    const pairing = state.primaryPairings!.find(ids => ids.length === 2)!;
    // What the loading screen computes: the locked pairs of both seats, all twelve owned cards dead.
    const owned = (id: string) => state.players.find(p => p.id === id)!.ownedCardIds.map(cardId => state.ownershipCardPool.find(e => e.card.id === cardId)!.card);
    const pair = (id: string, run: number) => state.players.find(p => p.id === id)!.selectedCardIds.slice(run * 2, run * 2 + 2).map(cardId => state.ownershipCardPool.find(e => e.card.id === cardId)!.card);
    const prep = [0, 1, 2].map(run => showdownEquity(2, pair(pairing[0]!, run), pair(pairing[1]!, run), [...owned(pairing[0]!), ...owned(pairing[1]!)])!);
    const resolved = resolvePrimary(state);
    const full = createMatchView(resolved, resolved.roundResults.find(match => match.playerIds.includes(pairing[0]!))!);
    // The viewer's disclosed copy conceals later RUN hands, so attach deadCards the way the server's player view does.
    const entry = { matchId: full.id, offsetMs: 0, durationMs: presentationDurationMs(full) };
    for (const run of [0, 1, 2]) {
      const frame = cinematicTimeline(full).find(item => item.boardIndex === run && item.phase === "FLOP_1")!;
      const disclosed = discloseMatch(full, entry, 0, frame.at)!;
      disclosed.deadCards = Object.values(full.runCards!).flat(2);
      const shown = calculateDisplayEquity(streetEquityJob(disclosed, run, 0))[0]!;
      expect(shown, `RUN ${run + 1}`).toEqual(prep[run]);
    }
  }, 120_000);
});
