import { cardPrice } from "../../src/game/config";
import { groupBy, mean } from "./stats";
import { ROUNDS, type GameRow, type PlayerRow, type PolicyName, type SimConfig } from "./types";

type Rate = { k: number; n: number };
const rate = (rows: readonly PlayerRow[], test: (r: PlayerRow) => boolean): Rate => ({ k: rows.filter(test).length, n: rows.length });
const reachR5 = (r: PlayerRow) => r.rounds[4]!.entered;
const winner = (r: PlayerRow) => r.placement === 1;

export type Summary = {
  config: Omit<SimConfig, "outputPath">;
  games: { requested: number; completed: number; failed: number; failures: { message: string; count: number; firstSeed: number; at: string }[] };
  policies: { policy: PolicyName; n: number; placement: number[]; win: Rate; reachR5: Rate; total: number[]; points: number[]; finalBB: number[] }[];
  seats: { seat: number; n: number; placement: number[]; win: Rate; reachR5: Rate }[];
  survival: { round: number; entered: number; survivedPct: number }[];
  r1Groups: { record: string; n: number; reachR3Survive: Rate; reachR5: Rate; win: Rate; placement: number[] }[];
  r1Ranks: { rank: number; n: number; reachR5: Rate; win: Rate; placement: number[] }[];
  draft: { round: 2 | 4; order: number; n: number; pickRank: number[]; pickPrice: number[]; skipped: Rate; reachR5: Rate; placement: number[] }[];
  cards: { rank: number; price: number; shopBuys: number; draftBuys: number; sold: number; finalHeld: number; buysPerPlayer: number }[];
  economy: { round: number; n: number; startBB: number[]; investBB: number[]; matchBB: number[]; endBB: number[]; pointsGained: number[]; buys: number[]; rerolls: number[] }[];
  score: {
    finalists: number; points: number[]; hand: number[]; stack: number[]; total: number[]; rankPoints: number[];
    winnerHadMostPoints: Rate; finalHands: Record<string, number>;
  };
  matches: { round: number; boards: number; splitRate: Rate; suddenDeathsPerBoard: number; highCardDrawMatches: number; forfeits: number; categories: Record<string, number> }[];
  perf: { msPerGame: number };
};

export function summarize(config: SimConfig, games: readonly GameRow[], players: readonly PlayerRow[]): Summary {
  const ok = games.filter((g) => g.ok);
  const failures = [...groupBy(games.filter((g) => !g.ok), (g) => `${g.error}|${g.failedAt}`).values()]
    .map((list) => ({ message: list[0]!.error!, count: list.length, firstSeed: list[0]!.seed, at: list[0]!.failedAt! }));
  const { outputPath: _outputPath, ...publicConfig } = config; void _outputPath;

  const cardCounts = new Map<number, { shop: number; draft: number; sold: number; held: number }>();
  const slot = (rank: number) => cardCounts.get(rank) ?? (cardCounts.set(rank, { shop: 0, draft: 0, sold: 0, held: 0 }), cardCounts.get(rank)!);
  for (const p of players) {
    for (const r of p.rounds) {
      for (const b of r.buys) slot(b.rank)[b.via]++;
      for (const s of r.sells) slot(s.rank).sold++;
    }
    if (reachR5(p)) for (const rank of p.finalRanks) slot(rank).held++;
  }
  const finalists = players.filter(reachR5);
  const finalistsByGame = groupBy(finalists, (p) => p.game);
  const mostPoints = [...finalistsByGame.values()].map((rows) => {
    const top = Math.max(...rows.map((r) => r.points));
    return rows.find(winner) ? rows.filter((r) => r.points === top).some(winner) : false;
  });
  const finalHands: Record<string, number> = {};
  for (const p of finalists) if (p.finalHand) finalHands[p.finalHand] = (finalHands[p.finalHand] ?? 0) + 1;

  const draftRows: Summary["draft"] = [];
  for (const round of [2, 4] as const) {
    const key = round === 2 ? "r2" : "r4";
    for (const [order, rows] of [...groupBy(players.filter((p) => p.draftOrder[key] !== null), (p) => p.draftOrder[key]!)].sort(([a], [b]) => a - b)) {
      const picks = rows.flatMap((p) => p.rounds[round - 1]!.buys.filter((b) => b.via === "draft"));
      draftRows.push({
        round, order, n: rows.length, pickRank: picks.map((b) => b.rank), pickPrice: picks.map((b) => b.price),
        skipped: { k: rows.length - picks.length, n: rows.length }, reachR5: rate(rows, reachR5), placement: rows.map((p) => p.placement),
      });
    }
  }

  const matchAgg = ROUNDS.map((round) => {
    const list = ok.flatMap((g) => g.matchStats.filter((m) => m.round === round));
    const boards = list.reduce((a, m) => a + m.matches, 0);
    const categories: Record<string, number> = {};
    for (const m of list) for (const [c, v] of Object.entries(m.categories)) categories[c] = (categories[c] ?? 0) + v;
    return {
      round, boards, splitRate: { k: list.reduce((a, m) => a + m.splits, 0), n: boards },
      suddenDeathsPerBoard: boards ? list.reduce((a, m) => a + m.suddenDeaths, 0) / boards : NaN,
      highCardDrawMatches: list.reduce((a, m) => a + m.highCardDraws, 0), forfeits: list.reduce((a, m) => a + m.forfeits, 0), categories,
    };
  });

  return {
    config: publicConfig,
    games: { requested: config.games, completed: ok.length, failed: games.length - ok.length, failures },
    policies: [...groupBy(players, (p) => p.policy)].map(([policy, rows]) => ({
      policy, n: rows.length, placement: rows.map((r) => r.placement), win: rate(rows, winner), reachR5: rate(rows, reachR5),
      total: rows.filter(reachR5).map((r) => r.total), points: rows.map((r) => r.points), finalBB: rows.map((r) => r.finalBB),
    })),
    seats: [...groupBy(players, (p) => p.seat)].sort(([a], [b]) => a - b).map(([seat, rows]) => ({
      seat, n: rows.length, placement: rows.map((r) => r.placement), win: rate(rows, winner), reachR5: rate(rows, reachR5),
    })),
    survival: ROUNDS.map((round) => {
      const entered = players.filter((p) => p.rounds[round - 1]!.entered).length;
      const next = round === 5 ? entered : players.filter((p) => p.rounds[round]!.entered).length;
      return { round, entered: ok.length ? entered / ok.length : NaN, survivedPct: entered ? next / entered : NaN };
    }),
    r1Groups: [...groupBy(players.filter((p) => p.r1), (p) => `${p.r1!.w}W ${p.r1!.d}D ${p.r1!.l}L`)]
      .sort(([a], [b]) => b.localeCompare(a)).map(([record, rows]) => ({
        record, n: rows.length, reachR3Survive: rate(rows, (r) => r.rounds[3]!.entered), reachR5: rate(rows, reachR5),
        win: rate(rows, winner), placement: rows.map((r) => r.placement),
      })),
    r1Ranks: [...groupBy(players, (p) => p.r1Rank)].sort(([a], [b]) => a - b).map(([rank, rows]) => ({
      rank, n: rows.length, reachR5: rate(rows, reachR5), win: rate(rows, winner), placement: rows.map((r) => r.placement),
    })),
    draft: draftRows,
    cards: [...cardCounts].sort(([a], [b]) => b - a).map(([rank, c]) => ({
      rank, price: cardPrice(rank), shopBuys: c.shop, draftBuys: c.draft, sold: c.sold, finalHeld: c.held,
      buysPerPlayer: players.length ? (c.shop + c.draft) / players.length : NaN,
    })),
    economy: ROUNDS.map((round) => {
      const rows = players.filter((p) => p.rounds[round - 1]!.entered).map((p) => p.rounds[round - 1]!);
      return {
        round, n: rows.length, startBB: rows.map((r) => r.startBB), investBB: rows.map((r) => r.startBB - r.preShowdownBB),
        matchBB: rows.map((r) => r.endBB - r.preShowdownBB), endBB: rows.map((r) => r.endBB), pointsGained: rows.map((r) => r.endPoints - r.startPoints),
        buys: rows.map((r) => r.buys.length), rerolls: rows.map((r) => r.rerolls),
      };
    }),
    score: {
      finalists: finalists.length, points: finalists.map((p) => p.points), hand: finalists.map((p) => p.handScore),
      stack: finalists.map((p) => p.stackScore), total: finalists.map((p) => p.total), rankPoints: finalists.map((p) => p.rankPoints),
      winnerHadMostPoints: { k: mostPoints.filter(Boolean).length, n: mostPoints.length }, finalHands,
    },
    matches: matchAgg,
    perf: { msPerGame: mean(games.map((g) => g.ms)) },
  };
}
