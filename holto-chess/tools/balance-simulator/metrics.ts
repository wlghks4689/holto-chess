import type { Round } from "../../src/game/types";
import {
  POLICY_NAMES, emptyEconomy, emptyTournament, type EconomyCounter, type FailureRecord, type GameTrace,
  type NumericSummary, type PolicyName, type PolicyReport, type ReportHandCategory, type SimulationConfig,
  type SimulationResult, type TournamentCounter,
} from "./types";

const ROUNDS: Round[] = [1, 2, 3, 4, 5];
const HANDS: ReportHandCategory[] = ["HIGH_CARD", "PAIR", "TWO_PAIR", "TRIPS", "STRAIGHT", "FLUSH", "FULL_HOUSE", "QUADS", "STRAIGHT_FLUSH", "ROYAL_FLUSH"];
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const roundToNumber = (value: number, digits = 4) => Number(value.toFixed(digits));
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => values.length ? sum(values) / values.length : 0;

export function summarize(values: number[]): NumericSummary {
  if (!values.length) return { average: 0, median: 0, min: 0, max: 0 };
  const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
  return { average: roundToNumber(average(values)), median: roundToNumber(median), min: ordered[0]!, max: ordered.at(-1)! };
}

const addEconomy = (target: EconomyCounter, source: EconomyCounter) => {
  target.purchases += source.purchases; target.sales += source.sales; target.rerolls += source.rerolls;
  target.purchaseSpend += source.purchaseSpend; target.rerollSpend += source.rerollSpend;
};
const addTournament = (target: TournamentCounter, source: TournamentCounter) => {
  for (const key of Object.keys(target) as (keyof TournamentCounter)[]) target[key] += source[key];
};
const divideEconomy = (source: EconomyCounter, count: number): EconomyCounter => ({
  purchases: roundToNumber(source.purchases / (count || 1)), sales: roundToNumber(source.sales / (count || 1)),
  rerolls: roundToNumber(source.rerolls / (count || 1)), purchaseSpend: roundToNumber(source.purchaseSpend / (count || 1)),
  rerollSpend: roundToNumber(source.rerollSpend / (count || 1)),
});

export function aggregateResults(config: SimulationConfig, games: GameTrace[], failures: FailureRecord[]): SimulationResult {
  const allPlayers = games.flatMap((game) => game.players);
  const economy = emptyEconomy(); allPlayers.forEach((player) => addEconomy(economy, player.economy));
  const totalSpend = economy.purchaseSpend + economy.rerollSpend;
  const roundReports = Object.fromEntries(ROUNDS.map((round) => {
    const snapshots = games.flatMap((game) => game.rounds.filter((entry) => entry.round === round));
    const pools = games.flatMap((game) => game.poolSnapshots.filter((entry) => entry.round === round));
    const roundPlayers = games.flatMap((game) => game.players);
    const roundEconomy = emptyEconomy(); roundPlayers.forEach((player) => addEconomy(roundEconomy, player.roundEconomy[round]));
    const counts = Object.fromEntries(HANDS.map((hand) => [hand, sum(games.map((game) => game.handCounts[round][hand] ?? 0))])) as Record<ReportHandCategory, number>;
    const handTotal = sum(Object.values(counts));
    return [round, {
      entered: roundToNumber(average(snapshots.map((entry) => entry.entered))), survived: roundToNumber(average(snapshots.map((entry) => entry.survived))),
      bb: summarize(snapshots.flatMap((entry) => entry.stacks)),
      pool: {
        averageAvailable: roundToNumber(average(pools.map((entry) => entry.available))),
        minimumAvailable: pools.length ? Math.min(...pools.map((entry) => entry.available)) : 0,
        averageReserved: roundToNumber(average(pools.map((entry) => entry.reserved))),
        averageOwned: roundToNumber(average(pools.map((entry) => entry.owned))),
        availableZeroEvents: pools.filter((entry) => entry.available === 0).length,
        shopFillFailures: sum(pools.map((entry) => entry.shopFillFailures)),
      },
      economy: divideEconomy(roundEconomy, sum(snapshots.map((entry) => entry.entered))),
      hands: Object.fromEntries(HANDS.map((hand) => [hand, { count: counts[hand], percentage: roundToNumber(counts[hand] / (handTotal || 1) * 100) }])),
    }];
  })) as SimulationResult["rounds"];

  const ranks = Object.fromEntries(RANKS.map((rank) => {
    const combined = { appearances: 0, purchases: 0, sales: 0, finalOwned: 0 };
    for (const game of games) { const item = game.rankCounters[rank]!; combined.appearances += item.appearances; combined.purchases += item.purchases; combined.sales += item.sales; combined.finalOwned += item.finalOwned; }
    return [rank, { ...combined, purchaseRate: roundToNumber(combined.purchases / (combined.appearances || 1) * 100) }];
  }));

  const policies = Object.fromEntries(POLICY_NAMES.map((policy) => {
    const players = allPlayers.filter((player) => player.policy === policy); const policyEconomy = emptyEconomy(); const tournament = emptyTournament();
    players.forEach((player) => { addEconomy(policyEconomy, player.economy); addTournament(tournament, player.tournament); });
    const report: PolicyReport = {
      entries: players.length, r5Rate: roundToNumber(players.filter((player) => player.reachedR5).length / (players.length || 1) * 100),
      winRate: roundToNumber(players.filter((player) => player.won).length / (players.length || 1) * 100),
      averageFinalRank: roundToNumber(average(players.map((player) => player.finalRank))), averageBB: roundToNumber(average(players.map((player) => player.finalBB))),
      averageFinalScore: roundToNumber(average(players.filter((player) => player.reachedR5).map((player) => player.finalScore))), economy: divideEconomy(policyEconomy, players.length), tournament,
      strategyCandidateMissing: sum(games.map((game) => game.strategyCandidateMissing[policy] ?? 0)),
    };
    return [policy, report];
  })) as Record<PolicyName, PolicyReport>;
  const playerIds = [...new Set(allPlayers.map((player) => player.playerId))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const players = Object.fromEntries(playerIds.map((playerId) => {
    const samples = allPlayers.filter((player) => player.playerId === playerId); const playerEconomy = emptyEconomy();
    samples.forEach((player) => addEconomy(playerEconomy, player.economy));
    const policyMix = Object.fromEntries(POLICY_NAMES.map((policy) => [policy, samples.filter((player) => player.policy === policy).length]).filter(([, count]) => count));
    return [playerId, {
      games: samples.length, policyMix, averageFinalRank: roundToNumber(average(samples.map((player) => player.finalRank))),
      averageEndingBB: roundToNumber(average(samples.map((player) => player.finalBB))), economy: divideEconomy(playerEconomy, samples.length),
    }];
  }));
  const finalists = allPlayers.filter((player) => player.reachedR5);
  return {
    config: { simulationCount: config.simulationCount, baseSeed: config.baseSeed, policies: config.policies, assignment: config.assignment, maxRerollsPerPlayerRound: config.maxRerollsPerPlayerRound },
    games: { requested: config.simulationCount, completed: games.length, failed: failures.length, averageActions: roundToNumber(average(games.map((game) => game.actionCount))) },
    rounds: roundReports,
    economy: {
      ...economy, averagePurchasesPerPlayer: roundToNumber(economy.purchases / (allPlayers.length || 1)), averageSalesPerPlayer: roundToNumber(economy.sales / (allPlayers.length || 1)),
      averageRerollsPerPlayer: roundToNumber(economy.rerolls / (allPlayers.length || 1)), averageEndingBB: roundToNumber(average(allPlayers.map((player) => player.finalBB))),
      purchaseSpendRatio: roundToNumber(economy.purchaseSpend / (totalSpend || 1) * 100), rerollSpendRatio: roundToNumber(economy.rerollSpend / (totalSpend || 1) * 100),
    },
    ranks, players, policies,
    score: {
      averageFinalScore: roundToNumber(average(finalists.map((player) => player.finalScore))), averageRoundPoints: roundToNumber(average(finalists.map((player) => player.roundPoints))),
      averageHandScore: roundToNumber(average(finalists.map((player) => player.handScore))), averageStackScore: roundToNumber(average(finalists.map((player) => player.stackScore))),
    },
    depletion: {
      availableZeroEvents: sum(games.map((game) => game.availableZeroEvents)), shopFillFailures: sum(games.flatMap((game) => game.poolSnapshots).map((snapshot) => snapshot.shopFillFailures)),
      rerollShortageEvents: sum(games.map((game) => game.rerollShortageEvents)), repeatedRerollGroups: sum(games.map((game) => game.repeatedRerollGroups)),
    }, failures,
    limitations: [
      "이 결과는 현재 구현한 heuristic AI policy 기반이며 실제 인간 메타를 직접 의미하지 않습니다.",
      "정책 간 차이는 구매 후보 점수와 제한적 리롤 규칙에서 발생하므로, 게임 규칙 자체의 효과와 완전히 분리할 수 없습니다.",
      "Hand Score는 현재 게임 config의 임시값을 그대로 사용했으며, 이 결과만으로 새 Hand Score를 확정하면 안 됩니다.",
    ],
  };
}
