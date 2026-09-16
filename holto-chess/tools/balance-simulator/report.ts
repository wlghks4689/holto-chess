import type { SimulationResult } from "./types";

const n = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function renderConsoleSummary(result: SimulationResult, runtimeMs?: number): string {
  const r5 = result.rounds[5];
  return [
    "Simulation Complete",
    `Games: ${result.games.completed}/${result.games.requested} completed (${result.games.failed} failed)`,
    `Average actions: ${n(result.games.averageActions)}`,
    runtimeMs === undefined ? undefined : `Runtime: ${n(runtimeMs)} ms`,
    `Average R5 BB: ${n(r5.bb.average)}`,
    "R5 Hand Distribution:",
    ...Object.entries(r5.hands).map(([hand, value]) => `  ${hand}: ${value.count} (${n(value.percentage)}%)`),
    `Minimum available cards: ${Math.min(...Object.values(result.rounds).map((round) => round.pool.minimumAvailable))}`,
    `Shop fill failures: ${result.depletion.shopFillFailures}`,
  ].filter((line): line is string => line !== undefined).join("\n");
}

function findings(result: SimulationResult): string[] {
  const output: string[] = [];
  if (result.depletion.shopFillFailures) output.push(`상점 미충족이 ${result.depletion.shopFillFailures}회 발생했습니다.`);
  if (result.depletion.availableZeroEvents) output.push(`AVAILABLE=0 상태가 ${result.depletion.availableZeroEvents}회 관측되었습니다.`);
  const active = Object.entries(result.policies).filter(([, policy]) => policy.entries > 0).sort((a, b) => b[1].winRate - a[1].winRate);
  if (active.length > 1 && active[0]![1].winRate - active.at(-1)![1].winRate >= 5) output.push(`정책별 1위 비율 격차가 ${n(active[0]![1].winRate - active.at(-1)![1].winRate)}%p입니다. 정책 편향과 규칙 효과를 분리해 추가 검증해야 합니다.`);
  if (!output.length) output.push("이번 표본에서는 설정된 단순 경고 기준을 넘는 고갈 또는 정책 승률 격차가 관측되지 않았습니다.");
  return output;
}

export function renderMarkdownReport(result: SimulationResult, runtimeMs?: number): string {
  const rows = (items: string[][]) => items.map((row) => `| ${row.join(" | ")} |`).join("\n");
  const roundRows = Object.entries(result.rounds).map(([round, value]) => [
    `R${round}`, n(value.entered), n(value.survived), n(value.bb.average), n(value.bb.median), n(value.pool.averageAvailable), n(value.pool.minimumAvailable), String(value.pool.shopFillFailures),
  ]);
  const policyRows = Object.entries(result.policies).filter(([, value]) => value.entries).map(([policy, value]) => [
    policy, String(value.entries), `${n(value.r5Rate)}%`, `${n(value.winRate)}%`, n(value.averageFinalRank), n(value.averageBB), n(value.averageFinalScore),
  ]);
  const tournamentRows = Object.entries(result.policies).filter(([, value]) => value.entries).map(([policy, value]) => [
    policy, String(value.tournament.r2PrimaryWins), String(value.tournament.r2WinnerBracketWins), String(value.tournament.r2LoserBracketSurvivals), String(value.tournament.r2Eliminations),
    String(value.tournament.r4PrimaryWins), String(value.tournament.r4WinnerThreeWayFirsts), String(value.tournament.r4LoserThreeWaySurvivals), String(value.tournament.r4Eliminations),
  ]);
  const playerRows = Object.entries(result.players).map(([playerId, value]) => [
    playerId, String(value.games), Object.entries(value.policyMix).map(([policy, count]) => `${policy}:${count}`).join(", "),
    n(value.economy.purchases), n(value.economy.sales), n(value.economy.rerolls), n(value.economy.purchaseSpend), n(value.economy.rerollSpend), n(value.averageEndingBB), n(value.averageFinalRank),
  ]);
  const handRows = Object.entries(result.rounds[5].hands).map(([hand, value]) => [hand, String(value.count), `${n(value.percentage)}%`]);
  const rankRows = Object.entries(result.ranks).map(([rank, value]) => [rank, String(value.appearances), String(value.purchases), `${n(value.purchaseRate)}%`, String(value.sales), String(value.finalOwned)]);
  return `# Holto Chess Balance Simulation Report

## Run

- Requested games: ${result.games.requested}
- Completed games: ${result.games.completed}
- Failed games: ${result.games.failed}
- Base seed: ${result.config.baseSeed}
- Policy assignment: ${result.config.assignment}
- Average actions per game: ${n(result.games.averageActions)}
${runtimeMs === undefined ? "" : `- Runtime: ${n(runtimeMs)} ms\n`}
## Round summary

| Round | Avg entered | Avg survived | Avg BB | Median BB | Avg available | Min available | Shop fill failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows(roundRows)}

## Economy

- Average purchases per player: ${n(result.economy.averagePurchasesPerPlayer)}
- Average sales per player: ${n(result.economy.averageSalesPerPlayer)}
- Average rerolls per player: ${n(result.economy.averageRerollsPerPlayer)}
- Average ending BB: ${n(result.economy.averageEndingBB)}
- Purchase share of measured spend: ${n(result.economy.purchaseSpendRatio)}%
- Reroll share of measured spend: ${n(result.economy.rerollSpendRatio)}%

## R5 hand distribution

| Hand | Count | Percentage |
| --- | ---: | ---: |
${rows(handRows)}

## Rank market

| Rank | Shop appearances | Purchases | Purchase rate | Sales | Final owned |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows(rankRows)}

## Policy results

| Policy | Entries | R5 rate | Win rate | Avg final rank | Avg BB | Avg finalist score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows(policyRows)}

## Player-slot economy

| Player | Games | Policy mix | Avg purchases | Avg sales | Avg rerolls | Avg purchase spend | Avg reroll spend | Avg ending BB | Avg final rank |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows(playerRows)}

## Tournament outcomes by policy

| Policy | R2 primary wins | R2 winner-bracket wins | R2 loser survivors | R2 eliminated | R4 primary wins | R4 winner 3-way firsts | R4 loser survivors | R4 eliminated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows(tournamentRows)}

## Final score components (R5 finalists)

- Average Final Score: ${n(result.score.averageFinalScore)}
- Average Round Points: ${n(result.score.averageRoundPoints)}
- Average Hand Score: ${n(result.score.averageHandScore)}
- Average Stack Score: ${n(result.score.averageStackScore)}

Hand Score는 현재 게임 config의 임시값을 그대로 사용합니다.

## Automated observations

${findings(result).map((item) => `- ${item}`).join("\n")}

## Limitations

${result.limitations.map((item) => `- ${item}`).join("\n")}
`;
}
