import { assertPoolIntegrity } from "../../src/game/cardPool";
import { BALANCE, cardPrice, purchaseLimitFor, rerollLimitFor } from "../../src/game/config";
import {
  autoPickDraft, beginSecondary, buyCard, createGame, finalStandings, getCard, leaveRoundResult, lockRunLoadouts, openDraft,
  pickDraftCard, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, resolveSurvival, setRunLoadout, startNextRound,
} from "../../src/game/engine";
import type { PorenaGameState } from "../../src/game/types";
import { makePolicy, type Policy } from "./policies";
import { makeRandom } from "./stats";
import { EXPECTED_ALIVE_AFTER, type GameOutcome, type MatchRoundStats, type PlayerRow, type PolicyName, type RoundRow, type SimConfig } from "./types";

const STEP_LIMIT = 600;

function dealPolicies(config: SimConfig, game: number, seed: number): PolicyName[] {
  const n = config.policies.length; const random = makeRandom(seed ^ 0x9e3779b9);
  return Array.from({ length: BALANCE.playerCount }, (_, seat) =>
    config.policies[config.assignment === "fixed" ? seat % n : config.assignment === "rotate" ? (seat + game) % n : Math.floor(random() * n)]!);
}

const emptyRound = (round: number): RoundRow => ({
  round, entered: false, startPoints: 0, startBB: 0, preShowdownBB: 0, endPoints: 0, endBB: 0, ownedCount: 0, buys: [], sells: [], rerolls: 0,
});

/** Plays one full game through the engine's own phase machine, the same calls `room.ts` makes. */
export function playGame(config: SimConfig, game: number): GameOutcome {
  const seed = (config.seed + game) >>> 0 || 1;
  const started = performance.now();
  const names = dealPolicies(config, game, seed);
  const policies = new Map<string, Policy>();
  let state: PorenaGameState = createGame(seed, "seeded", 2);
  state.players.forEach((p, i) => policies.set(p.id, makePolicy(names[i]!, seed + i)));
  const rows = new Map<string, PlayerRow>(state.players.map((p, i) => [p.id, {
    game, seed, playerId: p.id, seat: i + 1, policy: names[i]!, r1: null, r1Rank: 0, draftOrder: { r2: null, r4: null },
    rounds: [1, 2, 3, 4, 5].map(emptyRound), eliminatedRound: null, placement: 0, rankPoints: 0, points: 0, handScore: 0,
    stackScore: 0, total: 0, finalHand: null, finalBB: 0, finalRanks: [],
  }]));
  const aliveAfter: number[] = [];
  const alive = () => state.players.filter((p) => !p.eliminated);
  /** Alive seats the simulator plays itself; ENGINE_BOT seats are left to the game's own bot brain. */
  const policySeats = () => alive().filter((p) => policies.get(p.id)!.shop).map((p) => p.id);
  const roundRow = (id: string, round = state.round) => rows.get(id)!.rounds[round - 1]!;

  const openRound = () => {
    for (const p of alive()) Object.assign(roundRow(p.id), { entered: true, startPoints: p.points, startBB: p.stackBB, ownedCount: p.ownedCardIds.length });
  };

  const shopStep = () => {
    const before = new Map(alive().map((p) => [p.id, { owned: new Set(p.ownedCardIds), rerolls: p.rerollsUsed ?? 0 }]));
    for (const id of policySeats()) {
      const policy = policies.get(id)!; let used = 0;
      for (let step = 0; step < 24; step += 1) {
        const p = state.players.find((x) => x.id === id)!; const round = state.round;
        const action = policy.shop!({
          round, playerId: id, stackBB: p.stackBB, handLimit: BALANCE.handLimits[round],
          purchasesLeft: purchaseLimitFor(round) - p.purchasesThisRound,
          rerollsLeft: Math.max(0, Math.min(rerollLimitFor(round) - (p.rerollsUsed ?? 0), config.maxRerolls - used)),
          rerollCost: BALANCE.rerollCostBB, ownedCards: p.ownedCardIds.map((c) => getCard(state, c)),
          shopCards: p.shopCardIds.map((c) => { const card = getCard(state, c); return { card, price: cardPrice(card.rank) }; }),
        });
        try {
          if (action.type === "BUY") state = buyCard(state, id, action.cardId);
          else if (action.type === "REROLL") { state = rerollShop(state, id); used += 1; }
          else break;
        } catch { break; } // an illegal request ends this seat's shopping, exactly as the engine's own policy hook does
      }
    }
    // Seats that finished a legal hand are locked in as "humans" so the engine's bot brain leaves them alone.
    const settled = policySeats().filter((id) => state.players.find((p) => p.id === id)!.ownedCardIds.length >= BALANCE.handLimits[state.round]);
    state = prepareShowdown(state, settled);
    for (const p of alive()) {
      const b = before.get(p.id)!; const row = roundRow(p.id);
      for (const id of p.ownedCardIds) if (!b.owned.has(id)) { const rank = getCard(state, id).rank; row.buys.push({ rank, price: cardPrice(rank), via: "shop" }); }
      for (const id of b.owned) if (!p.ownedCardIds.includes(id)) row.sells.push({ rank: getCard(state, id).rank });
      row.rerolls += (p.rerollsUsed ?? 0) - b.rerolls;
    }
  };

  const draftStep = () => {
    const draft = state.draft!; const id = draft.order[draft.picks.length]!.playerId;
    const policy = policies.get(id)!; const p = state.players.find((x) => x.id === id)!;
    if (policy.pickDraft) {
      const options = draft.cardIds.filter((c) => state.ownershipCardPool.find((e) => e.card.id === c)!.state === "AVAILABLE")
        .map((c) => ({ card: getCard(state, c), price: cardPrice(getCard(state, c).rank) })).filter((o) => o.price <= p.stackBB);
      if (options.length) { state = pickDraftCard(state, id, policy.pickDraft(options, p.ownedCardIds.map((c) => getCard(state, c)))); return; }
    }
    state = autoPickDraft(state);
  };

  const closeDraft = () => {
    const draft = state.draft!; const key = state.round === 2 ? "r2" : "r4";
    draft.order.forEach((o, i) => { rows.get(o.playerId)!.draftOrder[key] = i + 1; });
    for (const pick of draft.picks) if (pick.cardId) roundRow(pick.playerId).buys.push({ rank: getCard(state, pick.cardId).rank, price: pick.price, via: "draft" });
  };

  const closeRound = () => {
    for (const p of alive().concat(state.players.filter((x) => x.eliminated && x.eliminatedRound === state.round))) {
      Object.assign(roundRow(p.id), { endPoints: p.points, endBB: p.stackBB });
    }
  };

  openRound();
  let error: string | undefined; let failedAt: string | undefined;
  try {
    for (let step = 0; state.phase !== "GAME_RESULT"; step += 1) {
      if (step > STEP_LIMIT) throw new Error("phase loop did not converge");
      const phase = state.phase;
      switch (phase) {
        case "SHOP": shopStep(); break;
        case "DRAFT_ORDER": state = openDraft(state); break;
        case "OPEN_DRAFT": draftStep(); if (state.phase !== "OPEN_DRAFT") closeDraft(); break;
        case "RUN_LOADOUT": {
          for (const id of policySeats()) {
            const p = state.players.find((x) => x.id === id)!;
            if (p.ownedCardIds.length === 3) state = setRunLoadout(state, id, policies.get(id)!.loadout!(p.ownedCardIds.map((c) => getCard(state, c))).map((c) => c.id));
          }
          state = lockRunLoadouts(state, policySeats()); break;
        }
        case "SHOWDOWN_PRIMARY":
          for (const p of alive()) roundRow(p.id).preShowdownBB = p.stackBB;
          state = resolvePrimary(state); break;
        case "GROUP_ASSIGNMENT": state = beginSecondary(state); break;
        case "SHOWDOWN_SECONDARY": state = resolveSecondary(state); break;
        case "SURVIVAL_READY": state = resolveSurvival(state); break;
        case "ROUND_RESULT": {
          closeRound(); assertPoolIntegrity(state);
          const survivors = alive().length;
          aliveAfter[state.round - 1] = survivors;
          if (survivors !== EXPECTED_ALIVE_AFTER[state.round] && !state.survival) {
            throw new Error(`R${state.round} left ${survivors} players, expected ${EXPECTED_ALIVE_AFTER[state.round]}`);
          }
          state = leaveRoundResult(state); break;
        }
        case "NEXT_ROUND": state = startNextRound(state); openRound(); break;
        default: throw new Error(`Unhandled phase ${phase}`);
      }
      assertPoolIntegrity(state);
    }
    for (const p of alive()) roundRow(p.id).endPoints = p.points; // R5 has no ROUND_RESULT step
    closeRound();
    aliveAfter[4] = alive().length;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    failedAt = `R${state.round} ${state.phase}`;
  }
  const ms = performance.now() - started;
  if (error) return { game: { game, seed, ok: false, error, failedAt, aliveAfter, matchStats: [], ms }, players: [] };

  finish(state, rows);
  return { game: { game, seed, ok: true, aliveAfter, matchStats: matchStats(state), ms }, players: [...rows.values()] };
}

function finish(state: PorenaGameState, rows: Map<string, PlayerRow>): void {
  const r1 = state.matches.filter((m) => m.id.startsWith("1-") && m.matchday === 3);
  for (const match of r1) for (const [id, rec] of Object.entries(match.swissAfter ?? {})) rows.get(id)!.r1 = { w: rec.wins, d: rec.draws, l: rec.losses };
  const r1Points = new Map([...rows.values()].map((r) => [r.playerId, r.rounds[0]!.endPoints]));
  for (const row of rows.values()) row.r1Rank = 1 + [...r1Points.values()].filter((v) => v > r1Points.get(row.playerId)!).length;
  for (const s of finalStandings(state)) {
    const row = rows.get(s.playerId)!; const player = state.players.find((p) => p.id === s.playerId)!;
    Object.assign(row, {
      placement: s.placement, rankPoints: s.rankPoints, points: s.points, handScore: s.handScore, stackScore: s.stackScore, total: s.total,
      finalHand: s.hand?.category ?? null, finalBB: s.stackBB, finalRanks: s.cards.map((c) => c.rank),
      eliminatedRound: player.eliminated ? player.eliminatedRound ?? null : null,
    });
  }
}

function matchStats(state: PorenaGameState): MatchRoundStats[] {
  const stats = new Map<number, MatchRoundStats>();
  for (const match of state.matches) {
    const round = Number(match.id.split("-")[0]);
    const s = stats.get(round) ?? { round, matches: 0, splits: 0, suddenDeaths: 0, highCardDraws: 0, forfeits: 0, categories: {} };
    stats.set(round, s);
    const regulation = Math.max(1, match.runoutCount);
    match.boardResults.slice(0, regulation).forEach((results, i) => {
      s.matches += 1; if ((match.boardWinnerIds[i]?.length ?? 0) > 1) s.splits += 1;
      for (const r of results) s.categories[r.hand.category] = (s.categories[r.hand.category] ?? 0) + 1;
    });
    s.suddenDeaths += match.suddenDeathCount; if (match.highCardDraw) s.highCardDraws += 1;
    s.forfeits += match.results.filter((r) => r.hand.categoryRank === 0).length;
  }
  return [...stats.values()].sort((a, b) => a.round - b.round);
}
