import { expect, it } from "vitest";
import { autoPickDraft, buyCard, completeR2Briefing, createGame, leaveRoundResult, openDraft, prepareShowdown, resolvePrimary, startNextRound } from "../game/engine";
import { applyLocalGameCommand, localGameSnapshot, localGameStep } from "./localGameCommand";
import { showdownEquity } from "./showdownEquity";
import { createMatchView } from "../game/matchView";
import { streetEquityJob } from "./displayEquity";

it("runs shop commands and resolution with identical engine state and RNG, without mutating the input", () => {
  const initial = createGame(789); const saved = structuredClone(initial);
  const cardId = initial.players[0]!.shopCardIds[0]!;
  expect(applyLocalGameCommand(initial, { type: "BUY_CARD", cardId })).toEqual(buyCard(initial, "p1", cardId));
  expect(initial).toEqual(saved);
  const prep = prepareShowdown(initial, []);
  const original = structuredClone(prep);
  expect(applyLocalGameCommand(prep, { type: "ADVANCE" })).toEqual(resolvePrimary(prep));
  expect(prep).toEqual(original); expect(localGameStep(prep)).not.toBe(localGameStep(resolvePrimary(prep)));
});
it.each([789, 11, 2026])("projects the current R2 three-card hands and finite pre-board odds for both runs (seed %s)", seed => {
  let game = resolvePrimary(prepareShowdown(createGame(seed), []));
  game = openDraft(startNextRound(leaveRoundResult(game)));
  while (game.phase === "OPEN_DRAFT") game = autoPickDraft(game);
  game = completeR2Briefing(game);
  const prep = localGameSnapshot(game).view.showdownPrep!;
  const opponent = prep.opponent ?? prep.opponents![0]!;
  for (const seat of [prep.viewer, opponent]) {
    expect(seat.cards).toHaveLength(3); expect(seat.runCards!.map(run => run.length)).toEqual([3, 3]);
    expect(seat.runCards![0]).toEqual(seat.runCards![1]);
  }
  const hands = [prep.viewer.runCards![0]!, opponent.runCards![0]!];
  const odds = showdownEquity(2, hands[0]!, hands[1]!, [...prep.viewer.cards, ...opponent.cards])!;
  expect(odds.every(n => Number.isFinite(n) && n >= 0 && n <= 100)).toBe(true);
  expect(odds[0]! + odds[1]!).toBeGreaterThanOrEqual(99);
  const resolved = applyLocalGameCommand(game, { type: "ADVANCE" });
  const match = createMatchView(resolved, resolved.roundResults.find(m => m.playerIds.includes("p1"))!);
  for (const run of [0, 1]) {
    const job = streetEquityJob(match, run, 0)[0]!;
    expect(job.hands.map(hand => hand.length)).toEqual([3, 3]);
  }
});
