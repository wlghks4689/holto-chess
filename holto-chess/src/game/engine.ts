import { shuffle, type Card } from "../core/poker/cards";
import { compareHands, findBestFive, findBestOmaha, placeInRanking, rankPlayers, type HandValue } from "../core/poker/evaluate";
import { applyAugment, augmentPool } from "./augments";
import { assertPoolIntegrity, createOwnershipPool, releasePlayerCards } from "./cardPool";
import { BALANCE, cardPrice, FINAL_ROUND_PLACEMENT_POINTS } from "./config";
import { createShowdownDeck, drawCommunityBoards } from "./showdownDeck";
import { canSellWithoutBlocking } from "./shopRules";
import type { Augment, HoltoChessGameState, MatchResult, PlayerShowdown, PlayerState, Round } from "./types";

function nextRandom(state: HoltoChessGameState): number {
  if (state.randomMode === "secure") return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
  let x = state.seed | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x >>> 0;
  return state.seed / 4294967296;
}

function log(state: HoltoChessGameState, message: string, tone: "info" | "win" | "danger" | "economy" = "info"): void {
  state.logs.unshift({ id: ++state.logSequence, message, tone });
  state.logs = state.logs.slice(0, 24);
}

function drawAvailable(state: HoltoChessGameState) {
  const available = state.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE");
  if (!available.length) return null;
  return available[Math.floor(nextRandom(state) * available.length)]!;
}

function reserveShopCards(state: HoltoChessGameState, player: PlayerState): void {
  while (player.shopCardIds.length < player.shopSize) {
    const entry = drawAvailable(state);
    if (!entry) break;
    entry.state = "RESERVED_IN_SHOP"; entry.reservedPlayerId = player.id;
    player.shopCardIds.push(entry.card.id);
  }
}

function giveRandomOwnedCard(state: HoltoChessGameState, player: PlayerState): void {
  const entry = drawAvailable(state);
  if (!entry) throw new Error("No ownership card available");
  entry.state = "OWNED"; entry.ownerPlayerId = player.id;
  player.ownedCardIds.push(entry.card.id);
}

function releaseShop(state: HoltoChessGameState, player: PlayerState): void {
  for (const id of player.shopCardIds) {
    if (player.lockedShopCardIds?.includes(id)) continue;
    const entry = state.ownershipCardPool.find((item) => item.card.id === id)!;
    entry.state = "AVAILABLE"; delete entry.reservedPlayerId;
  }
  player.shopCardIds = player.shopCardIds.filter((id) => player.lockedShopCardIds?.includes(id));
}

function playerById(state: HoltoChessGameState, id: string): PlayerState {
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error(`Unknown player ${id}`);
  return player;
}

function cardsFor(state: HoltoChessGameState, ids: readonly string[]): Card[] {
  return ids.map((id) => state.ownershipCardPool.find((entry) => entry.card.id === id)!.card);
}

function discountedPrice(player: PlayerState, card: Card): number {
  let price = cardPrice(card.rank);
  if (player.augments.some((augment) => augment.id === "suit_discount" && augment.suit === card.suit)) price -= 3;
  if (player.augments.some((augment) => augment.id === "rank_discount") && card.rank <= 9) price -= 2;
  return Math.max(1, price);
}

export function createGame(seed = Date.now(), randomMode: "seeded" | "secure" = "seeded"): HoltoChessGameState {
  seed = (seed >>> 0) || 1;
  const players: PlayerState[] = Array.from({ length: BALANCE.playerCount }, (_, index) => ({
    id: `p${index + 1}`, name: index === 0 ? "나" : `Player ${index + 1}`,
    stackBB: BALANCE.startStackBB, ownedCardIds: [], shopCardIds: [], selectedCardIds: [],
    shopSize: BALANCE.baseShopSize, purchasesThisRound: 0, shopLocked: false, augments: [],
    points: 0, winStreak: 0, loseStreak: 0, eliminated: false,
  }));
  const state: HoltoChessGameState = {
    round: 1, phase: "SHOP", players, ownershipCardPool: createOwnershipPool(), matches: [],
    winnerGroup: [], loserGroup: [], roundResults: [], augmentChoices: [], encounterSequence: 0, seed, randomMode, logSequence: 0, logs: [],
  };
  for (const player of players) giveRandomOwnedCard(state, player);
  for (const player of players) reserveShopCards(state, player);
  log(state, "8명의 플레이어에게 공용 풀에서 카드 1장씩 지급했습니다.");
  assertPoolIntegrity(state);
  return state;
}

export function buyCard(source: HoltoChessGameState, playerId: string, cardId: string): HoltoChessGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "SHOP" || player.eliminated) throw new Error("지금은 구매할 수 없습니다.");
  if (!player.shopCardIds.includes(cardId)) throw new Error("내 상점에 예약된 카드가 아닙니다.");
  if (player.ownedCardIds.length >= BALANCE.handLimits[state.round]) throw new Error("이번 라운드 보유 한도에 도달했습니다.");
  if (player.purchasesThisRound >= BALANCE.maxPurchasesPerRound) throw new Error("이번 라운드 구매 횟수를 모두 사용했습니다.");
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

export function sellCard(source: HoltoChessGameState, playerId: string, cardId: string): HoltoChessGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "SHOP" || !player.ownedCardIds.includes(cardId)) throw new Error("판매할 수 없는 카드입니다.");
  if (!canSellWithoutBlocking({ ownedCount: player.ownedCardIds.length, purchases: player.purchasesThisRound,
    purchaseLimit: BALANCE.maxPurchasesPerRound, handLimit: BALANCE.handLimits[state.round] })) {
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

export function rerollShop(source: HoltoChessGameState, playerId: string): HoltoChessGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  const cost = Math.max(0, BALANCE.rerollCostBB - (player.augments.some((augment) => augment.id === "reroll_discount") ? 2 : 0));
  if (state.phase !== "SHOP" || player.eliminated || player.stackBB < cost) throw new Error("리롤할 수 없습니다.");
  releaseShop(state, player); player.stackBB -= cost; reserveShopCards(state, player);
  log(state, `${player.name} · 상점 리롤 −${cost}BB`, "economy");
  assertPoolIntegrity(state); return state;
}

export function toggleShopLock(source: HoltoChessGameState, playerId: string, cardId: string): HoltoChessGameState {
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

export function toggleSelectedCard(source: HoltoChessGameState, playerId: string, cardId: string): HoltoChessGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (!player.ownedCardIds.includes(cardId)) throw new Error("보유 카드만 선택할 수 있습니다.");
  if (player.selectedCardIds.includes(cardId)) player.selectedCardIds = player.selectedCardIds.filter((id) => id !== cardId);
  else if (player.selectedCardIds.length < 2) player.selectedCardIds.push(cardId);
  return state;
}

function aiPrepare(state: HoltoChessGameState, humanIds: readonly string[] = ["p1"]): void {
  const limit = BALANCE.handLimits[state.round];
  for (const player of state.players.filter((item) => !item.eliminated && !humanIds.includes(item.id))) {
    while (player.ownedCardIds.length < limit && player.purchasesThisRound < BALANCE.maxPurchasesPerRound) {
      const options = player.shopCardIds.map((id) => state.ownershipCardPool.find((entry) => entry.card.id === id)!).filter((entry) => discountedPrice(player, entry.card) <= player.stackBB)
        .sort((a, b) => b.card.rank - a.card.rank);
      if (!options.length) break;
      const entry = options[0]!; const price = discountedPrice(player, entry.card);
      player.stackBB -= price; player.purchasesThisRound += 1; player.shopCardIds = player.shopCardIds.filter((id) => id !== entry.card.id); player.ownedCardIds.push(entry.card.id);
      entry.state = "OWNED"; entry.ownerPlayerId = player.id; delete entry.reservedPlayerId;
    }
    if (state.round === 2) player.selectedCardIds = [...player.ownedCardIds].sort((a, b) => cardsFor(state, [b])[0]!.rank - cardsFor(state, [a])[0]!.rank).slice(0, 2);
  }
}

export function prepareShowdown(source: HoltoChessGameState, humanIds: readonly string[] = ["p1"]): HoltoChessGameState {
  if (source.phase !== "SHOP") throw new Error("상점 단계가 아닙니다.");
  const state = structuredClone(source); aiPrepare(state, humanIds);
  const humans = humanIds.map((id) => playerById(state, id)).filter((p) => !p.eliminated);
  if (humans.some((p) => p.ownedCardIds.length < BALANCE.handLimits[state.round])) throw new Error(`R${state.round}은 보유 카드 ${BALANCE.handLimits[state.round]}장이 필요합니다.`);
  if (state.round === 2 && humans.some((p) => p.selectedCardIds.length !== 2)) { state.phase = "DECK_SELECT"; return state; }
  state.phase = "SHOWDOWN_PRIMARY"; log(state, `R${state.round} 쇼다운 준비 완료`); assertPoolIntegrity(state); return state;
}

export function confirmSelection(source: HoltoChessGameState): HoltoChessGameState {
  const state = structuredClone(source); const human = playerById(state, "p1");
  if (state.round !== 2 || human.selectedCardIds.length !== 2) throw new Error("R2에서 사용할 카드 2장을 선택하세요.");
  state.phase = "SHOWDOWN_PRIMARY"; log(state, "R2 홀카드 2장을 확정했습니다."); return state;
}

function handFor(state: HoltoChessGameState, playerId: string, board: Card[]): HandValue {
  const player = playerById(state, playerId);
  const owned = cardsFor(state, state.round === 2 ? player.selectedCardIds : player.ownedCardIds);
  if (state.round === 3) return findBestOmaha(owned, board);
  if (state.round === 5) return findBestFive(owned);
  return findBestFive([...owned, ...board]);
}

function encounterBoards(
  state: HoltoChessGameState,
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
  state: HoltoChessGameState,
  playerIds: string[],
  boardCount: number,
  stage: MatchResult["stage"],
  requireSingleWinner = true,
): MatchResult {
  const boards = encounterBoards(state, playerIds, boardCount);
  const evaluationBoards = boards.length ? boards : [[]];
  const boardRankings = evaluationBoards.map((board) => rankPlayers(playerIds.map((playerId) => ({ playerId, hand: handFor(state, playerId, board) }))));
  const resultsForBoard = (ids: string[], board: Card[]): PlayerShowdown[] => {
    const ranking = rankPlayers(ids.map((playerId) => ({ playerId, hand: handFor(state, playerId, board) })));
    return ids.map((playerId) => {
      const hand = handFor(state, playerId, board);
      return { playerId, hand, place: placeInRanking(ranking, playerId), usedCardIds: hand.bestFive.map((card) => card.id) };
    });
  };
  const boardResults = evaluationBoards.map((board) => resultsForBoard(playerIds, board));
  const boardWinnerIds = boardRankings.map((ranking) => [...ranking[0]!]);
  let winnerIds: string[];
  let suddenDeathCount = 0;
  if (boards.length === 2 && playerIds.length === 2) {
    const wins = new Map(playerIds.map((id) => [id, 0]));
    for (const ranking of boardRankings) if (ranking[0]!.length === 1) wins.set(ranking[0]![0]!, wins.get(ranking[0]![0]!)! + 1);
    const [a, b] = playerIds; const delta = wins.get(a)! - wins.get(b)!;
    winnerIds = delta > 0 ? [a] : delta < 0 ? [b] : [];
  } else winnerIds = boardRankings[0]![0]!;
  while (requireSingleWinner && winnerIds.length !== 1) {
    if (suddenDeathCount >= 256) throw new Error("쇼다운 계산 한도에 도달했습니다. 다시 시도하세요.");
    const tied = winnerIds.length ? winnerIds : playerIds;
    const sudden = encounterBoards(state, tied, 1)[0]!;
    boards.push(sudden); suddenDeathCount += 1;
    const suddenRanking = rankPlayers(tied.map((playerId) => ({ playerId, hand: handFor(state, playerId, sudden) })));
    winnerIds = suddenRanking[0]!;
    boardResults.push(resultsForBoard(tied, sudden));
    boardWinnerIds.push([...winnerIds]);
  }
  // The recap must describe the board that actually ended the encounter. In R2 a
  // tied pair of runouts can append one or more sudden-death boards.
  const results = boardResults[boardResults.length - 1]!;
  const revealedCardIds = Object.fromEntries(playerIds.map((id) => {
    const p = playerById(state, id);
    const ids = state.round === 2 ? p.selectedCardIds : p.ownedCardIds;
    return [id, [...ids]];
  }));
  return { id: `${state.round}-${stage}-${++state.encounterSequence}`, stage, playerIds, winnerIds, boards, boardResults, boardWinnerIds, runoutCount: boardCount, results, suddenDeathCount, revealedCardIds };
}

function rewardMatch(state: HoltoChessGameState, match: MatchResult, pointValue: number, awardPoint = true): void {
  for (const playerId of match.playerIds) {
    const player = playerById(state, playerId); const won = match.winnerIds.includes(playerId);
    if (won) {
      const bonus = player.augments.some((augment) => augment.id === "win_bonus") ? 5 : 0;
      player.stackBB += BALANCE.winRewardBB + player.winStreak * BALANCE.winStreakStepBB + bonus;
      player.winStreak += 1; player.loseStreak = 0; if (awardPoint) player.points += pointValue;
    } else { player.stackBB += player.loseStreak * BALANCE.loseStreakStepBB; player.loseStreak += 1; player.winStreak = 0; }
  }
}

function pair(ids: string[]): string[][] { return Array.from({ length: Math.floor(ids.length / 2) }, (_, index) => ids.slice(index * 2, index * 2 + 2)); }

/** Record actual engine mutations; the client never calculates awards or elimination. */
function captureRewards(before: HoltoChessGameState, after: HoltoChessGameState, matches: MatchResult[]): void {
  for (const match of matches) match.rewards = match.playerIds.map((playerId) => {
    const previous = playerById(before, playerId); const current = playerById(after, playerId);
    const outcome = after.round === 5 ? "FINAL" : current.eliminated ? "ELIMINATED"
      : match.stage === "primary" && (after.round === 2 || after.round === 4)
        ? match.winnerIds.includes(playerId) ? "WINNER_GROUP" : "LOSER_GROUP" : "SURVIVED";
    return { playerId, beforeBB: previous.stackBB, afterBB: current.stackBB, deltaBB: current.stackBB - previous.stackBB,
      beforePoints: previous.points, afterPoints: current.points, deltaPoints: current.points - previous.points, outcome };
  });
}

export function resolvePrimary(source: HoltoChessGameState): HoltoChessGameState {
  const state = structuredClone(source);
  if (state.phase !== "SHOWDOWN_PRIMARY") throw new Error("1차 쇼다운 단계가 아닙니다.");
  const alive = shuffle(state.players.filter((player) => !player.eliminated).map((player) => player.id), () => nextRandom(state));
  const boardCount = state.round === 2 ? 2 : state.round === 5 ? 0 : 1;
  const matches = state.round === 5
    ? [resolveParticipants(state, alive, 0, "final", false)]
    : pair(alive).map((ids) => resolveParticipants(state, ids, boardCount, "primary"));
  state.matches.push(...matches); state.roundResults = matches;
  if (state.round === 1) matches.forEach((match) => rewardMatch(state, match, BALANCE.points.r1Win));
  if (state.round === 2) matches.forEach((match) => rewardMatch(state, match, BALANCE.points.r2PrimaryWin));
  if (state.round === 3) matches.forEach((match) => rewardMatch(state, match, BALANCE.points.r3Win));
  if (state.round === 4) matches.forEach((match) => rewardMatch(state, match, BALANCE.points.r4PrimaryWin));
  state.winnerGroup = matches.flatMap((match) => match.winnerIds);
  state.loserGroup = matches.flatMap((match) => match.playerIds.filter((id) => !match.winnerIds.includes(id)));
  if (state.round === 5) {
    for (const result of matches[0]!.results) playerById(state, result.playerId).points += FINAL_ROUND_PLACEMENT_POINTS[result.place] ?? 0;
    state.phase = "GAME_RESULT"; log(state, "The Last Hand · 최종 점수 집계 완료", "win");
  }
  else if (state.round === 2 || state.round === 4) { state.phase = "GROUP_ASSIGNMENT"; log(state, `승자조 ${state.winnerGroup.length}명 · 패자조 ${state.loserGroup.length}명`); }
  else { state.phase = "ROUND_RESULT"; log(state, `R${state.round} 쇼다운 종료`, "win"); }
  captureRewards(source, state, matches);
  return state;
}

export function beginSecondary(source: HoltoChessGameState): HoltoChessGameState {
  const state = structuredClone(source); if (state.phase !== "GROUP_ASSIGNMENT") throw new Error("그룹 배정 단계가 아닙니다.");
  state.phase = "SHOWDOWN_SECONDARY"; log(state, "새 매치별 보드로 2차전을 시작합니다."); return state;
}

function eliminate(state: HoltoChessGameState, ids: string[]): void {
  for (const id of ids) { const player = playerById(state, id); player.eliminated = true; player.eliminatedRound = state.round; releasePlayerCards(state, player); log(state, `${player.name} 탈락 · 점유 카드 전량 반환`, "danger"); }
}

export function resolveSecondary(source: HoltoChessGameState): HoltoChessGameState {
  const state = structuredClone(source); if (state.phase !== "SHOWDOWN_SECONDARY") throw new Error("2차 쇼다운 단계가 아닙니다.");
  const winnerMatches = state.round === 2
    ? pair(state.winnerGroup).map((ids) => resolveParticipants(state, ids, 2, "secondary"))
    : [resolveParticipants(state, state.winnerGroup, 1, "secondary")];
  const loserMatches = state.round === 2
    ? pair(state.loserGroup).map((ids) => resolveParticipants(state, ids, 2, "secondary"))
    : [resolveParticipants(state, state.loserGroup, 1, "secondary")];
  winnerMatches.forEach((match) => rewardMatch(state, match, state.round === 2 ? BALANCE.points.r2WinnerBracketWin : BALANCE.points.r4WinnerGroupFirst));
  loserMatches.forEach((match) => rewardMatch(state, match, 0, false));
  eliminate(state, loserMatches.flatMap((match) => match.playerIds.filter((id) => !match.winnerIds.includes(id))));
  winnerMatches.forEach((match) => { match.group = "winner"; });
  loserMatches.forEach((match) => { match.group = "loser"; });
  captureRewards(source, state, [...winnerMatches, ...loserMatches]);
  state.matches.push(...winnerMatches, ...loserMatches); state.roundResults = [...winnerMatches, ...loserMatches];
  state.phase = "ROUND_RESULT"; log(state, `R${state.round} 종료 · ${state.players.filter((player) => !player.eliminated).length}명 생존`, "win");
  assertPoolIntegrity(state); return state;
}

export function choicesFor(state: HoltoChessGameState): Augment[] {
  return shuffle(augmentPool(state.round), () => nextRandom(state)).slice(0, 3);
}

export function leaveRoundResult(source: HoltoChessGameState): HoltoChessGameState {
  const state = structuredClone(source); if (state.phase !== "ROUND_RESULT") throw new Error("라운드 결과 단계가 아닙니다.");
  if (state.round === 2 || state.round === 4) {
    const human = playerById(state, "p1");
    if (human.eliminated) {
      for (const survivor of state.players.filter((player) => !player.eliminated)) applyAugment(survivor, choicesFor(state)[0]!);
      state.phase = "NEXT_ROUND";
      log(state, "관전 모드 · 생존자 증강 선택 완료");
    } else {
      state.phase = "AUGMENT"; state.augmentChoices = choicesFor(state); log(state, `${state.round === 2 ? "첫 번째" : "두 번째"} 증강 선택`);
    }
  }
  else state.phase = "NEXT_ROUND";
  return state;
}

export function chooseAugment(source: HoltoChessGameState, playerId: string, augmentId: string): HoltoChessGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "AUGMENT" || player.eliminated) throw new Error("증강을 선택할 수 없습니다.");
  const augment = state.augmentChoices.find((item) => item.id === augmentId); if (!augment) throw new Error("제시된 증강이 아닙니다.");
  applyAugment(player, augment);
  for (const bot of state.players.filter((item) => !item.eliminated && item.id !== playerId)) applyAugment(bot, choicesFor(state)[0]!);
  state.phase = "NEXT_ROUND"; log(state, `${player.name} · ${augment.name} 획득`, "win"); return state;
}

export function startNextRound(source: HoltoChessGameState): HoltoChessGameState {
  const state = structuredClone(source); if (state.phase !== "NEXT_ROUND" || state.round >= 5) throw new Error("다음 라운드로 진행할 수 없습니다.");
  state.round = (state.round + 1) as Round; state.phase = "SHOP"; state.roundResults = []; state.winnerGroup = []; state.loserGroup = []; state.augmentChoices = [];
  for (const player of state.players.filter((item) => !item.eliminated)) {
    player.stackBB += BALANCE.roundIncomeBB; player.purchasesThisRound = 0; player.selectedCardIds = [];
    releaseShop(state, player); reserveShopCards(state, player);
  }
  log(state, `R${state.round} 시작 · 생존자 기본 수입 +${BALANCE.roundIncomeBB}BB`, "economy"); assertPoolIntegrity(state); return state;
}

export function finalStandings(state: HoltoChessGameState) {
  return state.players.filter((player) => !player.eliminated).map((player) => {
    const final = state.roundResults[0]?.results.find((result) => result.playerId === player.id);
    const baseHandScore = final ? BALANCE.handScores[final.hand.category] : 0;
    const augmentBonus = (final?.hand.category === "PAIR" && player.augments.some((augment) => augment.id === "pair_points") ? 3 : 0) + (player.augments.some((augment) => augment.id === "r5_hand_bonus") ? 4 : 0);
    const handScore = baseHandScore + augmentBonus; const stackScore = Math.floor(player.stackBB / BALANCE.stackScoreUnitBB);
    return { playerId: player.id, points: player.points, handScore, stackScore, total: player.points + handScore + stackScore, hand: final?.hand, finalPlace: final?.place ?? Infinity };
  }).sort((a, b) => b.total - a.total || a.finalPlace - b.finalPlace || (b.hand && a.hand ? compareHands(b.hand, a.hand) : 0));
}

export function getCard(state: HoltoChessGameState, id: string): Card { return state.ownershipCardPool.find((entry) => entry.card.id === id)!.card; }
export function getCardPrice(state: HoltoChessGameState, playerId: string, cardId: string): number { return discountedPrice(playerById(state, playerId), getCard(state, cardId)); }
