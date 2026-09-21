import { shuffle, type Card } from "../core/poker/cards";
import { compareHands, evaluateOmahaPreflop, evaluatePartial, findBestFive, findBestOmaha, placeInRanking, rankPlayers, type HandValue } from "../core/poker/evaluate";
import { applyAugment, augmentPool } from "./augments";
import { assertPoolIntegrity, createOwnershipPool, releasePlayerCards } from "./cardPool";
import { BALANCE, cardPrice, FINAL_ROUND_PLACEMENT_POINTS, purchaseLimitFor, regularShopSizeFor, rerollLimitFor } from "./config";
import { bestBotSelection, bestRunLoadout, pickBotAugment, rankBotPurchases, scoreBotPlan, shouldBotReroll } from "./botStrategy";
import { calculateIcm } from "./icm";
import { emptySwissRecord, swissPairs } from "./swiss";
import { createShowdownDeck, drawCommunityBoards } from "./showdownDeck";
import { canSellWithoutBlocking } from "./shopRules";
import type { Augment, PorenaGameState, MatchResult, PlayerShowdown, PlayerState, Round, StreetSnapshot } from "./types";

function nextRandom(state: PorenaGameState): number {
  if (state.randomMode === "secure") return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
  let x = state.seed | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x >>> 0;
  return state.seed / 4294967296;
}

function log(state: PorenaGameState, message: string, tone: "info" | "win" | "danger" | "economy" = "info"): void {
  state.logs.unshift({ id: ++state.logSequence, message, tone });
  state.logs = state.logs.slice(0, 24);
}

function drawAvailable(state: PorenaGameState) {
  const available = state.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE");
  if (!available.length) return null;
  return available[Math.floor(nextRandom(state) * available.length)]!;
}

function reserveShopCards(state: PorenaGameState, player: PlayerState): void {
  const targetSize = state.rulesVersion === 2 ? regularShopSizeFor(state.round) : player.shopSize;
  while (player.shopCardIds.length < targetSize) {
    const entry = drawAvailable(state);
    if (!entry) break;
    entry.state = "RESERVED_IN_SHOP"; entry.reservedPlayerId = player.id;
    player.shopCardIds.push(entry.card.id);
  }
}

function giveRandomOwnedCard(state: PorenaGameState, player: PlayerState): void {
  const entry = drawAvailable(state);
  if (!entry) throw new Error("No ownership card available");
  entry.state = "OWNED"; entry.ownerPlayerId = player.id;
  player.ownedCardIds.push(entry.card.id);
}

function releaseShop(state: PorenaGameState, player: PlayerState): void {
  for (const id of player.shopCardIds) {
    if (player.lockedShopCardIds?.includes(id)) continue;
    const entry = state.ownershipCardPool.find((item) => item.card.id === id)!;
    entry.state = "AVAILABLE"; delete entry.reservedPlayerId;
  }
  player.shopCardIds = player.shopCardIds.filter((id) => player.lockedShopCardIds?.includes(id));
}

function playerById(state: PorenaGameState, id: string): PlayerState {
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error(`Unknown player ${id}`);
  return player;
}

function cardsFor(state: PorenaGameState, ids: readonly string[]): Card[] {
  return ids.map((id) => state.ownershipCardPool.find((entry) => entry.card.id === id)!.card);
}

function discountedPrice(player: PlayerState, card: Card): number {
  let price = cardPrice(card.rank);
  if (player.augments.some((augment) => augment.id === "suit_discount" && augment.suit === card.suit)) price -= 3;
  if (player.augments.some((augment) => augment.id === "rank_discount") && card.rank <= 9) price -= 2;
  return Math.max(1, price);
}

export function createGame(seed = Date.now(), randomMode: "seeded" | "secure" = "seeded", rulesVersion: 1 | 2 = 2): PorenaGameState {
  seed = (seed >>> 0) || 1;
  const playerNames = ["나", "리버 폭스", "블러프 캣", "스페이드 울프", "턴 샤크", "클럽 레이븐", "다이아 바이퍼", "올인 베어"];
  const players: PlayerState[] = Array.from({ length: BALANCE.playerCount }, (_, index) => ({
    id: `p${index + 1}`, name: playerNames[index]!,
    stackBB: BALANCE.startStackBB, ownedCardIds: [], shopCardIds: [], selectedCardIds: [],
    shopSize: BALANCE.baseShopSize, purchasesThisRound: 0, rerollsUsed: 0, shopLocked: false, augments: [],
    points: 0, winStreak: 0, loseStreak: 0, eliminated: false,
  }));
  const state: PorenaGameState = {
    rulesVersion, round: 1, phase: "SHOP", players, ownershipCardPool: createOwnershipPool(), matches: [],
    winnerGroup: [], loserGroup: [], roundResults: [], augmentChoices: [], encounterSequence: 0, seed, randomMode, logSequence: 0, logs: [],
  };
  for (const player of players) giveRandomOwnedCard(state, player);
  for (const player of players) reserveShopCards(state, player);
  log(state, "8명의 플레이어에게 공용 풀에서 카드 1장씩 지급했습니다.");
  assertPoolIntegrity(state);
  return state;
}

export function buyCard(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "SHOP" || player.eliminated) throw new Error("지금은 구매할 수 없습니다.");
  if (!player.shopCardIds.includes(cardId)) throw new Error("내 상점에 예약된 카드가 아닙니다.");
  if (player.ownedCardIds.length >= BALANCE.handLimits[state.round]) throw new Error("이번 라운드 보유 한도에 도달했습니다.");
  if (player.purchasesThisRound >= purchaseLimitFor(state.round, state.rulesVersion ?? 1)) throw new Error("이번 라운드 구매 횟수를 모두 사용했습니다.");
  const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!;
  const price = discountedPrice(player, entry.card);
  if (player.stackBB < price) throw new Error("BB가 부족합니다.");
  player.stackBB -= price; player.purchasesThisRound += 1;
  player.shopCardIds = player.shopCardIds.filter((id) => id !== cardId); player.ownedCardIds.push(cardId);
  player.lockedShopCardIds = (player.lockedShopCardIds ?? []).filter((id) => id !== cardId);
  entry.state = "OWNED"; entry.ownerPlayerId = player.id; delete entry.reservedPlayerId;
  log(state, `${player.name} · ${entry.card.id} 구매 −${price}BB`, "economy");
  assertPoolIntegrity(state); return state;
}

export function sellCard(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "SHOP" || !player.ownedCardIds.includes(cardId)) throw new Error("판매할 수 없는 카드입니다.");
  if (!canSellWithoutBlocking({ ownedCount: player.ownedCardIds.length, purchases: player.purchasesThisRound,
    purchaseLimit: purchaseLimitFor(state.round, state.rulesVersion ?? 1), handLimit: BALANCE.handLimits[state.round] })) {
    throw new Error("남은 구매 횟수로 필수 보유 카드를 채울 수 없어 판매할 수 없습니다.");
  }
  const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!;
  const rate = player.augments.some((augment) => augment.id === "sell_bonus") ? 0.8 : BALANCE.sellRate;
  const refund = Math.floor(cardPrice(entry.card.rank) * rate);
  player.stackBB += refund; player.ownedCardIds = player.ownedCardIds.filter((id) => id !== cardId); player.selectedCardIds = player.selectedCardIds.filter((id) => id !== cardId);
  entry.state = "AVAILABLE"; delete entry.ownerPlayerId;
  log(state, `${player.name} · ${entry.card.id} 판매 +${refund}BB`, "economy");
  assertPoolIntegrity(state); return state;
}

export function rerollShop(source: PorenaGameState, playerId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  const cost = Math.max(0, BALANCE.rerollCostBB - (player.augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0));
  if (state.phase !== "SHOP" || player.eliminated || player.stackBB < cost) throw new Error("리롤할 수 없습니다.");
  if ((player.rerollsUsed ?? 0) >= rerollLimitFor(state.round, state.rulesVersion ?? 1)) throw new Error("이번 라운드 리롤 횟수를 모두 사용했습니다.");
  if (player.shopCardIds.length > 0 && player.shopCardIds.every((id) => player.lockedShopCardIds?.includes(id))) throw new Error("모든 상점 카드가 잠겨 있어 리롤할 수 없습니다.");
  assertPoolIntegrity(state);
  releaseShop(state, player); player.stackBB -= cost; reserveShopCards(state, player);
  player.rerollsUsed = (player.rerollsUsed ?? 0) + 1;
  log(state, `${player.name} · 상점 리롤 −${cost}BB`, "economy");
  assertPoolIntegrity(state); return state;
}

export function toggleShopLock(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  const entry = state.ownershipCardPool.find((e) => e.card.id === cardId);
  if (state.phase !== "SHOP" || player.eliminated || !player.shopCardIds.includes(cardId) || entry?.state !== "RESERVED_IN_SHOP" || entry.reservedPlayerId !== playerId) throw new Error("내 상점 카드만 잠글 수 있습니다.");
  const locked = player.lockedShopCardIds ?? [];
  if (locked.includes(cardId)) player.lockedShopCardIds = locked.filter((id) => id !== cardId);
  else {
    if (player.stackBB < BALANCE.cardLockCostBB) throw new Error("카드 잠금에 3BB가 필요합니다.");
    player.stackBB -= BALANCE.cardLockCostBB;
    player.lockedShopCardIds = [...locked, cardId];
  }
  log(state, `${player.name} · 카드 잠금 ${locked.includes(cardId) ? "해제" : "−3BB"}`, "economy");
  assertPoolIntegrity(state); return state;
}

export function toggleSelectedCard(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.round !== 2) throw new Error("카드 선택은 R2에서만 사용합니다.");
  if (!player.ownedCardIds.includes(cardId)) throw new Error("보유 카드만 선택할 수 있습니다.");
  if (player.selectedCardIds.includes(cardId)) player.selectedCardIds = player.selectedCardIds.filter((id) => id !== cardId);
  else if (player.selectedCardIds.length < 2) player.selectedCardIds.push(cardId);
  return state;
}

function aiPrepare(state: PorenaGameState, humanIds: readonly string[] = ["p1"]): void {
  const limit = BALANCE.handLimits[state.round];
  const planContext = { rulesVersion: state.rulesVersion ?? 1 } as const;
  for (const player of state.players.filter((item) => !item.eliminated && !humanIds.includes(item.id))) {
    const ownedCards = () => cardsFor(state, player.ownedCardIds);
    const buy = (cardId: string) => {
      const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!; const price = discountedPrice(player, entry.card);
      player.stackBB -= price; player.purchasesThisRound += 1; player.shopCardIds = player.shopCardIds.filter((id) => id !== cardId); player.ownedCardIds.push(cardId);
      entry.state = "OWNED"; entry.ownerPlayerId = player.id; delete entry.reservedPlayerId;
    };
    const reroll = () => {
      const cost = Math.max(0, BALANCE.rerollCostBB - (player.augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0));
      player.stackBB -= cost; releaseShop(state, player); reserveShopCards(state, player); player.rerollsUsed = (player.rerollsUsed ?? 0) + 1;
    };
    while (player.ownedCardIds.length < limit && player.purchasesThisRound < purchaseLimitFor(state.round, state.rulesVersion ?? 1)) {
      const options = player.shopCardIds.map((id) => state.ownershipCardPool.find((entry) => entry.card.id === id)!)
        .map((entry) => ({ card: entry.card, price: discountedPrice(player, entry.card) })).filter((entry) => entry.price <= player.stackBB);
      const ranked = rankBotPurchases(state.round, player, ownedCards(), options, planContext); const best = ranked[0];
      const rerollCost = Math.max(0, BALANCE.rerollCostBB - (player.augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0));
      const missing = limit - player.ownedCardIds.length;
      if (player.stackBB >= rerollCost + missing * 5 && shouldBotReroll(state.round, player, best, rerollCost)) { reroll(); continue; }
      if (!best) break;
      buy(best.card.id);
    }

    // Extra purchase capacity becomes a deliberate upgrade: compare every legal swap by expected match EV.
    while (player.ownedCardIds.length === limit && player.purchasesThisRound < purchaseLimitFor(state.round, state.rulesVersion ?? 1)) {
      const baseline = scoreBotPlan(state.round, ownedCards(), player.stackBB, `${player.id}:upgrade`, planContext);
      let bestSwap: { ownedId: string; shopId: string; utility: number } | null = null;
      for (const ownedId of player.ownedCardIds) for (const shopId of player.shopCardIds) {
        const owned = state.ownershipCardPool.find((entry) => entry.card.id === ownedId)!.card;
        const offered = state.ownershipCardPool.find((entry) => entry.card.id === shopId)!.card;
        const refundRate = player.augments.some((augment) => augment.id === "sell_bonus") ? 0.8 : BALANCE.sellRate;
        const refund = Math.floor(cardPrice(owned.rank) * refundRate); const price = discountedPrice(player, offered);
        if (player.stackBB + refund < price) continue;
        const replacement = ownedCards().filter((card) => card.id !== ownedId).concat(offered);
        const plan = scoreBotPlan(state.round, replacement, player.stackBB + refund - price, `${player.id}:upgrade`, planContext);
        if (plan.utility > baseline.utility + 2.25 && (!bestSwap || plan.utility > bestSwap.utility)) bestSwap = { ownedId, shopId, utility: plan.utility };
      }
      if (bestSwap) {
        const oldEntry = state.ownershipCardPool.find((entry) => entry.card.id === bestSwap!.ownedId)!;
        const refundRate = player.augments.some((augment) => augment.id === "sell_bonus") ? 0.8 : BALANCE.sellRate;
        player.stackBB += Math.floor(cardPrice(oldEntry.card.rank) * refundRate); player.ownedCardIds = player.ownedCardIds.filter((id) => id !== bestSwap!.ownedId);
        oldEntry.state = "AVAILABLE"; delete oldEntry.ownerPlayerId; buy(bestSwap.shopId); continue;
      }
      const rerollCost = Math.max(0, BALANCE.rerollCostBB - (player.augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0));
      if ((player.rerollsUsed ?? 0) < rerollLimitFor(state.round, state.rulesVersion ?? 1) && player.stackBB >= rerollCost + 20 && baseline.equity < 0.58) { reroll(); continue; }
      break;
    }
    player.selectedCardIds = bestBotSelection(state.round, ownedCards());
  }
}

export function prepareShowdown(source: PorenaGameState, humanIds: readonly string[] = ["p1"]): PorenaGameState {
  if (source.phase !== "SHOP") throw new Error("상점 단계가 아닙니다.");
  const state = structuredClone(source); aiPrepare(state, humanIds);
  const humans = humanIds.map((id) => playerById(state, id)).filter((p) => !p.eliminated);
  if (humans.some((p) => p.ownedCardIds.length < BALANCE.handLimits[state.round])) throw new Error(`R${state.round}은 보유 카드 ${BALANCE.handLimits[state.round]}장이 필요합니다.`);
  const requiredSelection = state.round === 2 ? 2 : 0;
  if (requiredSelection && humans.some((p) => p.selectedCardIds.length !== requiredSelection)) { state.phase = "DECK_SELECT"; return state; }
  state.phase = "SHOWDOWN_PRIMARY"; assertPoolIntegrity(state); return state;
}

export function confirmSelection(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source); const human = playerById(state, "p1");
  const required = state.round === 2 ? 2 : 0;
  if (!required || human.selectedCardIds.length !== required) throw new Error(`R${state.round} 출전 카드를 올바르게 나누세요.`);
  state.phase = "SHOWDOWN_PRIMARY"; log(state, "R2 홀카드 2장을 확정했습니다."); return state;
}

function handFor(state: PorenaGameState, playerId: string, board: Card[], gameNumber?: 1 | 2): HandValue {
  const player = playerById(state, playerId);
  const selected = state.round === 2 && state.rulesVersion === 2 ? [player.selectedCardIds[0]!, player.selectedCardIds[gameNumber ?? 1]!]
    : player.selectedCardIds;
  const owned = cardsFor(state, state.round === 2 ? selected : player.ownedCardIds);
  if (state.round === 3) return findBestOmaha(owned, board);
  if (state.round === 5) return findBestFive(owned);
  return findBestFive([...owned, ...board]);
}

function encounterBoards(
  state: PorenaGameState,
  participantIds: readonly string[],
  boardCount: number,
): Card[][] {
  const participantOwnedCards = participantIds.flatMap((playerId) =>
    cardsFor(state, playerById(state, playerId).ownedCardIds),
  );
  const deck = createShowdownDeck(participantOwnedCards, () => nextRandom(state));
  return drawCommunityBoards(deck, boardCount);
}

function resolveParticipants(
  state: PorenaGameState,
  playerIds: string[],
  boardCount: number,
  stage: MatchResult["stage"],
  requireSingleWinner = true,
  tiebreakKind?: MatchResult["tiebreakKind"],
  preserveRegulationTie = false,
  gameNumber?: 1 | 2,
  suppliedBoards?: Card[][],
): MatchResult {
  const boards = suppliedBoards ?? encounterBoards(state, playerIds, boardCount);
  const evaluationBoards = boards.length ? boards : [[]];
  const boardRankings = evaluationBoards.map((board) => rankPlayers(playerIds.map((playerId) => ({ playerId, hand: handFor(state, playerId, board, gameNumber) }))));
  const resultsForBoard = (ids: string[], board: Card[]): PlayerShowdown[] => {
    const ranking = rankPlayers(ids.map((playerId) => ({ playerId, hand: handFor(state, playerId, board, gameNumber) })));
    return ids.map((playerId) => {
      const hand = handFor(state, playerId, board, gameNumber);
      return { playerId, hand, place: placeInRanking(ranking, playerId), usedCardIds: hand.bestFive.map((card) => card.id) };
    });
  };
  const boardResults = evaluationBoards.map((board) => resultsForBoard(playerIds, board));
  const streetSnapshots = boards.map((board) => streetSnapshotsFor(state, playerIds, board, gameNumber));
  const boardWinnerIds = boardRankings.map((ranking) => [...ranking[0]!]);
  let winnerIds: string[];
  let suddenDeathCount = 0;
  let highCardDraw: MatchResult["highCardDraw"];
  if (boards.length === 2 && playerIds.length === 2) {
    const wins = new Map(playerIds.map((id) => [id, 0]));
    for (const ranking of boardRankings) if (ranking[0]!.length === 1) wins.set(ranking[0]![0]!, wins.get(ranking[0]![0]!)! + 1);
    const [a, b] = playerIds; const delta = wins.get(a)! - wins.get(b)!;
    winnerIds = delta > 0 ? [a] : delta < 0 ? [b] : [];
  } else winnerIds = boardRankings[0]![0]!;
  const regulationWinnerIds = preserveRegulationTie && winnerIds.length > 1 ? [...winnerIds] : undefined;
  const tiebreakStartIndex = boards.length;
  while (requireSingleWinner && winnerIds.length !== 1) {
    const tied = winnerIds.length ? winnerIds : playerIds;
    if (suddenDeathCount >= 2) {
      // A separate rank-only deck cannot tie and never changes owned cards.
      const ranks = shuffle(Array.from({ length: 13 }, (_, i) => i + 2), () => nextRandom(state));
      const draws = tied.map((playerId, i) => ({ playerId, rank: ranks[i]! }));
      const winnerId = draws.reduce((best, draw) => draw.rank > best.rank ? draw : best).playerId;
      highCardDraw = { draws, winnerId };
      winnerIds = [winnerId];
      break;
    }
    // The fresh deck excludes every player in the original encounter, even
    // when only the tied leaders continue in the decider.
    const sudden = encounterBoards(state, playerIds, 1)[0]!;
    boards.push(sudden); suddenDeathCount += 1;
    const suddenRanking = rankPlayers(tied.map((playerId) => ({ playerId, hand: handFor(state, playerId, sudden, gameNumber) })));
    winnerIds = suddenRanking[0]!;
    boardResults.push(resultsForBoard(tied, sudden));
    streetSnapshots.push(streetSnapshotsFor(state, tied, sudden, gameNumber));
    boardWinnerIds.push([...winnerIds]);
  }
  // R2 recaps the deciding board. R4 keeps every original participant in the
  // summary while taking each tied leader's latest tiebreak hand.
  let results = boardResults[boardResults.length - 1]!;
  if (tiebreakKind && suddenDeathCount > 0) {
    const regulation = boardResults[0]!;
    const regulationLeaders = new Set(boardWinnerIds[0]!);
    const latest = new Map<string, PlayerShowdown>();
    for (const boardResult of boardResults) for (const result of boardResult) latest.set(result.playerId, result);
    results = playerIds.map((playerId) => {
      const result = latest.get(playerId) ?? regulation.find((entry) => entry.playerId === playerId)!;
      const regulationPlace = regulation.find((entry) => entry.playerId === playerId)!.place;
      return { ...result, place: winnerIds.includes(playerId) ? 1 : regulationLeaders.has(playerId) ? 2 : regulationPlace };
    });
  }
  const revealedCardIds = Object.fromEntries(playerIds.map((id) => {
    const p = playerById(state, id);
    const ids = state.round === 2 && state.rulesVersion === 2 ? [p.selectedCardIds[0]!, p.selectedCardIds[gameNumber ?? 1]!]
      : state.round === 2 ? p.selectedCardIds : p.ownedCardIds;
    return [id, [...ids]];
  }));
  if (highCardDraw) results = results.map((result) => ({
    ...result, place: result.playerId === highCardDraw.winnerId ? 1
      : highCardDraw.draws.some((draw) => draw.playerId === result.playerId) ? 2 : result.place,
  }));
  return { id: `${state.round}-${stage}-${++state.encounterSequence}`, stage, playerIds, winnerIds, boards, boardResults, boardWinnerIds, streetSnapshots, runoutCount: boardCount, results, suddenDeathCount, highCardDraw, revealedCardIds,
    regulationWinnerIds, tiebreakKind: suddenDeathCount ? tiebreakKind : undefined,
    tiebreakStartIndex: suddenDeathCount ? tiebreakStartIndex : undefined, gameNumber };
}

function rewardMatch(state: PorenaGameState, match: MatchResult, pointValue: number, awardIds: readonly string[] = match.winnerIds): void {
  match.pointAwards = Object.fromEntries(match.playerIds.map((id) => [id, awardIds.includes(id) ? pointValue : 0]));
  if (state.round === 4 && match.group === "winner") {
    const prizes: Record<number, number> = { 1: BALANCE.points.r4WinnerGroup.first, 2: BALANCE.points.r4WinnerGroup.second, 3: BALANCE.points.r4WinnerGroup.third };
    match.pointAwards = Object.fromEntries(match.results.map((result) => [result.playerId, prizes[result.place] ?? 0]));
  }
  match.pointAwardDetails = Object.fromEntries(match.playerIds.map((id) => {
    const context = match.regulationWinnerIds ? "정규 결과 SPLIT" : match.group === "loser" ? "생존 결정" : match.group === "winner" ? "Winner Group" : "경기 결과";
    const placement = state.round === 4 && match.group === "winner" ? ` ${match.results.find((result) => result.playerId === id)!.place}위` : "";
    return [id, `${context}${placement} · +${match.pointAwards![id]}P`];
  }));
  for (const playerId of match.playerIds) {
    const player = playerById(state, playerId); const won = awardIds.includes(playerId);
    if (state.round === 4 && match.group === "loser") {
      const bb = 0;
      player.stackBB += bb;
      player.points += won ? pointValue : 0;
      player.winStreak = won ? player.winStreak + 1 : 0;
      player.loseStreak = won ? 0 : player.loseStreak + 1;
      match.pointAwardDetails![playerId] += ` · +${bb}BB`;
      continue;
    }
    if (state.round === 3) {
      const split = match.winnerIds.length > 1;
      const bb = split ? 0 : won ? 10 : 15 + player.loseStreak * 5;
      player.stackBB += bb;
      player.points += won ? pointValue : 0;
      player.winStreak = split || !won ? 0 : player.winStreak + 1;
      player.loseStreak = split || won ? 0 : player.loseStreak + 1;
      match.pointAwardDetails![playerId] += ` · +${bb}BB`;
      continue;
    }
    if (won) {
      const bonus = player.augments.some((augment) => augment.id === "win_bonus") ? 5 : 0;
      const base = state.round === 1 ? 10 : BALANCE.winRewardBB; const streakBonus = state.round === 1 ? 0 : player.winStreak * BALANCE.winStreakStepBB;
      player.stackBB += base + streakBonus + bonus;
      match.pointAwardDetails![playerId] += ` · BB ${base}${streakBonus ? ` + 연승 ${streakBonus}` : ""}${bonus ? ` + 증강 ${bonus}` : ""}`;
      player.winStreak += 1; player.loseStreak = 0; player.points += match.pointAwards[playerId]!;
    } else { const base = state.round === 1 ? 15 : 0; const streakBonus = state.round === 1 ? player.loseStreak * 5 : player.loseStreak * BALANCE.loseStreakStepBB; player.stackBB += base + streakBonus; match.pointAwardDetails![playerId] += ` · BB ${base}${streakBonus ? ` + 연패 ${streakBonus}` : ""}`; player.loseStreak += 1; player.winStreak = 0; }
    if (!won) player.points += match.pointAwards[playerId]!;
  }
}

function rewardMatchWithLedger(state: PorenaGameState, match: MatchResult, pointValue: number, awardIds: readonly string[] = match.winnerIds): void {
  if (state.round >= 2) match.standingsBefore = pointSnapshot(state);
  const before = structuredClone(state);
  rewardMatch(state, match, pointValue, awardIds);
  captureRewards(before, state, [match]);
  if (state.round >= 2) match.standingsAfterRuns = [pointSnapshot(state)];
}

function rewardFinalPlacements(state: PorenaGameState, match: MatchResult): void {
  const awards: Record<string, number> = {};
  const details: Record<string, string> = {};
  // Competition ranking can tie at any place, so every tied group — not just
  // first — shares the prize slots it occupies. Otherwise the 50P ladder inflates.
  const byPlace = new Map<number, PlayerShowdown[]>();
  for (const result of match.results) byPlace.set(result.place, [...(byPlace.get(result.place) ?? []), result]);
  for (const [place, group] of [...byPlace].sort(([a], [b]) => a - b)) {
    const prizes = Array.from({ length: group.length }, (_, index) => FINAL_ROUND_PLACEMENT_POINTS[place + index] ?? 0);
    if (group.length === 1) {
      awards[group[0]!.playerId] = prizes[0]!;
      details[group[0]!.playerId] = `${place}위 · +${prizes[0]}P`;
      continue;
    }
    const total = prizes.reduce((sum, prize) => sum + prize, 0);
    const allocations = calculateIcm(group.map(({ playerId }) => ({ playerId, stackBB: playerById(state, playerId).stackBB })), prizes);
    for (const result of group) {
      const allocation = allocations[result.playerId]!;
      awards[result.playerId] = allocation;
      details[result.playerId] = `공동 ${place}위 · ${total}P ICM 분배 · ${playerById(state, result.playerId).stackBB}BB → ${allocation.toFixed(2)}P`;
    }
  }
  for (const result of match.results) playerById(state, result.playerId).points += awards[result.playerId] ?? 0;
  match.pointAwards = awards;
  match.pointAwardDetails = details;
}

function pair(ids: string[]): string[][] { return Array.from({ length: Math.floor(ids.length / 2) }, (_, index) => ids.slice(index * 2, index * 2 + 2)); }

/** Record actual engine mutations; the client never calculates awards or elimination. */
function captureRewards(before: PorenaGameState, after: PorenaGameState, matches: MatchResult[]): void {
  for (const match of matches) match.rewards = match.playerIds.map((playerId) => {
    const previous = playerById(before, playerId); const current = playerById(after, playerId);
    const outcome = after.round === 5 ? "FINAL" : current.eliminated ? "ELIMINATED"
      : match.stage === "primary" && (after.round === 2 || after.round === 4)
        ? match.winnerIds.includes(playerId) ? "WINNER_GROUP" : "LOSER_GROUP" : "SURVIVED";
    return { playerId, beforeBB: previous.stackBB, afterBB: current.stackBB, deltaBB: current.stackBB - previous.stackBB,
      beforePoints: previous.points, afterPoints: current.points, deltaPoints: current.points - previous.points, outcome,
      detail: match.pointAwardDetails?.[playerId] };
  });
}

function streetHandFor(state: PorenaGameState, playerId: string, board: Card[], gameNumber?: 1 | 2): HandValue {
  const player = playerById(state, playerId);
  const selected = state.round === 2 && state.rulesVersion === 2 ? [player.selectedCardIds[0]!, player.selectedCardIds[gameNumber ?? 1]!]
    : player.selectedCardIds;
  const owned = cardsFor(state, state.round === 2 ? selected : player.ownedCardIds);
  if (state.round === 3) return board.length === 0 ? evaluateOmahaPreflop(owned) : findBestOmaha(owned, board);
  const candidates = [...owned, ...board];
  return candidates.length >= 5 ? findBestFive(candidates) : evaluatePartial(candidates);
}

function streetSnapshotsFor(state: PorenaGameState, playerIds: string[], board: Card[], gameNumber?: 1 | 2): StreetSnapshot[] {
  const streets = [["PRE_FLOP", 0], ["FLOP", 3], ["TURN", 4], ["RIVER", 5]] as const;
  return streets.map(([street, count]) => {
    const visibleBoard = board.slice(0, count);
    const hands = playerIds.map((playerId) => ({ playerId, hand: streetHandFor(state, playerId, visibleBoard, gameNumber) }));
    const ranking = rankPlayers(hands);
    return { street, results: hands.map(({ playerId, hand }) => ({ playerId, hand,
      place: placeInRanking(ranking, playerId), usedCardIds: hand.bestFive.map((card) => card.id) })) };
  });
}

function seedOmaha(state: PorenaGameState): string[] {
  return shuffle(state.players.filter((p) => !p.eliminated), () => nextRandom(state))
    .sort((a, b) => b.points - a.points || b.stackBB - a.stackBB).map((p) => p.id);
}

export function resolvePrimary(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source);
  if (state.phase !== "SHOWDOWN_PRIMARY") throw new Error("1차 쇼다운 단계가 아닙니다.");
  const alive = shuffle(state.players.filter((player) => !player.eliminated).map((player) => player.id), () => nextRandom(state));
  if (state.round === 1 || state.round === 3) {
    const omaha = state.round === 3;
    // R3 entry freezes Point/BB seeding before shopping; fallback supports older snapshots.
    const seeds = omaha ? state.r3Seeds ?? seedOmaha(state) : alive;
    const records = Object.fromEntries(alive.map((id) => [id, emptySwissRecord()]));
    const history: string[][] = [];
    const matches: MatchResult[] = [];
    for (let day = 1; day <= 3; day++) {
      const pairs = day === 1 ? pair(seeds) : swissPairs(shuffle(alive, () => nextRandom(state)), records, history);
      for (const ids of pairs) {
        const match = resolveParticipants(state, ids, 1, "primary", false);
        match.matchday = day;
        match.swissBefore = Object.fromEntries(ids.map((id) => [id, { ...records[id]! }]));
        const split = match.winnerIds.length > 1;
        rewardMatchWithLedger(state, match, omaha ? split ? BALANCE.points.r3.gameSplit : BALANCE.points.r3.gameWin : split ? BALANCE.points.r1.split : BALANCE.points.r1.win);
        for (const id of ids) {
          const record = records[id]!;
          if (split) { record.draws++; record.score += 0.5; }
          else if (match.winnerIds.includes(id)) { record.wins++; record.score++; }
          else record.losses++;
        }
        match.swissAfter = Object.fromEntries(ids.map((id) => [id, { ...records[id]! }]));
        history.push(ids); matches.push(match);
      }
    }
    state.matches.push(...matches); state.roundResults = matches;
    state.phase = "ROUND_RESULT";
    if (omaha && state.rulesVersion === 2) {
      assignSurvivalBoundary(state);
      for (const match of matches.filter((m) => m.matchday === 3)) for (const reward of match.rewards ?? []) {
        if (playerById(state, reward.playerId).eliminated) reward.outcome = "ELIMINATED";
      }
    }
    log(state, omaha ? "R3 Omaha Swiss 3경기 종료 · 승리 4P / Split 2P · 누적 승점 탈락 판정" : "R1 스위스 3경기 종료 · 승리 3P / Split 1P · 전원 생존", "win");
    return state;
  }
  if (state.round === 2 && state.rulesVersion === 2) return resolveSplitRuns(state, pair(alive));
  const boardCount = state.round === 2 ? 2 : state.round === 5 ? 0 : 1;
  const matches = state.round === 5
    ? [resolveParticipants(state, alive, 0, "final", false)]
    : pair(alive).map((ids) => resolveParticipants(state, ids, boardCount, "primary",
      state.round === 2 || state.round === 4,
      state.round === 4 ? "GROUP_DECIDER" : undefined,
      state.round === 4));
  state.matches.push(...matches); state.roundResults = matches;
  if (state.round === 2) matches.forEach((match) => rewardMatchWithLedger(state, match, BALANCE.points.r2Primary.win));
  if (state.round === 4) matches.forEach((match) => {
    const regulationWinners = match.regulationWinnerIds ?? match.winnerIds;
    rewardMatchWithLedger(state, match, match.regulationWinnerIds ? BALANCE.points.r4Primary.split : BALANCE.points.r4Primary.win, regulationWinners);
  });
  state.winnerGroup = matches.flatMap((match) => match.winnerIds);
  state.loserGroup = matches.flatMap((match) => match.playerIds.filter((id) => !match.winnerIds.includes(id)));
  if (state.round === 5) {
    matches[0]!.standingsBefore = pointSnapshot(state);
    rewardFinalPlacements(state, matches[0]!);
    captureRewards(source, state, matches);
    matches[0]!.standingsAfterRuns = [pointSnapshot(state)];
    state.phase = "GAME_RESULT"; log(state, "The Last Hand · 최종 점수 집계 완료", "win");
  }
  else if (state.round === 2 || state.round === 4) { state.phase = "GROUP_ASSIGNMENT"; log(state, `승자조 ${state.winnerGroup.length}명 · 패자조 ${state.loserGroup.length}명`); }
  else {
    state.phase = "ROUND_RESULT";
    log(state, `R${state.round} 쇼다운 종료`, "win");
  }
  return state;
}

function pointSnapshot(state: PorenaGameState): Record<string, number> {
  return Object.fromEntries(state.players.filter((p) => !p.eliminated).map((p) => [p.id, p.points]));
}

function resolveSplitRuns(state: PorenaGameState, pairs: string[][]): PorenaGameState {
  const decks = pairs.map((ids) => encounterBoards(state, ids, 2));
  const before = pointSnapshot(state);
  const runs: MatchResult[][] = [[], []]; const snapshots: Record<string, number>[] = [];
  for (const run of [1, 2] as const) {
    pairs.forEach((ids, i) => {
      const match = resolveParticipants(state, ids, 1, "primary", false, undefined, false, run, [decks[i]![run - 1]!]);
      if (match.winnerIds.length > 1) {
        const previous = structuredClone(state);
        match.pointAwards = Object.fromEntries(ids.map((id) => [id, BALANCE.points.r2Run.split]));
        match.pointAwardDetails = Object.fromEntries(ids.map((id) => [id, "SPLIT · +2P · BB 0 · 연승/연패 초기화"]));
        for (const id of ids) { const p = playerById(state, id); p.points += BALANCE.points.r2Run.split; p.winStreak = 0; p.loseStreak = 0; }
        captureRewards(previous, state, [match]);
      } else rewardMatchWithLedger(state, match, BALANCE.points.r2Run.win);
      runs[run - 1]!.push(match);
    });
    snapshots.push(pointSnapshot(state));
  }
  const matches = pairs.map((ids, i) => {
    const a = runs[0]![i]!; const b = runs[1]![i]!;
    return { ...a, gameNumber: undefined, winnerIds: b.winnerIds, boards: [...a.boards, ...b.boards],
      boardResults: [...a.boardResults, ...b.boardResults], boardWinnerIds: [...a.boardWinnerIds, ...b.boardWinnerIds],
      streetSnapshots: [...a.streetSnapshots!, ...b.streetSnapshots!], results: b.results, runoutCount: 2,
      runCards: Object.fromEntries(ids.map((id) => [id, [a.revealedCardIds[id]!, b.revealedCardIds[id]!]])),
      runRewards: [a.rewards!, b.rewards!], standingsBefore: before, standingsAfterRuns: snapshots,
      pointAwards: Object.fromEntries(ids.map((id) => [id, a.pointAwards![id]! + b.pointAwards![id]!])),
      rewards: a.rewards!.map((r) => { const end = b.rewards!.find((x) => x.playerId === r.playerId)!;
        return { ...r, afterBB: end.afterBB, afterPoints: end.afterPoints, deltaBB: r.deltaBB + end.deltaBB, deltaPoints: r.deltaPoints + end.deltaPoints, detail: "RUN1 + RUN2 합계" }; }),
    } satisfies MatchResult;
  });
  state.matches.push(...matches); state.roundResults = matches; state.phase = "ROUND_RESULT";
  log(state, "R2 RUN1·RUN2 종료 · 전원 생존", "win"); return state;
}

function assignSurvivalBoundary(state: PorenaGameState): void {
  const alive = state.players.filter((p) => !p.eliminated).sort((a, b) => a.points - b.points);
  const boundary = alive[1]!.points;
  const below = alive.filter((p) => p.points < boundary).map((p) => p.id);
  const tied = alive.filter((p) => p.points === boundary).map((p) => p.id);
  eliminate(state, below);
  const needed = 2 - below.length;
  if (tied.length === needed) eliminate(state, tied);
  else state.survival = { playerIds: tied, eliminateCount: needed };
}

/** Resolve only the tied boundary; never award points/BB or use BB as a tie breaker. */
export function resolveSurvival(source: PorenaGameState): PorenaGameState {
  if (source.phase !== "SURVIVAL_READY" || !source.survival) throw new Error("생존 타이브레이크 단계가 아닙니다.");
  const state = structuredClone(source); const boundary = state.survival!;
  const previous = structuredClone(state);
  const allIds = boundary.playerIds;
  let tied = [...allIds]; let slots = allIds.length - boundary.eliminateCount;
  const survived: string[] = []; const eliminated: string[] = [];
  let combined: MatchResult | undefined;
  for (let attempt = 0; slots > 0 && tied.length; attempt++) {
    // The universe always excludes all original participants' four owned cards.
    const board = encounterBoards(state, allIds, 1)[0]!;
    const match = resolveParticipants(state, tied, 1, "secondary", false, "SURVIVAL_TIEBREAK", false, undefined, [board]);
    if (!combined) combined = { ...match, group: "loser", tiebreakKind: "SURVIVAL_TIEBREAK", tiebreakStartIndex: 1 };
    else { combined.boards.push(...match.boards); combined.boardResults.push(...match.boardResults); combined.boardWinnerIds.push(...match.boardWinnerIds); combined.streetSnapshots!.push(...match.streetSnapshots!); combined.suddenDeathCount++; }
    const groups = rankPlayers(match.results.map((r) => ({ playerId: r.playerId, hand: r.hand })));
    let unresolved: string[] = [];
    for (const group of groups) {
      if (unresolved.length) { eliminated.push(...group); continue; }
      if (slots >= group.length) { survived.push(...group); slots -= group.length; }
      else if (slots > 0 && !unresolved.length) { unresolved = group; }
      else eliminated.push(...group);
    }
    tied = unresolved;
    if (!tied.length) break;
    if (attempt >= 2) {
      const ranks = shuffle(Array.from({ length: 13 }, (_, i) => i + 2), () => nextRandom(state));
      const draws = tied.map((playerId, i) => ({ playerId, rank: ranks[i]! }));
      const ordered = [...draws].sort((a, b) => b.rank - a.rank);
      const chosen = ordered.slice(0, slots).map((d) => d.playerId);
      survived.push(...chosen); eliminated.push(...ordered.slice(slots).map((d) => d.playerId));
      combined.highCardDraw = { draws, winnerId: chosen[0]!, survivorIds: chosen, surviveCount: slots };
      break;
    }
  }
  if (!combined || survived.length !== allIds.length - boundary.eliminateCount || eliminated.length !== boundary.eliminateCount) throw new Error("생존 경계 계산 실패");
  combined.playerIds = allIds; combined.winnerIds = survived;
  combined.results = combined.boardResults[0]!.map((r) => ({ ...r, place: survived.includes(r.playerId) ? 1 : 2 }));
  eliminate(state, eliminated); captureRewards(previous, state, [combined]);
  state.matches.push(combined); state.roundResults = [combined]; delete state.survival;
  state.phase = "ROUND_RESULT"; assertPoolIntegrity(state); return state;
}

export function beginSecondary(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source); if (state.phase !== "GROUP_ASSIGNMENT") throw new Error("그룹 배정 단계가 아닙니다.");
  state.phase = "SHOWDOWN_SECONDARY"; return state;
}

function eliminate(state: PorenaGameState, ids: string[]): void {
  for (const id of ids) {
    const player = playerById(state, id);
    const cards = cardsFor(state, player.ownedCardIds);
    player.eliminationSnapshot = {
      round: state.round,
      stackBB: player.stackBB,
      points: player.points,
      hand: cards.length >= 5 ? findBestFive(cards) : evaluatePartial(cards),
    };
    player.eliminated = true; player.eliminatedRound = state.round;
    releasePlayerCards(state, player);
    log(state, `${player.name} 탈락 · R${state.round} 핸드·스택 기록 후 점유 카드 전량 반환`, "danger");
  }
}

export function resolveSecondary(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source); if (state.phase !== "SHOWDOWN_SECONDARY") throw new Error("2차 쇼다운 단계가 아닙니다.");
  const winnerMatches = state.round === 2
    ? pair(state.winnerGroup).map((ids) => resolveParticipants(state, ids, 2, "secondary"))
    : [resolveParticipants(state, state.winnerGroup, 1, "secondary", true, "WINNER_TIEBREAK")];
  const loserMatches = state.round === 2
    ? pair(state.loserGroup).map((ids) => resolveParticipants(state, ids, 2, "secondary"))
    : [resolveParticipants(state, state.loserGroup, 1, "secondary", true, "SURVIVAL_TIEBREAK")];
  winnerMatches.forEach((match) => { match.group = "winner"; });
  loserMatches.forEach((match) => { match.group = "loser"; });
  winnerMatches.forEach((match) => rewardMatch(state, match, state.round === 2 ? BALANCE.points.r2WinnerBracket.win : BALANCE.points.r4WinnerGroup.first));
  loserMatches.forEach((match) => rewardMatch(state, match, state.round === 2 ? BALANCE.points.r2LoserBracket.survive : BALANCE.points.r4LoserGroup.survive));
  eliminate(state, loserMatches.flatMap((match) => match.playerIds.filter((id) => !match.winnerIds.includes(id))));
  captureRewards(source, state, [...winnerMatches, ...loserMatches]);
  state.matches.push(...winnerMatches, ...loserMatches); state.roundResults = [...winnerMatches, ...loserMatches];
  state.phase = "ROUND_RESULT"; log(state, `R${state.round} 종료 · ${state.players.filter((player) => !player.eliminated).length}명 생존`, "win");
  assertPoolIntegrity(state); return state;
}

export function choicesFor(state: PorenaGameState): Augment[] {
  return shuffle(augmentPool(state.round), () => nextRandom(state)).slice(0, 3);
}

export function leaveRoundResult(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source); if (state.phase !== "ROUND_RESULT") throw new Error("라운드 결과 단계가 아닙니다.");
  if (state.survival) { state.phase = "SURVIVAL_READY"; return state; }
  if (state.round === 2 || state.round === 4) {
    const human = playerById(state, "p1");
    if (human.eliminated) {
      for (const survivor of state.players.filter((player) => !player.eliminated)) {
        const choices = choicesFor(state);
        applyAugment(survivor, pickBotAugment(survivor, choices, state.round, cardsFor(state, survivor.ownedCardIds)));
      }
      state.phase = "NEXT_ROUND";
      log(state, "관전 모드 · 생존자 증강 선택 완료");
    } else {
      state.phase = "AUGMENT"; state.augmentChoices = choicesFor(state); log(state, `${state.round === 2 ? "첫 번째" : "두 번째"} 증강 선택`);
    }
  }
  else state.phase = "NEXT_ROUND";
  return state;
}

export function chooseAugment(source: PorenaGameState, playerId: string, augmentId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "AUGMENT" || player.eliminated) throw new Error("증강을 선택할 수 없습니다.");
  const augment = state.augmentChoices.find((item) => item.id === augmentId); if (!augment) throw new Error("제시된 증강이 아닙니다.");
  applyAugment(player, augment);
  for (const bot of state.players.filter((item) => !item.eliminated && item.id !== playerId)) {
    const choices = choicesFor(state);
    applyAugment(bot, pickBotAugment(bot, choices, state.round, cardsFor(state, bot.ownedCardIds)));
  }
  state.phase = "NEXT_ROUND"; log(state, `${player.name} · ${augment.name} 획득`, "win"); return state;
}

export function startNextRound(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source); if (state.phase !== "NEXT_ROUND" || state.round >= 5) throw new Error("다음 라운드로 진행할 수 없습니다.");
  state.round = (state.round + 1) as Round; state.phase = "SHOP"; state.roundResults = []; state.winnerGroup = []; state.loserGroup = []; state.augmentChoices = [];
  delete state.draft; delete state.survival;
  if (state.round === 3) state.r3Seeds = seedOmaha(state);
  // Street snapshots exist only to drive the showdown cinematic for the round
  // being played. Final scoring reads roundResults and eliminationSnapshot, never
  // history, so past rounds drop the largest field in the persisted snapshot.
  for (const match of state.matches) delete match.streetSnapshots;
  for (const player of state.players.filter((item) => !item.eliminated)) {
    player.stackBB += BALANCE.roundIncomeBB; player.purchasesThisRound = 0; player.rerollsUsed = 0; player.selectedCardIds = [];
    if (state.rulesVersion === 2 && (state.round === 2 || state.round === 4)) player.lockedShopCardIds = [];
    releaseShop(state, player);
  }
  if (state.rulesVersion === 2 && (state.round === 2 || state.round === 4)) {
    const alive = shuffle(state.players.filter((p) => !p.eliminated), () => nextRandom(state));
    const count = state.round === 2 ? 8 : 16;
    const available = state.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE");
    if (available.length < count) throw new Error("공개 드래프트 카드 풀이 부족합니다.");
    state.draft = {
      cardIds: shuffle(available, () => nextRandom(state)).slice(0, count).map((entry) => entry.card.id),
      order: alive.sort((a, b) => a.points - b.points || b.stackBB - a.stackBB).map((p) => ({ playerId: p.id, points: p.points, stackBB: p.stackBB })), picks: [],
    };
    state.phase = "DRAFT_ORDER";
  } else for (const player of state.players.filter((p) => !p.eliminated)) reserveShopCards(state, player);
  assertPoolIntegrity(state); return state;
}

export function openDraft(source: PorenaGameState): PorenaGameState {
  if (source.phase !== "DRAFT_ORDER" || !source.draft) throw new Error("드래프트 순서 공개 단계가 아닙니다.");
  return { ...structuredClone(source), phase: "OPEN_DRAFT" };
}

export function pickDraftCard(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const draft = state.draft;
  if (state.phase !== "OPEN_DRAFT" || !draft || draft.order[draft.picks.length]?.playerId !== playerId) throw new Error("내 드래프트 차례가 아닙니다.");
  const player = playerById(state, playerId);
  const entry = state.ownershipCardPool.find((e) => e.card.id === cardId);
  if (!draft.cardIds.includes(cardId) || !entry || entry.state !== "AVAILABLE") throw new Error("선택할 수 없는 카드입니다.");
  const price = discountedPrice(player, entry.card);
  if (player.stackBB < price) throw new Error("BB가 부족합니다.");
  if (player.ownedCardIds.length !== BALANCE.handLimits[state.round] - 1) throw new Error("드래프트 보유 장수가 올바르지 않습니다.");
  player.stackBB -= price; player.ownedCardIds.push(cardId);
  entry.state = "OWNED"; entry.ownerPlayerId = playerId;
  draft.picks.push({ playerId, cardId, price });
  if (draft.picks.length === draft.order.length) {
    state.phase = state.round === 2 ? "RUN_LOADOUT" : "SHOP";
    if (state.round === 4) for (const p of state.players.filter((p) => !p.eliminated)) reserveShopCards(state, p);
  }
  assertPoolIntegrity(state); return state;
}

export function autoPickDraft(source: PorenaGameState): PorenaGameState {
  const id = source.draft?.order[source.draft.picks.length]?.playerId;
  if (!id) throw new Error("드래프트 차례가 없습니다.");
  const p = playerById(source, id);
  const options = source.draft!.cardIds.filter((cardId) => source.ownershipCardPool.find((e) => e.card.id === cardId)?.state === "AVAILABLE")
    .map((cardId) => ({ card: getCard(source, cardId), price: getCardPrice(source, id, cardId) })).filter((o) => o.price <= p.stackBB);
  const best = rankBotPurchases(source.round, p, cardsFor(source, p.ownedCardIds), options, { rulesVersion: source.rulesVersion ?? 2 })[0];
  if (!best) throw new Error("구매 가능한 드래프트 카드가 없습니다.");
  return pickDraftCard(source, id, best.card.id);
}

/** Ordered identities: [anchor, run-one secondary, run-two secondary]. */
export function setRunLoadout(source: PorenaGameState, playerId: string, cardIds: string[]): PorenaGameState {
  if (source.phase !== "RUN_LOADOUT") throw new Error("RUN 구성은 시작 전에만 변경할 수 있습니다.");
  const state = structuredClone(source); const p = playerById(state, playerId);
  if (p.eliminated || cardIds.length !== 3 || new Set(cardIds).size !== 3 || cardIds.some((id) => !p.ownedCardIds.includes(id))) throw new Error("보유한 서로 다른 카드 3장을 배치하세요.");
  p.selectedCardIds = [...cardIds]; return state;
}

export function lockRunLoadouts(source: PorenaGameState, humanIds: readonly string[] = ["p1"]): PorenaGameState {
  if (source.phase !== "RUN_LOADOUT") throw new Error("RUN 배치 단계가 아닙니다.");
  const state = structuredClone(source);
  for (const p of state.players.filter((p) => !p.eliminated)) {
    if (p.ownedCardIds.length !== 3) throw new Error("R2 보유 카드 3장이 필요합니다.");
    const valid = [...new Set(p.selectedCardIds)].filter((id) => p.ownedCardIds.includes(id));
    // Bots always solve for the anchor. A human who placed nothing gets the same
    // solve rather than owned order; a partial placement stays their own.
    if (!humanIds.includes(p.id) || !valid.length) p.selectedCardIds = bestRunLoadout(p, cardsFor(state, p.ownedCardIds));
    else p.selectedCardIds = [...valid, ...p.ownedCardIds.filter((id) => !valid.includes(id))];
  }
  state.phase = "SHOWDOWN_PRIMARY"; return state;
}

export function finalStandings(state: PorenaGameState) {
  const rankPoints = [8, 4, 2, 0, -1, -2, -4, -8] as const;
  const rows = state.players.map((player) => {
    const final = state.roundResults[0]?.results.find((result) => result.playerId === player.id);
    const hand = final?.hand ?? player.eliminationSnapshot?.hand;
    const points = player.eliminationSnapshot?.points ?? player.points;
    const stackBB = player.eliminationSnapshot?.stackBB ?? player.stackBB;
    const baseHandScore = hand ? BALANCE.handScores[hand.category] : 0;
    const augmentBonus = (hand?.category === "PAIR" && player.augments.some((augment) => augment.id === "pair_points") ? 3 : 0)
      + (hand && player.augments.some((augment) => augment.id === "r5_hand_bonus") ? 4 : 0);
    const handScore = baseHandScore + augmentBonus; const stackScore = Math.floor(stackBB / BALANCE.stackScoreUnitBB);
    const lastMatch = [...state.matches].reverse().find((match) => match.revealedCardIds[player.id]?.length);
    const cardIds = player.ownedCardIds.length ? player.ownedCardIds : lastMatch?.revealedCardIds[player.id];
    const cards = cardIds ? cardsFor(state, cardIds) : hand?.bestFive ?? [];
    return { playerId: player.id, points, handScore, stackScore, total: points + handScore + stackScore, hand,
      cards, usedCardIds: hand?.bestFive.map((card) => card.id) ?? [],
      finalPlace: final?.place ?? Infinity, eliminatedRound: player.eliminatedRound, stackBB };
  }).sort((a, b) => b.total - a.total || a.finalPlace - b.finalPlace
    || (b.eliminatedRound ?? 6) - (a.eliminatedRound ?? 6)
    || (b.hand && a.hand ? compareHands(b.hand, a.hand) : 0) || a.playerId.localeCompare(b.playerId));
  return rows.map((row, index) => ({ ...row, placement: index + 1, rankPoints: rankPoints[index]! }));
}

export function getCard(state: PorenaGameState, id: string): Card { return state.ownershipCardPool.find((entry) => entry.card.id === id)!.card; }
export function getCardPrice(state: PorenaGameState, playerId: string, cardId: string): number { return discountedPrice(playerById(state, playerId), getCard(state, cardId)); }
