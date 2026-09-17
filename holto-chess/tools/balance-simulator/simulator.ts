import { BALANCE } from "../../src/game/config";
import {
  beginSecondary, buyCard, chooseAugment, confirmSelection, createGame, finalStandings, getCard,
  getCardPrice, leaveRoundResult, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary,
  startNextRound, toggleSelectedCard,
} from "../../src/game/engine";
import type { HoltoChessGameState, MatchResult, Round } from "../../src/game/types";
import { assertSimulationInvariants } from "./invariants";
import { assignPolicies, hasStrategyCandidate, orderedShop, selectR2Cards, shouldReroll } from "./policies";
import {
  emptyEconomy, emptyTournament, type EconomyCounter, type GameTrace, type PlayerTrace,
  type PolicyName, type PoolSnapshot, type RankCounter, type SimulationConfig,
} from "./types";

const ROUNDS: Round[] = [1, 2, 3, 4, 5];
const RANK_LABEL: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
const expectedEnd: Record<Round, number> = { 1: 8, 2: 6, 3: 6, 4: 4, 5: 4 };

const roundEconomy = () => Object.fromEntries(ROUNDS.map((round) => [round, emptyEconomy()])) as Record<Round, EconomyCounter>;
const addEconomy = (target: EconomyCounter, key: keyof EconomyCounter, value = 1) => { target[key] += value; };

function poolSnapshot(state: HoltoChessGameState, checkShopFill = false): PoolSnapshot {
  const count = (name: "AVAILABLE" | "RESERVED_IN_SHOP" | "OWNED") => state.ownershipCardPool.filter((entry) => entry.state === name).length;
  return {
    round: state.round, available: count("AVAILABLE"), reserved: count("RESERVED_IN_SHOP"), owned: count("OWNED"),
    shopFillFailures: checkShopFill ? state.players.filter((player) => !player.eliminated && player.shopCardIds.length < player.shopSize).length : 0,
  };
}

function captureShopAppearances(state: HoltoChessGameState, ranks: Record<string, RankCounter>): void {
  for (const player of state.players.filter((entry) => !entry.eliminated)) for (const id of player.shopCardIds) ranks[RANK_LABEL[getCard(state, id).rank]]!.appearances += 1;
}

function updateTournament(round: Round, primary: MatchResult[], secondary: MatchResult[], traces: Map<string, PlayerTrace>): void {
  if (round !== 2 && round !== 4) return;
  for (const match of primary) for (const winner of match.winnerIds) traces.get(winner)!.tournament[round === 2 ? "r2PrimaryWins" : "r4PrimaryWins"] += 1;
  const winnerMatch = secondary[0]; const loserMatch = secondary.at(-1);
  let eliminationMatches: MatchResult[];
  if (round === 2) {
    const split = secondary.length / 2; const winnerMatches = secondary.slice(0, split); const loserMatches = secondary.slice(split);
    for (const match of winnerMatches) for (const winner of match.winnerIds) traces.get(winner)!.tournament.r2WinnerBracketWins += 1;
    for (const winner of loserMatches.flatMap((match) => match.winnerIds)) traces.get(winner)!.tournament.r2LoserBracketSurvivals += 1;
    eliminationMatches = loserMatches;
  } else {
    for (const winner of winnerMatch?.winnerIds ?? []) traces.get(winner)!.tournament.r4WinnerThreeWayFirsts += 1;
    for (const winner of loserMatch?.winnerIds ?? []) traces.get(winner)!.tournament.r4LoserThreeWaySurvivals += 1;
    eliminationMatches = loserMatch ? [loserMatch] : [];
  }
  const participants = new Set(eliminationMatches.flatMap((match) => match.playerIds));
  const survivors = new Set(eliminationMatches.flatMap((match) => match.winnerIds));
  for (const id of participants) if (!survivors.has(id)) traces.get(id)!.tournament[round === 2 ? "r2Eliminations" : "r4Eliminations"] += 1;
}

export function simulateGame(config: SimulationConfig, gameIndex: number): GameTrace {
  const seed = (config.baseSeed + gameIndex) >>> 0 || 1;
  let state = createGame(seed, "seeded");
  let actionCount = 1;
  const policies = assignPolicies(state.players.map((player) => player.id), config.policies, config.assignment, seed ^ 0x9e3779b9);
  const traces: Map<string, PlayerTrace> = new Map(state.players.map((player) => [player.id, {
    playerId: player.id, policy: policies[player.id]!, economy: emptyEconomy(), roundEconomy: roundEconomy(),
    finalBB: 0, finalRank: 8, finalScore: 0, preR5Points: 0, r5PlacementPoints: 0, r5Place: 0,
    roundPoints: 0, handScore: 0, stackScore: 0,
    reachedR5: false, won: false, tournament: emptyTournament(),
  }]));
  const rankCounters = Object.fromEntries(Object.values(RANK_LABEL).map((rank) => [rank, { appearances: 0, purchases: 0, sales: 0, finalOwned: 0 } satisfies RankCounter]));
  const handCounts = Object.fromEntries(ROUNDS.map((round) => [round, {}])) as GameTrace["handCounts"];
  const poolSnapshots: PoolSnapshot[] = [];
  const rounds: GameTrace["rounds"] = [];
  const strategyCandidateMissing = Object.fromEntries(config.policies.map((policy) => [policy, 0])) as Record<PolicyName, number>;
  let availableZeroEvents = 0; let rerollShortageEvents = 0; let repeatedRerollGroups = 0;

  captureShopAppearances(state, rankCounters); poolSnapshots.push(poolSnapshot(state, true));
  for (const round of ROUNDS) {
    if (state.round !== round || state.phase !== "SHOP") throw new Error(`Expected R${round} SHOP, found R${state.round} ${state.phase}`);
    const entered = state.players.filter((player) => !player.eliminated).length;
    for (const player of state.players.filter((entry) => !entry.eliminated)) {
      const policy = policies[player.id]!; const trace = traces.get(player.id)!;
      if (!hasStrategyCandidate(state, player, policy)) strategyCandidateMissing[policy] += 1;
      let rerolls = 0;
      while (rerolls < config.maxRerollsPerPlayerRound && shouldReroll(state, player, policy)) {
        const before = new Set(player.shopCardIds.map((id) => getCard(state, id).rank));
        const cost = Math.max(0, BALANCE.rerollCostBB - (player.augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0));
        state = rerollShop(state, player.id); actionCount += 1; rerolls += 1;
        addEconomy(trace.economy, "rerolls"); addEconomy(trace.roundEconomy[round], "rerolls");
        addEconomy(trace.economy, "rerollSpend", cost); addEconomy(trace.roundEconomy[round], "rerollSpend", cost);
        const refreshed = state.players.find((entry) => entry.id === player.id)!;
        if (refreshed.shopCardIds.length < refreshed.shopSize) rerollShortageEvents += 1;
        const after = new Set(refreshed.shopCardIds.map((id) => getCard(state, id).rank));
        if ([...before].every((rank) => after.has(rank))) repeatedRerollGroups += 1;
        captureShopAppearances({ ...state, players: [refreshed] }, rankCounters);
      }
      let current = state.players.find((entry) => entry.id === player.id)!;
      while (current.ownedCardIds.length < BALANCE.handLimits[round]) {
        const id = orderedShop(state, current, policy).find((cardId) => getCardPrice(state, current.id, cardId) <= current.stackBB);
        if (!id) throw new Error(`${current.id} cannot afford or find a card in R${round}`);
        const price = getCardPrice(state, current.id, id); const rank = RANK_LABEL[getCard(state, id).rank]!;
        state = buyCard(state, current.id, id); actionCount += 1;
        addEconomy(trace.economy, "purchases"); addEconomy(trace.roundEconomy[round], "purchases");
        addEconomy(trace.economy, "purchaseSpend", price); addEconomy(trace.roundEconomy[round], "purchaseSpend", price);
        rankCounters[rank]!.purchases += 1;
        current = state.players.find((entry) => entry.id === player.id)!;
      }
      if (round === 2) for (const id of selectR2Cards(state, current, policy)) { state = toggleSelectedCard(state, current.id, id); actionCount += 1; }
      const sample = poolSnapshot(state); poolSnapshots.push(sample); if (sample.available === 0) availableZeroEvents += 1;
    }
    const activeIds = state.players.filter((player) => !player.eliminated).map((player) => player.id);
    state = prepareShowdown(state, activeIds); actionCount += 1;
    if (state.phase === "DECK_SELECT") { state = confirmSelection(state); actionCount += 1; }
    const pointsBeforeR5 = round === 5
      ? new Map(state.players.filter((player) => !player.eliminated).map((player) => [player.id, player.points]))
      : null;
    state = resolvePrimary(state); actionCount += 1;
    const primary = state.roundResults;
    let secondary: MatchResult[] = [];
    if (state.phase === "GROUP_ASSIGNMENT") {
      state = beginSecondary(state); actionCount += 1; state = resolveSecondary(state); actionCount += 1; secondary = state.roundResults;
    }
    updateTournament(round, primary, secondary, traces);
    assertSimulationInvariants(state, expectedEnd[round]);
    const countedMatches = state.roundResults;
    if (round === 5 && pointsBeforeR5) {
      for (const result of countedMatches[0]!.results) {
        const trace = traces.get(result.playerId)!;
        const afterPoints = state.players.find((player) => player.id === result.playerId)!.points;
        trace.preR5Points = pointsBeforeR5.get(result.playerId) ?? 0;
        trace.r5PlacementPoints = afterPoints - trace.preR5Points;
        trace.r5Place = result.place;
      }
    }
    for (const result of countedMatches.flatMap((match) => match.results)) {
      const category = result.hand.category;
      handCounts[round][category] = (handCounts[round][category] ?? 0) + 1;
    }
    rounds.push({ round, entered, survived: expectedEnd[round], stacks: state.players.filter((player) => !player.eliminated).map((player) => player.stackBB) });
    poolSnapshots.push(poolSnapshot(state));
    if (round === 5) break;
    state = leaveRoundResult(state); actionCount += 1;
    if (state.phase === "AUGMENT") { state = chooseAugment(state, "p1", state.augmentChoices[0]!.id); actionCount += 1; }
    state = startNextRound(state); actionCount += 1;
    captureShopAppearances(state, rankCounters); poolSnapshots.push(poolSnapshot(state, true));
  }
  const standings = finalStandings(state);
  standings.forEach((standing, index) => {
    const trace = traces.get(standing.playerId)!;
    trace.finalRank = index + 1; trace.finalScore = standing.total; trace.roundPoints = standing.points;
    trace.handScore = standing.handScore; trace.stackScore = standing.stackScore; trace.reachedR5 = true; trace.won = index === 0;
  });
  const eliminated = state.players.filter((player) => player.eliminated).sort((a, b) =>
    (b.eliminatedRound ?? 0) - (a.eliminatedRound ?? 0) || b.points - a.points || b.stackBB - a.stackBB || a.id.localeCompare(b.id),
  );
  eliminated.forEach((player, index) => { traces.get(player.id)!.finalRank = standings.length + index + 1; });
  for (const player of state.players) {
    const trace = traces.get(player.id)!; trace.finalBB = player.stackBB;
    for (const id of player.ownedCardIds) rankCounters[RANK_LABEL[getCard(state, id).rank]]!.finalOwned += 1;
  }
  return { seed, actionCount, players: [...traces.values()], rounds, poolSnapshots, rankCounters, handCounts, availableZeroEvents, rerollShortageEvents, repeatedRerollGroups, strategyCandidateMissing };
}
