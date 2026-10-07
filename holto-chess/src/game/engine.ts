import { shuffle, type Card } from "../core/poker/cards";
import { evaluateOmahaPreflop, evaluatePartial, findBestFive, findBestOmaha, placeInRanking, rankPlayers, type HandValue } from "../core/poker/evaluate";
import { assertPoolIntegrity, createOwnershipPool, releasePlayerCards } from "./cardPool";
import { BALANCE, cardPrice, FINAL_LOADOUT_SIZE, finalPlacementPoints, handLimitFor, isAuctionRound, isFinalRound, isLineupFinal, isTripleRunRound, lastRoundFor, matchLossBB, minHandFor, purchaseLimitFor, R3_AUCTION, TRIPLE_RUN } from "./config";
import { bestBotSelection, bestRunLoadout, bestTripleRunLoadout, rankBotPairs, rankBotPurchases, rankBuybackOptions, scoreBotPlan, shouldBotReroll } from "./botStrategy";
import { calculateIcm } from "./icm";
import { emptySwissRecord, swissPairs } from "./swiss";
import { createShowdownDeck, drawCommunityBoards } from "./showdownDeck";
import { canSellWithoutBlocking } from "./shopRules";
import { ABILITY_IDS, abilityPrice, abilityShopSize, abilitySellRate, abilityRerollCost, abilityRerollLimit, abilityLockCost } from "./abilities";
import { rawShowdownEquity } from "./showdownEquity";
import { recordAbilityBenefit, recordAbilitySaving, rewardAbilities, rewardAbilityInterest, rewardQuadCorePlacement, rewardRoundLeader } from "./abilityRewards";
import type { GameLog, PorenaGameState, MatchResult, PlayerShowdown, PlayerState, Round, StreetSnapshot } from "./types";
import { beginCardAuction, beginFinalAuction, bestFinalLoadout } from "./finalAuction";
import { compareRoundStanding } from "./roundRanking";
import { finalFourWayEquity } from "./showdownEquity";

function nextRandom(state: PorenaGameState): number {
  if (state.randomMode === "secure") return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
  let x = state.seed | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x >>> 0;
  return state.seed / 4294967296;
}

function log(state: PorenaGameState, message: string, tone: GameLog["tone"] = "info", structured?: Pick<GameLog, "event" | "params" | "playerId">): void {
  state.logs.unshift({ id: ++state.logSequence, message, tone, ...structured });
  state.logs = state.logs.slice(0, 24);
}

function drawAvailable(state: PorenaGameState) {
  const available = state.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE");
  if (!available.length) return null;
  return available[Math.floor(nextRandom(state) * available.length)]!;
}

function reserveShopCards(state: PorenaGameState, player: PlayerState): void {
  const targetSize = abilityShopSize(player, state.round, state);
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

function transferReservedCardToOwned(state: PorenaGameState, player: PlayerState, cardId: string): void {
  const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!;
  player.shopCardIds = player.shopCardIds.filter((id) => id !== cardId);
  player.lockedShopCardIds = (player.lockedShopCardIds ?? []).filter((id) => id !== cardId);
  player.ownedCardIds.push(cardId);
  entry.state = "OWNED";
  entry.ownerPlayerId = player.id;
  delete entry.reservedPlayerId;
}

/** New games use the six-round format; `sixRounds = false` builds the five-round game that rooms saved before it still play. */
export function createGame(seed = Date.now(), randomMode: "seeded" | "secure" = "seeded", rulesVersion: 1 | 2 = 2, abilityDraft = false, sixRounds = true): PorenaGameState {
  seed = (seed >>> 0) || 1;
  const playerNames = ["나", "리버 폭스", "블러프 캣", "스페이드 울프", "턴 샤크", "클럽 레이븐", "다이아 바이퍼", "올인 베어"];
  const players: PlayerState[] = Array.from({ length: BALANCE.playerCount }, (_, index) => ({
    id: `p${index + 1}`, name: playerNames[index]!,
    stackBB: BALANCE.startStackBB, ownedCardIds: [], shopCardIds: [], selectedCardIds: [],
    shopSize: BALANCE.baseShopSize, purchasesThisRound: 0, rerollsUsed: 0, shopLocked: false,
    points: 0, winStreak: 0, loseStreak: 0, eliminated: false,
  }));
  const state: PorenaGameState = {
    rulesVersion, round: 1, phase: "SHOP", players, ownershipCardPool: createOwnershipPool(), matches: [],
    winnerGroup: [], loserGroup: [], roundResults: [], encounterSequence: 0, seed, randomMode, logSequence: 0, logs: [],
  };
  // The six-round format builds on the draft rules, so a version 1 game keeps five rounds.
  if (sixRounds && rulesVersion === 2) state.sixRounds = true;
  if (abilityDraft) {
    // Defer card dealing until the server has recorded the eight unique picks.
    for (const entry of state.ownershipCardPool) { entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId; }
    state.phase = "ABILITY_ORDER";
    state.abilityDraft = { order: shuffle(players.map(p => p.id), () => nextRandom(state)), deck: shuffle([...ABILITY_IDS], () => nextRandom(state)), picks: [] };
    state.abilityEvents = [];
    return state;
  }
  // Every seat builds its R1 hand from the shop; there is no free starting card.
  for (const player of players) reserveShopCards(state, player);
  assertPoolIntegrity(state);
  return state;
}

export function createAbilityGame(seed = Date.now(), randomMode: "seeded" | "secure" = "seeded", sixRounds = true): PorenaGameState { return createGame(seed, randomMode, 2, true, sixRounds); }

export function openAbilitySelection(source: PorenaGameState): PorenaGameState {
  if (source.phase !== "ABILITY_ORDER" || !source.abilityDraft) throw new Error("어빌리티 순서 공개 단계가 아닙니다.");
  return { ...structuredClone(source), phase: "ABILITY_PICK" };
}

export function pickAbility(source: PorenaGameState, playerId: string, slot: number): PorenaGameState {
  const draft = source.abilityDraft;
  if (source.phase !== "ABILITY_PICK" || !draft || draft.order[draft.picks.length] !== playerId) throw new Error("내 어빌리티 선택 차례가 아닙니다.");
  if (!Number.isInteger(slot) || slot < 0 || slot >= draft.deck.length || draft.picks.some(pick => pick.slot === slot)) throw new Error("선택할 수 없는 어빌리티 카드입니다.");
  const state = structuredClone(source); state.players.find(player => player.id === playerId)!.abilityId = draft.deck[slot]!;
  state.abilityDraft!.picks.push({ playerId, slot });
  if (state.abilityDraft!.picks.length === state.players.length) state.phase = "ABILITY_REVEAL";
  return state;
}

export function autoPickAbility(source: PorenaGameState): PorenaGameState {
  const draft = source.abilityDraft;
  if (source.phase !== "ABILITY_PICK" || !draft) throw new Error("어빌리티 선택 단계가 아닙니다.");
  const slots = draft.deck.flatMap((_, index) => draft.picks.some(pick => pick.slot === index) ? [] : [index]);
  const randomState = structuredClone(source);
  return pickAbility({ ...source, seed: randomState.seed }, draft.order[draft.picks.length]!, slots[Math.floor(nextRandom(randomState) * slots.length)]!);
}

export function finishAbilitySelection(source: PorenaGameState): PorenaGameState {
  if (source.phase !== "ABILITY_REVEAL" || source.players.some(player => !player.abilityId)) throw new Error("어빌리티 선택이 완료되지 않았습니다.");
  const state = structuredClone(source); state.phase = "SHOP";
  // Royal Blood's guaranteed starting rank is dealt first so no other seat can consume it.
  const royal = state.players.find(player => player.abilityId === "royal-blood");
  if (royal) {
    const candidates = state.ownershipCardPool.filter(entry => entry.state === "AVAILABLE" && entry.card.rank >= 10);
    const entry = candidates[Math.floor(nextRandom(state) * candidates.length)]!;
    entry.state = "OWNED"; entry.ownerPlayerId = royal.id; royal.ownedCardIds.push(entry.card.id);
  }
  // Besides Royal Blood, only Target Sniper gets a free card: a random one that becomes its reference card.
  const sniper = state.players.find(player => player.abilityId === "target-sniper");
  if (sniper) giveRandomOwnedCard(state, sniper);
  for (const player of state.players) if (player.ownedCardIds.length) player.firstCardId = player.ownedCardIds[0];
  for (const player of state.players) reserveShopCards(state, player);
  log(state, "어빌리티 배정과 시작 카드 지급 완료", "info", { event: "ABILITY_SELECTION_COMPLETE" });
  assertPoolIntegrity(state); return state;
}

export function buyCard(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "SHOP" || player.eliminated) throw new Error("지금은 구매할 수 없습니다.");
  if (!player.shopCardIds.includes(cardId)) throw new Error("내 상점에 예약된 카드가 아닙니다.");
  if (player.ownedCardIds.length >= handLimitFor(state.round, state)) throw new Error("이번 라운드 보유 한도에 도달했습니다.");
  if (player.purchasesThisRound >= purchaseLimitFor(state.round, state)) throw new Error("이번 라운드 구매 횟수를 모두 사용했습니다.");
  const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!;
  const price = abilityPrice(player, entry.card.rank);
  if (player.stackBB < price) throw new Error("BB가 부족합니다.");
  player.stackBB -= price; player.purchasesThisRound += 1;
  recordAbilitySaving(state, player, "purchase-discount", cardPrice(entry.card.rank) - price, cardId);
  transferReservedCardToOwned(state, player, cardId);
  log(state, `${player.name} · ${entry.card.id} 구매 −${price}BB`, "economy", { event: "CARD_PURCHASED", playerId, params: { player: player.name, card: entry.card.id, amount: price } });
  assertPoolIntegrity(state); return state;
}

export function sellCard(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  if (state.phase !== "SHOP" || !player.ownedCardIds.includes(cardId)) throw new Error("판매할 수 없는 카드입니다.");
  if (!canSellWithoutBlocking({ ownedCount: player.ownedCardIds.length, purchases: player.purchasesThisRound,
    purchaseLimit: purchaseLimitFor(state.round, state), handLimit: minHandFor(state.round, state) })) {
    throw new Error("남은 구매 횟수로 필수 보유 카드를 채울 수 없어 판매할 수 없습니다.");
  }
  const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!;
  const rate = abilitySellRate(player);
  const refund = Math.floor(cardPrice(entry.card.rank) * rate);
  recordAbilitySaving(state, player, "sale-premium", refund - Math.floor(cardPrice(entry.card.rank) * BALANCE.sellRate), cardId);
  player.stackBB += refund; player.ownedCardIds = player.ownedCardIds.filter((id) => id !== cardId); player.selectedCardIds = player.selectedCardIds.filter((id) => id !== cardId);
  entry.state = "AVAILABLE"; delete entry.ownerPlayerId;
  log(state, `${player.name} · ${entry.card.id} 판매 +${refund}BB`, "economy", { event: "CARD_SOLD", playerId, params: { player: player.name, card: entry.card.id, amount: refund } });
  assertPoolIntegrity(state); return state;
}

export function rerollShop(source: PorenaGameState, playerId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  const cost = abilityRerollCost(player);
  const targetSize = abilityShopSize(player, state.round, state);
  const lockedCount = player.shopCardIds.filter((id) => player.lockedShopCardIds?.includes(id)).length;
  if (state.phase !== "SHOP" || player.eliminated || player.stackBB < cost) throw new Error("리롤할 수 없습니다.");
  if ((player.rerollsUsed ?? 0) >= abilityRerollLimit(player, state.round, state)) throw new Error("이번 라운드 리롤 횟수를 모두 사용했습니다.");
  if (targetSize > 0 && lockedCount >= targetSize) throw new Error("모든 상점 카드가 잠겨 있어 리롤할 수 없습니다.");
  assertPoolIntegrity(state);
  releaseShop(state, player); player.stackBB -= cost; reserveShopCards(state, player);
  recordAbilitySaving(state, player, "free-reroll", BALANCE.rerollCostBB - cost);
  player.rerollsUsed = (player.rerollsUsed ?? 0) + 1;
  log(state, `${player.name} · 상점 리롤 −${cost}BB`, "economy", { event: "SHOP_REROLLED", playerId, params: { player: player.name, amount: cost } });
  assertPoolIntegrity(state); return state;
}

export function toggleShopLock(source: PorenaGameState, playerId: string, cardId: string): PorenaGameState {
  const state = structuredClone(source); const player = playerById(state, playerId);
  const entry = state.ownershipCardPool.find((e) => e.card.id === cardId);
  if (state.phase !== "SHOP" || player.eliminated || !player.shopCardIds.includes(cardId) || entry?.state !== "RESERVED_IN_SHOP" || entry.reservedPlayerId !== playerId) throw new Error("내 상점 카드만 잠글 수 있습니다.");
  const locked = player.lockedShopCardIds ?? [];
  if (locked.includes(cardId)) player.lockedShopCardIds = locked.filter((id) => id !== cardId);
  else {
    const cost = abilityLockCost(player);
    if (player.stackBB < cost) throw new Error(`카드 잠금에 ${cost}BB가 필요합니다.`);
    player.stackBB -= cost;
    player.lockedShopCardIds = [...locked, cardId];
    recordAbilitySaving(state, player, "shop-lock", BALANCE.cardLockCostBB - cost, cardId);
  }
  log(state, `${player.name} · 카드 잠금 ${locked.includes(cardId) ? "해제" : `−${abilityLockCost(player)}BB`}`, "economy", { event: locked.includes(cardId) ? "CARD_UNLOCKED" : "CARD_LOCKED", playerId, params: { player: player.name, amount: abilityLockCost(player) } });
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

/** One shop decision a bot policy can ask for. The engine still checks every rule before applying it. */
export type BotShopAction = { type: "BUY"; cardId: string } | { type: "SELL"; cardId: string } | { type: "REROLL" } | { type: "DONE" };
export type BotShopInput = {
  round: Round; playerId: string; stackBB: number; handLimit: number; purchasesLeft: number;
  rerollsLeft: number; rerollCost: number; ownedCards: Card[]; shopCards: { card: Card; price: number }[];
};
/**
 * Replaces the default bot shopping brain. Passing one never changes prices, limits or ownership:
 * the engine validates each returned action and stops at the first one the real rules reject.
 */
export type BotShopPolicy = (input: BotShopInput) => BotShopAction;
const POLICY_STEP_LIMIT = 24;

function aiPrepare(state: PorenaGameState, humanIds: readonly string[] = ["p1"], policy?: BotShopPolicy): void {
  const limit = handLimitFor(state.round, state);
  const planContext = { rulesVersion: state.rulesVersion ?? 1, sixRounds: !!state.sixRounds } as const;
  for (const player of state.players.filter((item) => !item.eliminated && !humanIds.includes(item.id))) {
    const ownedCards = () => cardsFor(state, player.ownedCardIds);
    const buy = (cardId: string) => {
      const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!; const price = abilityPrice(player, entry.card.rank);
      player.stackBB -= price; player.purchasesThisRound += 1;
      recordAbilitySaving(state, player, "purchase-discount", cardPrice(entry.card.rank) - price, cardId);
      transferReservedCardToOwned(state, player, cardId);
    };
    const reroll = () => {
      const cost = abilityRerollCost(player);
      player.stackBB -= cost; releaseShop(state, player); reserveShopCards(state, player);
      recordAbilitySaving(state, player, "free-reroll", BALANCE.rerollCostBB - cost); player.rerollsUsed = (player.rerollsUsed ?? 0) + 1;
    };
    if (policy) {
      const sell = (cardId: string) => {
        const entry = state.ownershipCardPool.find((item) => item.card.id === cardId)!;
        const rate = abilitySellRate(player);
        recordAbilitySaving(state, player, "sale-premium", Math.floor(cardPrice(entry.card.rank) * rate) - Math.floor(cardPrice(entry.card.rank) * BALANCE.sellRate), cardId);
        player.stackBB += Math.floor(cardPrice(entry.card.rank) * rate);
        player.ownedCardIds = player.ownedCardIds.filter((id) => id !== cardId);
        entry.state = "AVAILABLE"; delete entry.ownerPlayerId;
      };
      for (let step = 0; step < POLICY_STEP_LIMIT; step += 1) {
        const purchaseLimit = purchaseLimitFor(state.round, state);
        const rerollCost = abilityRerollCost(player);
        const shopCards = player.shopCardIds.map((id) => state.ownershipCardPool.find((entry) => entry.card.id === id)!.card)
          .map((card) => ({ card, price: abilityPrice(player, card.rank) }));
        const action = policy({
          round: state.round, playerId: player.id, stackBB: player.stackBB, handLimit: limit,
          purchasesLeft: purchaseLimit - player.purchasesThisRound,
          rerollsLeft: abilityRerollLimit(player, state.round, state) - (player.rerollsUsed ?? 0),
          rerollCost, ownedCards: ownedCards(), shopCards,
        });
        // An illegal request ends this bot's shopping instead of bending a rule for it.
        if (action.type === "BUY") {
          const offer = shopCards.find((entry) => entry.card.id === action.cardId);
          if (!offer || offer.price > player.stackBB || player.ownedCardIds.length >= limit || player.purchasesThisRound >= purchaseLimit) break;
          buy(action.cardId); continue;
        }
        if (action.type === "SELL") {
          // The same guard the human path uses: a bot may not sell itself out of a legal hand.
          if (!player.ownedCardIds.includes(action.cardId)) break;
          if (!canSellWithoutBlocking({ ownedCount: player.ownedCardIds.length, purchases: player.purchasesThisRound,
            purchaseLimit, handLimit: limit })) break;
          sell(action.cardId); continue;
        }
        if (action.type === "REROLL") {
          const lockedCount = player.shopCardIds.filter((id) => player.lockedShopCardIds?.includes(id)).length;
          const shopSize = abilityShopSize(player, state.round, state);
          if ((player.rerollsUsed ?? 0) >= abilityRerollLimit(player, state.round, state) || player.stackBB < rerollCost) break;
          if (shopSize > 0 && lockedCount >= shopSize) break;
          reroll(); continue;
        }
        break;
      }
      player.selectedCardIds = bestBotSelection(state.round, ownedCards());
      continue;
    }
    const hasRerollableSlot = () => {
      const targetSize = abilityShopSize(player, state.round, state);
      return player.shopCardIds.length < targetSize
        || player.shopCardIds.some((id) => !(player.lockedShopCardIds ?? []).includes(id));
    };
    while (player.ownedCardIds.length < limit && player.purchasesThisRound < purchaseLimitFor(state.round, state)) {
      const options = player.shopCardIds.map((id) => state.ownershipCardPool.find((entry) => entry.card.id === id)!)
        .map((entry) => ({ card: entry.card, price: abilityPrice(player, entry.card.rank) })).filter((entry) => entry.price <= player.stackBB);
      const ranked = rankBotPurchases(state.round, player, ownedCards(), options, planContext); const best = ranked[0];
      const rerollCost = abilityRerollCost(player);
      const missing = limit - player.ownedCardIds.length;
      const pair = missing >= 2 && purchaseLimitFor(state.round, state) - player.purchasesThisRound >= 2
        ? rankBotPairs(state.round, player, ownedCards(), options, planContext)[0] : undefined;
      if (hasRerollableSlot() && player.stackBB >= rerollCost + missing * 5 && shouldBotReroll(state.round, player, pair ?? best, rerollCost, state)) { reroll(); continue; }
      if (pair) { buy(pair.cards[0].card.id); buy(pair.cards[1].card.id); continue; }
      if (!best) break;
      buy(best.card.id);
    }

    // Extra purchase capacity becomes a deliberate upgrade: compare every legal swap by expected match EV.
    while (player.ownedCardIds.length === limit && player.purchasesThisRound < purchaseLimitFor(state.round, state)) {
      const baseline = scoreBotPlan(state.round, ownedCards(), player.stackBB, `${player.id}:upgrade`, planContext);
      let bestSwap: { ownedId: string; shopId: string; utility: number } | null = null;
      for (const ownedId of player.ownedCardIds) for (const shopId of player.shopCardIds) {
        const owned = state.ownershipCardPool.find((entry) => entry.card.id === ownedId)!.card;
        const offered = state.ownershipCardPool.find((entry) => entry.card.id === shopId)!.card;
        const refundRate = abilitySellRate(player);
        const refund = Math.floor(cardPrice(owned.rank) * refundRate); const price = abilityPrice(player, offered.rank);
        if (player.stackBB + refund < price) continue;
        const replacement = ownedCards().filter((card) => card.id !== ownedId).concat(offered);
        const plan = scoreBotPlan(state.round, replacement, player.stackBB + refund - price, `${player.id}:upgrade`, planContext);
        if (plan.utility > baseline.utility + 2.25 && (!bestSwap || plan.utility > bestSwap.utility)) bestSwap = { ownedId, shopId, utility: plan.utility };
      }
      if (bestSwap) {
        const oldEntry = state.ownershipCardPool.find((entry) => entry.card.id === bestSwap!.ownedId)!;
        const refundRate = abilitySellRate(player);
        recordAbilitySaving(state, player, "sale-premium", Math.floor(cardPrice(oldEntry.card.rank) * refundRate) - Math.floor(cardPrice(oldEntry.card.rank) * BALANCE.sellRate), bestSwap.ownedId);
        player.stackBB += Math.floor(cardPrice(oldEntry.card.rank) * refundRate); player.ownedCardIds = player.ownedCardIds.filter((id) => id !== bestSwap!.ownedId);
        oldEntry.state = "AVAILABLE"; delete oldEntry.ownerPlayerId; buy(bestSwap.shopId); continue;
      }
      const rerollCost = abilityRerollCost(player);
      if (hasRerollableSlot() && (player.rerollsUsed ?? 0) < abilityRerollLimit(player, state.round, state) && player.stackBB >= rerollCost + 20 && baseline.equity < 0.58) { reroll(); continue; }
      break;
    }
    player.selectedCardIds = bestBotSelection(state.round, ownedCards());
  }
}

/** Six-round R5 and R6 fill a short human hand from the shop instead of letting it forfeit. */
export const assistsShortHands = (state: Pick<PorenaGameState, "sixRounds" | "round">) => !!state.sixRounds && (state.round === 5 || state.round === 6);

/**
 * Buys from this seat's own shop until it holds the round's minimum: the largest affordable set
 * first, then the one the bot rates best. Rerolls only when the shop has nothing it can afford.
 * A seat may still end short when its BB cannot cover any card; it then forfeits as usual.
 */
function fillShortHand(state: PorenaGameState, player: PlayerState): void {
  const minimum = minHandFor(state.round, state);
  const purchaseLimit = purchaseLimitFor(state.round, state);
  const context = { rulesVersion: state.rulesVersion ?? 1, sixRounds: !!state.sixRounds } as const;
  for (let guard = 0; guard < 8 && player.ownedCardIds.length < minimum && player.purchasesThisRound < purchaseLimit; guard += 1) {
    const needed = Math.min(minimum - player.ownedCardIds.length, purchaseLimit - player.purchasesThisRound);
    const offers = player.shopCardIds.map((id) => ({ card: getCard(state, id), price: abilityPrice(player, getCard(state, id).rank) }));
    let best: { cards: typeof offers; utility: number } | null = null;
    for (let size = Math.min(needed, offers.length); size > 0 && !best; size -= 1) {
      for (const set of subsets(offers, size)) {
        const price = set.reduce((sum, offer) => sum + offer.price, 0);
        if (price > player.stackBB) continue;
        const plan = scoreBotPlan(state.round, [...cardsFor(state, player.ownedCardIds), ...set.map((offer) => offer.card)], player.stackBB - price, `${player.id}:assist`, context);
        if (!best || plan.utility > best.utility) best = { cards: set, utility: plan.utility };
      }
    }
    if (best) {
      for (const offer of best.cards) {
        player.stackBB -= offer.price; player.purchasesThisRound += 1;
        recordAbilitySaving(state, player, "purchase-discount", cardPrice(offer.card.rank) - offer.price, offer.card.id);
        transferReservedCardToOwned(state, player, offer.card.id);
        log(state, `${player.name} · 시간 종료 자동 구매 ${offer.card.id} −${offer.price}BB`, "economy", { event: "CARD_AUTO_PURCHASED", playerId: player.id, params: { player: player.name, card: offer.card.id, amount: offer.price } });
      }
      continue;
    }
    const cost = abilityRerollCost(player);
    if ((player.rerollsUsed ?? 0) >= abilityRerollLimit(player, state.round, state) || player.stackBB < cost) return;
    releaseShop(state, player); player.stackBB -= cost; reserveShopCards(state, player);
    recordAbilitySaving(state, player, "free-reroll", BALANCE.rerollCostBB - cost);
    player.rerollsUsed = (player.rerollsUsed ?? 0) + 1;
  }
}

function subsets<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, index) => subsets(items.slice(index + 1), size - 1).map((rest) => [item, ...rest]));
}

/** `botPolicy` is for practice modes (the tutorial); leaving it out keeps the normal bot brain. */
export function prepareShowdown(source: PorenaGameState, humanIds: readonly string[] = ["p1"], botPolicy?: BotShopPolicy): PorenaGameState {
  if (source.phase !== "SHOP") throw new Error("상점 단계가 아닙니다.");
  const state = structuredClone(source); aiPrepare(state, humanIds, botPolicy);
  const humans = humanIds.map((id) => playerById(state, id)).filter((p) => !p.eliminated);
  const minimum = minHandFor(state.round, state);
  if (assistsShortHands(state)) for (const human of humans.filter((p) => p.ownedCardIds.length < minimum)) fillShortHand(state, human);
  else if (humans.some((p) => p.ownedCardIds.length < minimum)) throw new Error(`R${state.round}은 보유 카드 ${minimum}장이 필요합니다.`);
  const requiredSelection = state.round === 2 ? 2 : 0;
  if (requiredSelection && humans.some((p) => p.selectedCardIds.length !== requiredSelection)) { state.phase = "DECK_SELECT"; return state; }
  if (isTripleRunRound(state.round, state)) {
    // Pre-fill the recommended split so the placement screen shows exactly what Ready locks in.
    for (const p of state.players.filter((p) => !p.eliminated)) p.selectedCardIds = p.ownedCardIds.length === TRIPLE_RUN.runs * 2
      ? bestTripleRunLoadout(p, cardsFor(state, p.ownedCardIds)) : [...p.ownedCardIds];
    state.phase = "RUN_LOADOUT"; assertPoolIntegrity(state); return state;
  }
  if (isLineupFinal(state.round, state)) {
    // Every finalist starts on the strongest five (the rest are burned). Only a human holding more
    // than five has anything to change, so the lineup step opens just for them.
    const alive = state.players.filter((p) => !p.eliminated);
    for (const p of alive) p.selectedCardIds = defaultLineup(state, p);
    if (humans.some((p) => p.ownedCardIds.length > FINAL_LOADOUT_SIZE)) { state.phase = "RUN_LOADOUT"; assertPoolIntegrity(state); return state; }
  }
  state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); assertPoolIntegrity(state); return state;
}

/** R6's pre-selected five: the strongest made hand among the owned cards; a hand of five or fewer plays as is. */
function defaultLineup(state: PorenaGameState, player: PlayerState): string[] {
  return player.ownedCardIds.length > FINAL_LOADOUT_SIZE ? bestFinalLoadout(cardsFor(state, player.ownedCardIds), []) : [...player.ownedCardIds];
}

/** A chosen R6 lineup: five distinct cards the player still owns. */
const validLineup = (player: PlayerState) => player.selectedCardIds.length === FINAL_LOADOUT_SIZE
  && new Set(player.selectedCardIds).size === FINAL_LOADOUT_SIZE && player.selectedCardIds.every((id) => player.ownedCardIds.includes(id));

/** R6 cards a finalist owns but does not play. */
export function burnCardIds(state: PorenaGameState, playerId: string): string[] {
  const player = playerById(state, playerId);
  if (!isLineupFinal(state.round, state) || player.eliminated) return [];
  const played = playedCardIds(state, player);
  return player.ownedCardIds.filter((id) => !played.includes(id));
}

export function confirmSelection(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source); const human = playerById(state, "p1");
  const required = state.round === 2 ? 2 : 0;
  if (!required || human.selectedCardIds.length !== required) throw new Error(`R${state.round} 출전 카드를 올바르게 나누세요.`);
  state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); log(state, "R2 홀카드 2장을 확정했습니다.", "info", { event: "R2_HOLE_CARDS_LOCKED" }); return state;
}

/** A missing required hand loses to every legal hand, even a board-only royal.
 * Keep actual ownership/revealed cards unchanged; never mint a recovery card. */
function forfeitHand(): HandValue {
  return { category: "HIGH_CARD", categoryRank: 0, kickers: [], bestFive: [], displayName: "몰수패" };
}

function lacksRequiredCards(state: PorenaGameState, playerId: string): boolean {
  if (state.round === 5 && state.finalAuction) return playerById(state, playerId).finalLoadoutCardIds?.length !== 5;
  return playerById(state, playerId).ownedCardIds.length < minHandFor(state.round, state);
}

/** The hole cards a complete hand plays: R2 [anchor, run secondary], the R5 RUN's pair, the final loadout, or every owned card. */
function playedCardIds(state: PorenaGameState, player: PlayerState, gameNumber?: 1 | 2 | 3): string[] {
  if (state.round === 5 && state.finalAuction) return [...(player.finalLoadoutCardIds ?? [])];
  if (isTripleRunRound(state.round, state)) {
    // A complete placement is locked before every R5 showdown; owned order stands in only for a hand never placed.
    const placed = player.selectedCardIds.length === TRIPLE_RUN.runs * 2 ? player.selectedCardIds : player.ownedCardIds;
    const run = (gameNumber ?? 1) - 1; return placed.slice(run * 2, run * 2 + 2);
  }
  if (state.round === 2) return state.rulesVersion === 2 ? [player.selectedCardIds[0]!, player.selectedCardIds[gameNumber ?? 1]!] : [...player.selectedCardIds];
  if (isLineupFinal(state.round, state) && player.ownedCardIds.length > FINAL_LOADOUT_SIZE) {
    return validLineup(player) ? [...player.selectedCardIds] : bestFinalLoadout(cardsFor(state, player.ownedCardIds), []);
  }
  return [...player.ownedCardIds];
}

/** A final played without a community board: the legacy five-round shop final. */
const boardlessFinal = (state: PorenaGameState) => isFinalRound(state.round, state) && !state.finalAuction && !isLineupFinal(state.round, state);

function shownCardIds(state: PorenaGameState, playerId: string, gameNumber?: 1 | 2 | 3): string[] {
  const player = playerById(state, playerId);
  // An incomplete R2/R5 hand cannot form its runs. Show what is actually owned.
  if ((state.round === 2 || isTripleRunRound(state.round, state)) && lacksRequiredCards(state, playerId)) return [...player.ownedCardIds];
  return playedCardIds(state, player, gameNumber);
}

function handFor(state: PorenaGameState, playerId: string, board: Card[], gameNumber?: 1 | 2 | 3): HandValue {
  if (lacksRequiredCards(state, playerId)) return forfeitHand();
  const player = playerById(state, playerId);
  const owned = cardsFor(state, playedCardIds(state, player, gameNumber));
  const preferred = player.abilityId === "target-sniper" && player.ownedCardIds.includes(player.firstCardId ?? "") ? player.firstCardId : undefined;
  if (state.round === 3) return findBestOmaha(owned, board, preferred);
  if (boardlessFinal(state)) return findBestFive(owned, preferred);
  return findBestFive([...owned, ...board], preferred);
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
  gameNumber?: 1 | 2 | 3,
  suppliedBoards?: Card[][],
): MatchResult {
  const forfeited = new Set(playerIds.filter((id) => lacksRequiredCards(state, id)));
  const equities: MatchResult["equities"] = {};
  if (!isFinalRound(state.round, state) && playerIds.length === 2 && !forfeited.size && playerIds.some(id => playerById(state, id).abilityId === "zero-risk")) {
    const shown = playerIds.map(id => cardsFor(state, shownCardIds(state, id, gameNumber)));
    const used = new Set(shown.flat().map(card => card.id));
    const dead = playerIds.flatMap(id => playerById(state, id).ownedCardIds).filter(id => !used.has(id)).map(id => state.ownershipCardPool.find(entry => entry.card.id === id)!.card);
    // An R5 RUN plays two hole cards on one board: the same estimate as R2.
    const left = rawShowdownEquity(isTripleRunRound(state.round, state) ? 2 : state.round, shown[0]!, shown[1]!, dead);
    const right = left === null ? null : 100 - left;
    if (left !== null && right !== null) for (const [index, id] of playerIds.entries()) {
      const rawPercent = index === 0 ? left : right;
      equities[id] = { rawPercent, insuranceEligible: rawPercent >= 60 };
    }
  }
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
  const boardWinnerIds = boardRankings.map((ranking) => ranking[0]!.filter((id) => !forfeited.has(id)));
  let winnerIds: string[];
  let suddenDeathCount = 0;
  let highCardDraw: MatchResult["highCardDraw"];
  if (boards.length === 2 && playerIds.length === 2) {
    const wins = new Map(playerIds.map((id) => [id, 0]));
    for (const ranking of boardRankings) if (ranking[0]!.length === 1) wins.set(ranking[0]![0]!, wins.get(ranking[0]![0]!)! + 1);
    const [a, b] = playerIds; const delta = wins.get(a)! - wins.get(b)!;
    winnerIds = delta > 0 ? [a] : delta < 0 ? [b] : [];
  } else winnerIds = boardWinnerIds[0]!;
  const regulationWinnerIds = preserveRegulationTie && winnerIds.length > 1 ? [...winnerIds] : undefined;
  const tiebreakStartIndex = boards.length;
  while (requireSingleWinner && winnerIds.length !== 1) {
    const tied = winnerIds.length ? winnerIds : playerIds;
    if (suddenDeathCount >= 2 || tied.every((id) => forfeited.has(id))) {
      // A separate rank-only deck cannot tie and never changes owned cards.
      // If everyone forfeited, this chooses bracket advancement only, with no reward.
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
  const revealedCardIds = Object.fromEntries(playerIds.map((id) => [id, shownCardIds(state, id, gameNumber)]));
  if (highCardDraw) results = results.map((result) => ({
    ...result, place: result.playerId === highCardDraw.winnerId ? 1
      : highCardDraw.draws.some((draw) => draw.playerId === result.playerId) ? 2 : result.place,
  }));
  return { id: `${state.round}-${stage}-${++state.encounterSequence}`, stage, playerIds, winnerIds, boards, boardResults, boardWinnerIds, streetSnapshots, runoutCount: boardCount, results, suddenDeathCount, highCardDraw, revealedCardIds, equities,
    regulationWinnerIds, tiebreakKind: suddenDeathCount ? tiebreakKind : undefined,
    tiebreakStartIndex: suddenDeathCount ? tiebreakStartIndex : undefined, gameNumber };
}

function rewardMatch(state: PorenaGameState, match: MatchResult, pointValue: number, awardIds: readonly string[] = match.winnerIds): void {
  match.pointAwards = Object.fromEntries(match.playerIds.map((id) => [id, awardIds.includes(id) ? pointValue : 0]));
  if (state.round === 4 && match.group === "winner") {
    const prizes: Record<number, number> = { 1: BALANCE.points.r4WinnerGroup.first, 2: BALANCE.points.r4WinnerGroup.second, 3: BALANCE.points.r4WinnerGroup.third };
    // R4 deciders choose the winner only; a 1/2/2 finish pays each runner-up 3P.
    if (match.results.filter((result) => result.place === 2).length > 1) prizes[2] = BALANCE.points.r4WinnerGroup.tiedSecond;
    match.pointAwards = Object.fromEntries(match.results.map((result) => [result.playerId, prizes[result.place] ?? 0]));
  }
  const forfeited = new Set(match.results.filter((result) => result.hand.categoryRank === 0).map((result) => result.playerId));
  for (const id of forfeited) match.pointAwards[id] = 0;
  match.pointAwardDetails = Object.fromEntries(match.playerIds.map((id) => {
    const context = match.regulationWinnerIds ? "정규 결과 SPLIT" : match.group === "loser" ? "생존 결정" : match.group === "winner" ? "Winner Group" : "경기 결과";
    const place = match.results.find((result) => result.playerId === id)!.place;
    const tied = match.results.filter((result) => result.place === place).length > 1;
    const placement = state.round === 4 && match.group === "winner" ? ` ${tied ? "공동 " : ""}${place}위` : "";
    return [id, `${context}${placement} · +${match.pointAwards![id]}P`];
  }));
  for (const playerId of match.playerIds) {
    const player = playerById(state, playerId); const won = awardIds.includes(playerId);
    if (forfeited.has(playerId)) {
      player.winStreak = 0; player.loseStreak += 1;
      match.pointAwardDetails![playerId] = `카드 부족 · 몰수패 · +0P · +0BB${match.highCardDraw?.winnerId === playerId ? " · 추첨 진출" : ""}`;
      continue;
    }
    // An R3 split clears both streaks; any other split pays both seats as winners. Only a loss pays BB.
    const split = state.round === 3 && match.winnerIds.length > 1;
    const bb = won || split ? 0 : matchLossBB(state.round, player.loseStreak);
    player.stackBB += bb;
    player.points += match.pointAwards[playerId]!;
    player.winStreak = won && !split ? player.winStreak + 1 : 0;
    player.loseStreak = won || split ? 0 : player.loseStreak + 1;
    match.pointAwardDetails![playerId] += ` · +${bb}BB`;
  }
}

// R1 and R3 resolve all three matchdays at once, so without a standings snapshot the cinematic
// falls back to live player points and shows the finished round's total during match 1.
function rewardMatchWithLedger(state: PorenaGameState, match: MatchResult, pointValue: number, awardIds: readonly string[] = match.winnerIds): void {
  match.standingsBefore = pointSnapshot(state);
  const before = structuredClone(state);
  rewardMatch(state, match, pointValue, awardIds);
  captureRewards(before, state, [match]);
  match.standingsAfterRuns = [pointSnapshot(state)];
}

export function rewardFinalPlacements(state: PorenaGameState, match: MatchResult): void {
  const awards: Record<string, number> = {};
  const details: Record<string, string> = {};
  // Competition ranking can tie at any place, so every tied group — not just
  // first — shares the prize slots it occupies. Otherwise the 50P ladder inflates.
  const byPlace = new Map<number, PlayerShowdown[]>();
  for (const result of match.results) {
    if (result.hand.categoryRank === 0) {
      awards[result.playerId] = 0; details[result.playerId] = "카드 부족 · 몰수패 · +0P · +0BB";
    } else byPlace.set(result.place, [...(byPlace.get(result.place) ?? []), result]);
  }
  for (const [place, group] of [...byPlace].sort(([a], [b]) => a - b)) {
    const prizes = Array.from({ length: group.length }, (_, index) => finalPlacementPoints(state)[place + index] ?? 0);
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
    const outcome = isFinalRound(after.round, after) ? "FINAL" : current.eliminated ? "ELIMINATED"
      : match.stage === "primary" && (after.round === 2 || after.round === 4)
        ? match.winnerIds.includes(playerId) ? "WINNER_GROUP" : "LOSER_GROUP" : "SURVIVED";
    return { playerId, beforeBB: previous.stackBB, afterBB: current.stackBB, deltaBB: current.stackBB - previous.stackBB,
      beforePoints: previous.points, afterPoints: current.points, deltaPoints: current.points - previous.points, outcome,
      detail: match.pointAwardDetails?.[playerId] };
  });
}

function streetHandFor(state: PorenaGameState, playerId: string, board: Card[], gameNumber?: 1 | 2 | 3): HandValue {
  if (lacksRequiredCards(state, playerId)) return forfeitHand();
  const owned = cardsFor(state, playedCardIds(state, playerById(state, playerId), gameNumber));
  if (state.round === 3) return board.length === 0 ? evaluateOmahaPreflop(owned) : findBestOmaha(owned, board);
  const candidates = [...owned, ...board];
  return candidates.length >= 5 ? findBestFive(candidates) : evaluatePartial(candidates);
}

function streetSnapshotsFor(state: PorenaGameState, playerIds: string[], board: Card[], gameNumber?: 1 | 2 | 3): StreetSnapshot[] {
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

function freezePrimaryPairings(state: PorenaGameState): void {
  const order = shuffle(state.players.filter((player) => !player.eliminated).map((player) => player.id), () => nextRandom(state));
  state.primaryOrderIds = order;
  const seats = state.round === 3 ? state.r3Seeds ?? seedOmaha(state) : order;
  state.primaryPairings = isFinalRound(state.round, state) ? [seats] : isTripleRunRound(state.round, state) ? opponentPairings(state) : pair(seats);
}

/** The leader and the chosen opponent, then the other two survivors. */
function opponentPairings(state: PorenaGameState): string[][] {
  const pick = state.opponentSelect;
  if (!pick?.opponentId) return pair(state.players.filter((player) => !player.eliminated).map((player) => player.id));
  const lead = [pick.chooserId, pick.opponentId];
  const rest = pick.order.filter((id) => !lead.includes(id) && !playerById(state, id).eliminated);
  return rest.length ? [lead, rest] : [lead];
}

export function resolvePrimary(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source);
  if (state.phase !== "SHOWDOWN_PRIMARY") throw new Error("1차 쇼다운 단계가 아닙니다.");
  const alive = state.primaryOrderIds ?? shuffle(state.players.filter((player) => !player.eliminated).map((player) => player.id), () => nextRandom(state));
  if (state.round === 1 || state.round === 3) {
    const omaha = state.round === 3;
    // R3 entry freezes Point/BB seeding before shopping; fallback supports older snapshots.
    const seeds = omaha ? state.r3Seeds ?? seedOmaha(state) : alive;
    const records = Object.fromEntries(alive.map((id) => [id, emptySwissRecord()]));
    const history: string[][] = [];
    const matches: MatchResult[] = [];
    for (let day = 1; day <= 3; day++) {
      const pairs = day === 1 ? state.primaryPairings ?? pair(seeds) : swissPairs(shuffle(alive, () => nextRandom(state)), records, history);
      for (const ids of pairs) {
        const match = resolveParticipants(state, ids, 1, "primary", false);
        match.matchday = day;
        match.swissBefore = Object.fromEntries(ids.map((id) => [id, { ...records[id]! }]));
        const split = match.winnerIds.length > 1;
        const before = structuredClone(state);
        rewardMatchWithLedger(state, match, omaha ? split ? BALANCE.points.r3.gameSplit : BALANCE.points.r3.gameWin : split ? BALANCE.points.r1.split : BALANCE.points.r1.win);
        rewardAbilities(state, match); captureRewards(before, state, [match]);
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
    if (!state.survival) rewardAbilityInterest(state);
    rewardRoundLeader(state);
    log(state, omaha ? "R3 Omaha Swiss 3경기 종료 · 승리 4P / Split 2P · 누적 승점 탈락 판정" : "R1 스위스 3경기 종료 · 승리 3P / Split 1P · 전원 생존", "win", { event: omaha ? "R3_SWISS_COMPLETE" : "R1_SWISS_COMPLETE" });
    return state;
  }
  if (state.round === 2 && state.rulesVersion === 2) return resolveSplitRuns(state, state.primaryPairings ?? pair(alive));
  if (isTripleRunRound(state.round, state)) return resolveTripleRuns(state, state.primaryPairings ?? opponentPairings(state));
  const final = isFinalRound(state.round, state);
  const boardCount = state.round === 2 ? 2 : final ? 0 : 1;
  const matches = final
    ? [resolveParticipants(state, alive, state.finalAuction || isLineupFinal(state.round, state) ? 1 : 0, "final", false)]
    : (state.primaryPairings ?? pair(alive)).map((ids) => resolveParticipants(state, ids, boardCount, "primary",
      state.round === 2 || state.round === 4,
      state.round === 4 ? "GROUP_DECIDER" : undefined,
      state.round === 4));
  state.matches.push(...matches); state.roundResults = matches;
  if (state.round === 2) matches.forEach((match) => {
    const before = structuredClone(state); rewardMatchWithLedger(state, match, BALANCE.points.r2Primary.win);
    rewardAbilities(state, match); captureRewards(before, state, [match]);
  });
  if (state.round === 4) matches.forEach((match) => {
    const regulationWinners = match.regulationWinnerIds ?? match.winnerIds;
    const before = structuredClone(state);
    rewardMatchWithLedger(state, match, match.regulationWinnerIds ? BALANCE.points.r4Primary.split : BALANCE.points.r4Primary.win, regulationWinners);
    rewardAbilities(state, match); captureRewards(before, state, [match]);
  });
  state.winnerGroup = matches.flatMap((match) => match.winnerIds);
  state.loserGroup = matches.flatMap((match) => match.playerIds.filter((id) => !match.winnerIds.includes(id)));
  if (final) {
    matches[0]!.standingsBefore = pointSnapshot(state);
    rewardFinalPlacements(state, matches[0]!);
    rewardQuadCorePlacement(state, matches[0]!);
    rewardAbilities(state, matches[0]!);
    rewardAbilityInterest(state);
    state.phase = "GAME_RESULT";
    rewardRoundLeader(state, matches[0]!);
    captureRewards(source, state, matches);
    matches[0]!.standingsAfterRuns = [pointSnapshot(state)];
    state.phase = "GAME_RESULT"; log(state, "The Last Hand · 최종 점수 집계 완료", "win", { event: "FINAL_SCORE_COMPLETE" });
  }
  else if (state.round === 2 || state.round === 4) { state.phase = "GROUP_ASSIGNMENT"; log(state, `승자조 ${state.winnerGroup.length}명 · 패자조 ${state.loserGroup.length}명`, "info", { event: "BRACKETS_ASSIGNED", params: { winners: state.winnerGroup.length, survivors: state.loserGroup.length } }); }
  else {
    state.phase = "ROUND_RESULT";
    log(state, `R${state.round} 쇼다운 종료`, "win", { event: "SHOWDOWN_COMPLETE", params: { round: state.round } });
  }
  return state;
}

function pointSnapshot(state: PorenaGameState): Record<string, number> {
  return Object.fromEntries(state.players.filter((p) => !p.eliminated).map((p) => [p.id, p.points]));
}

/** R2: two matches against different opponents, each played as RUN 1 + RUN 2 with the same placement. */
function resolveSplitRuns(state: PorenaGameState, firstPairs: string[][]): PorenaGameState {
  const alive = firstPairs.flat();
  const records = Object.fromEntries(alive.map((id) => [id, emptySwissRecord()]));
  const history: string[][] = []; const all: MatchResult[] = [];
  for (const day of [1, 2] as const) {
    // Match 2 never repeats a match-1 opponent and pairs similar match-1 results, as R1/R3 Swiss does.
    const pairs = day === 1 ? firstPairs : swissPairs(shuffle(alive, () => nextRandom(state)), records, history);
    const matches = resolveRunMatches(state, pairs, { runs: 2, ...BALANCE.points.r2Run, sweepAfterForfeit: true });
    for (const match of matches) {
      match.matchday = day;
      for (const reward of match.rewards!) records[reward.playerId]!.score += reward.deltaPoints;
    }
    history.push(...pairs); all.push(...matches);
  }
  state.matches.push(...all); state.roundResults = all; state.phase = "ROUND_RESULT";
  rewardAbilityInterest(state);
  rewardRoundLeader(state);
  log(state, "R2 매치 2회(RUN 4번) 종료 · 전원 생존", "win", { event: "R2_RUNS_COMPLETE" }); return state;
}

/** R5: one match against the chosen pairing, played as RUN 1 + RUN 2 + RUN 3; then the lowest total leaves. */
function resolveTripleRuns(state: PorenaGameState, pairs: string[][]): PorenaGameState {
  const matches = resolveRunMatches(state, pairs, { ...TRIPLE_RUN, sweepAfterForfeit: false });
  state.matches.push(...matches); state.roundResults = matches; state.phase = "ROUND_RESULT";
  assignTripleRunElimination(state);
  for (const match of matches) for (const reward of [...match.rewards ?? [], ...match.runRewards?.at(-1) ?? []]) {
    if (playerById(state, reward.playerId).eliminated) reward.outcome = "ELIMINATED";
  }
  if (!state.survival) { rewardAbilityInterest(state); rewardRoundLeader(state); }
  log(state, "R5 RUN IT THREE TIMES 종료 · 누적 승점 최하위 탈락", "win", { event: "R5_RUNS_COMPLETE" });
  assertPoolIntegrity(state); return state;
}

/**
 * The lowest total leaves; equal points fall back to BB. A tie on both goes to SURVIVAL_READY, where
 * the tied seats replay their RUN 1, RUN 2 and RUN 3 hands on fresh boards, then draw a high card.
 */
function assignTripleRunElimination(state: PorenaGameState): void {
  const alive = state.players.filter((p) => !p.eliminated).sort((a, b) => a.points - b.points || a.stackBB - b.stackBB);
  const last = alive[0];
  if (!last || alive.length < 2) return;
  const tied = alive.filter((p) => p.points === last.points && p.stackBB === last.stackBB).map((p) => p.id);
  if (tied.length === 1) eliminate(state, tied);
  else state.survival = { playerIds: tied, eliminateCount: 1 };
}

type RunRules = { runs: number; win: number; split: number; sweepBonus: number;
  /** R2 pays the sweep even when the opponent forfeited; R5 pays only the RUN points then. */
  sweepAfterForfeit: boolean };

function resolveRunMatches(state: PorenaGameState, pairs: string[][], rules: RunRules): MatchResult[] {
  const { win, split, sweepBonus } = rules;
  const decks = pairs.map((ids) => encounterBoards(state, ids, rules.runs));
  const before = pointSnapshot(state);
  const runs: MatchResult[][] = Array.from({ length: rules.runs }, () => []); const snapshots: Record<string, number>[] = [];
  for (let run = 1; run <= rules.runs; run += 1) {
    pairs.forEach((ids, i) => {
      const match = resolveParticipants(state, ids, 1, "primary", false, undefined, false, run as 1 | 2 | 3, [decks[i]![run - 1]!]);
      if (match.winnerIds.length > 1) {
        const previous = structuredClone(state);
        match.pointAwards = Object.fromEntries(ids.map((id) => [id, split]));
        match.pointAwardDetails = Object.fromEntries(ids.map((id) => [id, `SPLIT · +${split}P · BB 0 · 연승/연패 초기화`]));
        for (const id of ids) { const p = playerById(state, id); p.points += split; p.winStreak = 0; p.loseStreak = 0; }
        rewardAbilities(state, match); captureRewards(previous, state, [match]);
      } else {
        const previous = structuredClone(state);
        rewardMatchWithLedger(state, match, win);
        rewardAbilities(state, match); captureRewards(previous, state, [match]);
      }
      const played = [...runs.slice(0, run - 1).map((matches) => matches[i]!), match];
      const winner = match.winnerIds.length === 1 ? match.winnerIds[0]! : undefined;
      const forfeitWin = played.some((item) => item.results.some((result) => result.playerId !== winner && result.hand.categoryRank === 0));
      const sweeper = run === rules.runs && winner && played.every((item) => item.winnerIds.length === 1 && item.winnerIds[0] === winner)
        && (rules.sweepAfterForfeit || !forfeitWin) ? winner : undefined;
      if (sweeper) {
        // Every RUN won outright: the bonus lands with the last RUN so its reward beat and standings include it.
        playerById(state, sweeper).points += sweepBonus;
        match.pointAwards![sweeper] = (match.pointAwards![sweeper] ?? 0) + sweepBonus;
        match.pointAwardDetails![sweeper] = `${match.pointAwardDetails![sweeper] ?? ""} · 완승 보너스 +${sweepBonus}P`;
        const reward = match.rewards!.find((r) => r.playerId === sweeper)!;
        reward.deltaPoints += sweepBonus; reward.afterPoints += sweepBonus;
      }
      runs[run - 1]!.push(match);
    });
    snapshots.push(pointSnapshot(state));
  }
  return pairs.map((ids, i) => {
    const played = runs.map((matches) => matches[i]!);
    const a = played[0]!; const b = played.at(-1)!;
    // Persist later RUN events against the combined match, retaining their run number.
    const laterIds = new Set(played.slice(1).map((match) => match.id));
    for (const event of state.abilityEvents ?? []) if (event.matchId && laterIds.has(event.matchId)) event.matchId = a.id;
    return { ...a, gameNumber: undefined, winnerIds: b.winnerIds, boards: played.flatMap((match) => match.boards),
      boardResults: played.flatMap((match) => match.boardResults), boardWinnerIds: played.flatMap((match) => match.boardWinnerIds),
      streetSnapshots: played.flatMap((match) => match.streetSnapshots!), results: b.results, runoutCount: rules.runs,
      runCards: Object.fromEntries(ids.map((id) => [id, played.map((match) => match.revealedCardIds[id]!)])),
      runRewards: played.map((match) => match.rewards!), standingsBefore: before, standingsAfterRuns: snapshots,
      pointAwards: Object.fromEntries(ids.map((id) => [id, played.reduce((sum, match) => sum + match.pointAwards![id]!, 0)])),
      rewards: a.rewards!.map((r) => {
        const end = b.rewards!.find((x) => x.playerId === r.playerId)!;
        const total = (key: "deltaBB" | "deltaPoints") => played.reduce((sum, match) => sum + match.rewards!.find((x) => x.playerId === r.playerId)![key], 0);
        return { ...r, afterBB: end.afterBB, afterPoints: end.afterPoints, deltaBB: total("deltaBB"), deltaPoints: total("deltaPoints"),
          detail: `${played.map((_, index) => `RUN${index + 1}`).join(" + ")} 합계` };
      }),
    } satisfies MatchResult;
  });
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

/**
 * Resolve only the tied boundary; never award points/BB. R3 never uses BB as a tie breaker; R5 reaches
 * this only after points and BB both tie, and its tied seats play their RUN 1, RUN 2 and RUN 3 hands.
 */
export function resolveSurvival(source: PorenaGameState): PorenaGameState {
  if (source.phase !== "SURVIVAL_READY" || !source.survival) throw new Error("생존 타이브레이크 단계가 아닙니다.");
  const state = structuredClone(source); const boundary = state.survival!;
  const previous = structuredClone(state);
  const allIds = boundary.playerIds;
  let tied = [...allIds]; let slots = allIds.length - boundary.eliminateCount;
  const survived: string[] = []; const eliminated: string[] = [];
  let combined: MatchResult | undefined;
  const runHands = isTripleRunRound(state.round, state);
  for (let attempt = 0; slots > 0 && tied.length; attempt++) {
    // The universe always excludes all original participants' owned cards.
    const board = encounterBoards(state, allIds, 1)[0]!;
    const run = runHands ? (attempt + 1) as 1 | 2 | 3 : undefined;
    const match = resolveParticipants(state, tied, 1, "secondary", false, "SURVIVAL_TIEBREAK", false, run, [board]);
    if (!combined) combined = { ...match, group: "loser", tiebreakKind: "SURVIVAL_TIEBREAK", tiebreakStartIndex: 1,
      ...(runHands ? { runCards: Object.fromEntries(allIds.map((id) => [id, []])) } : {}) };
    else { combined.boards.push(...match.boards); combined.boardResults.push(...match.boardResults); combined.boardWinnerIds.push(...match.boardWinnerIds); combined.streetSnapshots!.push(...match.streetSnapshots!); combined.suddenDeathCount++; }
    // Each tiebreak board shows the RUN hand it plays; seats already decided keep their last one.
    if (combined.runCards) for (const id of allIds) combined.runCards[id]!.push(match.revealedCardIds[id] ?? combined.runCards[id]!.at(-1) ?? []);
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
  const latestResult = new Map<string, PlayerShowdown>();
  for (const boardResult of combined.boardResults) for (const result of boardResult) latestResult.set(result.playerId, result);
  combined.results = allIds.map((playerId) => ({ ...latestResult.get(playerId)!, place: survived.includes(playerId) ? 1 : 2 }));
  eliminate(state, eliminated); delete state.survival;
  rewardAbilityInterest(state); captureRewards(previous, state, [combined]);
  state.matches.push(combined); state.roundResults = [combined];
  state.phase = "ROUND_RESULT"; rewardRoundLeader(state); assertPoolIntegrity(state); return state;
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
      hand: cards.length >= 5 ? findBestFive(cards) : cards.length ? evaluatePartial(cards) : forfeitHand(),
    };
    player.eliminated = true; player.eliminatedRound = state.round;
    releasePlayerCards(state, player);
    log(state, `${player.name} 탈락 · R${state.round} 핸드·스택 기록 후 점유 카드 전량 반환`, "danger", { event: "PLAYER_ELIMINATED", playerId: player.id, params: { player: player.name, round: state.round } });
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
  // R4 group matches are regular matches: pay match abilities from the regulation board, before
  // eliminations so a knocked-out seat's snapshot keeps them. Sudden-death boards still pay nothing.
  if (state.round === 4) for (const match of [...winnerMatches, ...loserMatches]) rewardAbilities(state, match);
  eliminate(state, loserMatches.flatMap((match) => match.playerIds.filter((id) => !match.winnerIds.includes(id))));
  rewardAbilityInterest(state);
  captureRewards(source, state, [...winnerMatches, ...loserMatches]);
  state.matches.push(...winnerMatches, ...loserMatches); state.roundResults = [...winnerMatches, ...loserMatches];
  state.phase = "ROUND_RESULT"; log(state, `R${state.round} 종료 · ${state.players.filter((player) => !player.eliminated).length}명 생존`, "win", { event: "ROUND_COMPLETE", params: { round: state.round, survivors: state.players.filter((player) => !player.eliminated).length } });
  rewardRoundLeader(state);
  assertPoolIntegrity(state); return state;
}

export function leaveRoundResult(source: PorenaGameState): PorenaGameState {
  const state = structuredClone(source); if (state.phase !== "ROUND_RESULT") throw new Error("라운드 결과 단계가 아닙니다.");
  if (state.survival) { state.phase = "SURVIVAL_READY"; return state; }
  state.phase = "NEXT_ROUND";
  return state;
}

export function startNextRound(source: PorenaGameState, now = Date.now()): PorenaGameState {
  const state = structuredClone(source); if (state.phase !== "NEXT_ROUND" || state.round >= lastRoundFor(state)) throw new Error("다음 라운드로 진행할 수 없습니다.");
  state.round = (state.round + 1) as Round; state.phase = "SHOP"; state.roundResults = []; state.winnerGroup = []; state.loserGroup = [];
  delete state.draft; delete state.survival; delete state.opponentSelect;
  if (state.round === 3) state.r3Seeds = seedOmaha(state);
  // Street snapshots exist only to drive the showdown cinematic for the round
  // being played. Final scoring reads roundResults and eliminationSnapshot, never
  // history, so past rounds drop the largest field in the persisted snapshot.
  for (const match of state.matches) delete match.streetSnapshots;
  for (const player of state.players.filter((item) => !item.eliminated)) {
    // Only the five-round final auction is played without new income.
    if (state.sixRounds || state.round !== 5) player.stackBB += BALANCE.roundIncomeBB;
    player.purchasesThisRound = 0; player.rerollsUsed = 0; player.selectedCardIds = [];
    player.loseStreak = 0; // loss BB escalates within a round only
    if (state.rulesVersion === 2 && (state.round === 2 || state.round === 4)) player.lockedShopCardIds = [];
    releaseShop(state, player);
  }
  if (state.round === 5 && !state.sixRounds) return beginFinalAuction(state, now);
  if (isAuctionRound(state.round, state)) {
    const available = state.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE");
    const cardIds = shuffle(available, () => nextRandom(state)).slice(0, R3_AUCTION.cardCount).map((entry) => entry.card.id);
    return beginCardAuction(state, now, cardIds);
  }
  if (isTripleRunRound(state.round, state)) { beginOpponentSelect(state); assertPoolIntegrity(state); return state; }
  if (state.rulesVersion === 2 && (state.round === 2 || state.round === 4)) {
    const count = state.round === 2 ? 8 : 16;
    const available = state.ownershipCardPool.filter((entry) => entry.state === "AVAILABLE");
    if (available.length < count) throw new Error("공개 드래프트 카드 풀이 부족합니다.");
    const order = draftOrder(state, state.players.filter((p) => !p.eliminated));
    state.draft = { cardIds: shuffle(available, () => nextRandom(state)).slice(0, count).map((entry) => entry.card.id), order, picks: [] };
    state.phase = "DRAFT_ORDER";
  } else for (const player of state.players.filter((p) => !p.eliminated)) reserveShopCards(state, player);
  assertPoolIntegrity(state); return state;
}

/** Fewest points pick first, then most BB; ties keep a shuffled order. First Class always picks first. */
function draftOrder(state: PorenaGameState, players: readonly PlayerState[]): { playerId: string; points: number; stackBB: number }[] {
  const shuffled = shuffle(players, () => nextRandom(state));
  // Preserve the shuffled tie order when freezing the order without First Class.
  const naturalOrder = [...shuffled].sort((a, b) => a.points - b.points || b.stackBB - a.stackBB);
  const firstClass = naturalOrder.find(player => player.abilityId === "first-class");
  if (firstClass) recordAbilityBenefit(state, firstClass, { reason: "draft-priority", bb: 0, points: 0, savedBB: 0, originalPosition: naturalOrder.indexOf(firstClass) + 1 });
  return shuffled.sort((a, b) => Number(b.abilityId === "first-class") - Number(a.abilityId === "first-class") || a.points - b.points || b.stackBB - a.stackBB)
    .map((p) => ({ playerId: p.id, points: p.points, stackBB: p.stackBB }));
}

/**
 * Six-round R3, after the auction result is shown: every seat that won nothing buys one unsold
 * auction card at double the base price, in draft order. With no such seat the Omaha matches start.
 */
export function finishCardAuctionReveal(source: PorenaGameState, now: number): PorenaGameState {
  const auction = source.finalAuction;
  if (source.phase !== "FINAL_AUCTION" || !auction || auction.settledAt === null || !isAuctionRound(source.round, source)) throw new Error("AUCTION_NOT_ENDED");
  if (now < (auction.loadoutStartsAt ?? auction.settledAt)) return source;
  const state = structuredClone(source);
  const winners = new Set(auction.results!.map((result) => result.playerId));
  const unsold = auction.cardIds.filter((id) => state.ownershipCardPool.find((entry) => entry.card.id === id)?.state === "AVAILABLE");
  const buyers = state.players.filter((p) => !p.eliminated && !winners.has(p.id) && p.ownedCardIds.length < handLimitFor(state.round, state));
  delete state.finalAuction;
  if (!buyers.length || !unsold.length) { state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); assertPoolIntegrity(state); return state; }
  state.draft = { cardIds: unsold, order: draftOrder(state, buyers), picks: [], priceMultiplier: R3_AUCTION.buybackMultiplier };
  state.phase = "DRAFT_ORDER";
  log(state, `낙찰 실패 ${buyers.length}명 · 남은 카드 2배 가격 구매`, "economy", { event: "AUCTION_BUYBACK_START", params: { players: buyers.length } });
  assertPoolIntegrity(state); return state;
}

/** Draft price: the buyback's fixed multiple of the base price, otherwise the seat's own price. */
export function draftPrice(state: PorenaGameState, playerId: string, cardId: string): number {
  const multiplier = state.draft?.priceMultiplier;
  return multiplier ? cardPrice(getCard(state, cardId).rank) * multiplier : getCardPrice(state, playerId, cardId);
}

/** Six-round R5 opens with the standings leader choosing an opponent from the other survivors. */
function beginOpponentSelect(state: PorenaGameState): void {
  const seats = new Map(state.players.map((player, index) => [player.id, index]));
  const order = state.players.filter((p) => !p.eliminated)
    .sort((a, b) => compareRoundStanding({ ...a, playerId: a.id }, { ...b, playerId: b.id }, seats)).map((p) => p.id);
  state.opponentSelect = { order, chooserId: order[0]! };
  state.phase = "OPPONENT_SELECT";
  log(state, `R5 매칭 · ${playerById(state, order[0]!).name}이 상대를 선택`, "info", { event: "OPPONENT_SELECT_START", playerId: order[0], params: { player: playerById(state, order[0]!).name } });
}

/** True while the chosen pairing stays on screen before the shop opens. */
export const isOpponentRevealing = (state: Pick<PorenaGameState, "phase" | "opponentSelect">) =>
  state.phase === "OPPONENT_SELECT" && !!state.opponentSelect?.opponentId;

export function chooseOpponent(source: PorenaGameState, playerId: string, opponentId: string): PorenaGameState {
  const pick = source.opponentSelect;
  if (source.phase !== "OPPONENT_SELECT" || !pick || pick.opponentId) throw new Error("상대 선택 단계가 아닙니다.");
  if (pick.chooserId !== playerId) throw new Error("1위 플레이어만 상대를 선택할 수 있습니다.");
  if (opponentId === playerId || !pick.order.includes(opponentId)) throw new Error("선택할 수 없는 상대입니다.");
  const state = structuredClone(source);
  state.opponentSelect!.opponentId = opponentId;
  log(state, `${playerById(state, playerId).name} → ${playerById(state, opponentId).name} 매칭 선택`, "info", { event: "OPPONENT_CHOSEN", playerId, params: { player: playerById(state, playerId).name, opponent: playerById(state, opponentId).name } });
  return state;
}

/** Timeout and bot choice: the lowest-ranked survivor. */
export function autoChooseOpponent(source: PorenaGameState): PorenaGameState {
  const pick = source.opponentSelect;
  if (!pick) throw new Error("상대 선택 단계가 아닙니다.");
  return chooseOpponent(source, pick.chooserId, pick.order.at(-1)!);
}

/** Ends the pairing reveal and opens the R5 shop. */
export function completeOpponentSelect(source: PorenaGameState): PorenaGameState {
  if (!isOpponentRevealing(source)) throw new Error("상대 선택이 끝나지 않았습니다.");
  const state = structuredClone(source);
  state.phase = "SHOP";
  for (const player of state.players.filter((p) => !p.eliminated)) reserveShopCards(state, player);
  assertPoolIntegrity(state); return state;
}

export function openDraft(source: PorenaGameState): PorenaGameState {
  // Idempotence keeps reconnect and preview callers safe after the synchronized deal-in.
  if (source.phase === "OPEN_DRAFT" && source.draft) return structuredClone(source);
  if (source.phase !== "DRAFT_ORDER" || !source.draft) throw new Error("드래프트 순서 공개 단계가 아닙니다.");
  return { ...structuredClone(source), phase: "OPEN_DRAFT" };
}

/**
 * `holdReveal`: after the last pick the phase stays OPEN_DRAFT (every pick visible) until `completeDraft`.
 * The room and the local game pass it so players can see the final picks before the next phase.
 */
export function pickDraftCard(source: PorenaGameState, playerId: string, cardId: string, holdReveal = false): PorenaGameState {
  const state = structuredClone(source); const draft = state.draft;
  if (state.phase !== "OPEN_DRAFT" || !draft || draft.order[draft.picks.length]?.playerId !== playerId) throw new Error("내 드래프트 차례가 아닙니다.");
  const player = playerById(state, playerId);
  const entry = state.ownershipCardPool.find((e) => e.card.id === cardId);
  if (!draft.cardIds.includes(cardId) || !entry || entry.state !== "AVAILABLE") throw new Error("선택할 수 없는 카드입니다.");
  const price = draftPrice(state, playerId, cardId);
  if (player.stackBB < price) throw new Error("BB가 부족합니다.");
  // Previous-round forfeits may enter with fewer cards. Draft still grants only one paid card.
  if (player.ownedCardIds.length >= handLimitFor(state.round, state)) throw new Error("드래프트 보유 장수가 올바르지 않습니다.");
  player.stackBB -= price; player.ownedCardIds.push(cardId);
  recordAbilitySaving(state, player, "draft-discount", cardPrice(entry.card.rank) - price, cardId);
  entry.state = "OWNED"; entry.ownerPlayerId = playerId;
  draft.picks.push({ playerId, cardId, price });
  if (!holdReveal) finishDraftIfComplete(state);
  assertPoolIntegrity(state); return state;
}

export function autoPickDraft(source: PorenaGameState, holdReveal = false): PorenaGameState {
  const id = source.draft?.order[source.draft.picks.length]?.playerId;
  if (!id) throw new Error("드래프트 차례가 없습니다.");
  const p = playerById(source, id);
  const options = source.draft!.cardIds.filter((cardId) => source.ownershipCardPool.find((e) => e.card.id === cardId)?.state === "AVAILABLE")
    .map((cardId) => ({ card: getCard(source, cardId), price: draftPrice(source, id, cardId) })).filter((o) => o.price <= p.stackBB);
  // The R3 buyback offers up to fifteen cards at once; a sampled Omaha plan for each would stall the room.
  const best = source.draft!.priceMultiplier ? rankBuybackOptions(cardsFor(source, p.ownedCardIds), options)[0]
    : rankBotPurchases(source.round, p, cardsFor(source, p.ownedCardIds), options, { rulesVersion: source.rulesVersion ?? 2, sixRounds: !!source.sixRounds })[0];
  if (!best) {
    const state = structuredClone(source);
    state.draft!.picks.push({ playerId: id, cardId: null, price: 0 });
    log(state, `${p.name} · BB 부족으로 드래프트 구매 없이 진행`, "danger", { event: "DRAFT_SKIPPED_INSUFFICIENT_BB", playerId: p.id, params: { player: p.name } });
    if (!holdReveal) finishDraftIfComplete(state);
    assertPoolIntegrity(state); return state;
  }
  return pickDraftCard(source, id, best.card.id, holdReveal);
}

/** True while a finished open draft is held on screen so every player can see the final picks. */
export const isDraftRevealing = (state: Pick<PorenaGameState, "phase" | "draft">) =>
  state.phase === "OPEN_DRAFT" && !!state.draft && state.draft.picks.length === state.draft.order.length;

/** Ends a draft held with `holdReveal`: R2 goes to RUN placement, the R3 buyback to the matches, R4 to the shop. */
export function completeDraft(source: PorenaGameState): PorenaGameState {
  if (!isDraftRevealing(source)) throw new Error("드래프트 선택이 끝나지 않았습니다.");
  const state = structuredClone(source);
  finishDraftIfComplete(state);
  assertPoolIntegrity(state); return state;
}

function finishDraftIfComplete(state: PorenaGameState): void {
  if (state.draft!.picks.length !== state.draft!.order.length) return;
  if (isAuctionRound(state.round, state)) { state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); return; }
  state.phase = state.round === 2 ? "RUN_LOADOUT" : "SHOP";
  // Pre-fill the recommended RUN order so the screen shows exactly what Ready locks in.
  if (state.round === 2) for (const p of state.players.filter((p) => !p.eliminated && p.ownedCardIds.length === 3)) p.selectedCardIds = bestRunLoadout(p, cardsFor(state, p.ownedCardIds));
  if (state.round === 4) for (const p of state.players.filter((p) => !p.eliminated)) reserveShopCards(state, p);
}

/** Cards a placement orders: R2 three, R5 six, the R6 lineup five. */
export const runLoadoutSize = (state: Pick<PorenaGameState, "round" | "sixRounds">) => isTripleRunRound(state.round, state) ? TRIPLE_RUN.runs * 2
  : isLineupFinal(state.round, state) ? FINAL_LOADOUT_SIZE : 3;

/** Ordered identities. R2: [anchor, run-one secondary, run-two secondary]. R5: RUN 1, RUN 1, RUN 2, RUN 2, RUN 3, RUN 3. */
export function setRunLoadout(source: PorenaGameState, playerId: string, cardIds: string[]): PorenaGameState {
  if (source.phase !== "RUN_LOADOUT") throw new Error("RUN 구성은 시작 전에만 변경할 수 있습니다.");
  const state = structuredClone(source); const p = playerById(state, playerId);
  const size = runLoadoutSize(state);
  if (p.eliminated || cardIds.length !== size || new Set(cardIds).size !== size || cardIds.some((id) => !p.ownedCardIds.includes(id))) throw new Error(`보유한 서로 다른 카드 ${size}장을 배치하세요.`);
  p.selectedCardIds = [...cardIds]; return state;
}

export function lockRunLoadouts(source: PorenaGameState, humanIds: readonly string[] = ["p1"]): PorenaGameState {
  if (source.phase !== "RUN_LOADOUT") throw new Error("RUN 배치 단계가 아닙니다.");
  const state = structuredClone(source);
  if (isLineupFinal(state.round, state)) {
    // A human keeps a valid lineup (the pre-selected five unless they changed it); bots play the default.
    for (const p of state.players.filter((p) => !p.eliminated)) if (!humanIds.includes(p.id) || !validLineup(p)) p.selectedCardIds = defaultLineup(state, p);
    state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); return state;
  }
  if (isTripleRunRound(state.round, state)) {
    const size = runLoadoutSize(state);
    for (const p of state.players.filter((p) => !p.eliminated)) {
      // A short hand forfeits every RUN; nothing is fabricated for it.
      if (p.ownedCardIds.length < size) { p.selectedCardIds = [...p.ownedCardIds]; continue; }
      const complete = p.selectedCardIds.length === size && new Set(p.selectedCardIds).size === size && p.selectedCardIds.every((id) => p.ownedCardIds.includes(id));
      if (!humanIds.includes(p.id) || !complete) p.selectedCardIds = bestTripleRunLoadout(p, cardsFor(state, p.ownedCardIds));
    }
    state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); return state;
  }
  for (const p of state.players.filter((p) => !p.eliminated)) {
    if (p.ownedCardIds.length < 3) {
      p.selectedCardIds = [...p.ownedCardIds];
      continue; // No fabricated cards: both runs will resolve as forfeits.
    }
    if (p.ownedCardIds.length > 3) throw new Error("R2 보유 카드 3장이 필요합니다.");
    const valid = [...new Set(p.selectedCardIds)].filter((id) => p.ownedCardIds.includes(id));
    // Bots always solve for the anchor. A human who placed nothing gets the same
    // solve rather than owned order; a partial placement stays their own.
    if (!humanIds.includes(p.id) || !valid.length) p.selectedCardIds = bestRunLoadout(p, cardsFor(state, p.ownedCardIds));
    else p.selectedCardIds = [...valid, ...p.ownedCardIds.filter((id) => !valid.includes(id))];
  }
  state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); return state;
}

export function finalStandings(state: PorenaGameState) {
  const rankPoints = [8, 4, 2, 0, -1, -2, -4, -8] as const;
  const rows = state.players.map((player) => {
    const final = state.roundResults[0]?.results.find((result) => result.playerId === player.id);
    const hand = final?.hand ?? player.eliminationSnapshot?.hand;
    const points = player.eliminationSnapshot?.points ?? player.points;
    const stackBB = player.eliminationSnapshot?.stackBB ?? player.stackBB;
    const handScore = hand ? BALANCE.handScores[hand.category] : 0;
    const stackScore = Math.floor(stackBB / BALANCE.stackScoreUnitBB);
    const lastMatch = [...state.matches].reverse().find((match) => match.revealedCardIds[player.id]?.length);
    // A seat knocked out in R5 shows every RUN hand it played, not just RUN 1.
    const cardIds = player.ownedCardIds.length ? player.ownedCardIds : (lastMatch?.runCards?.[player.id] ? [...new Set(lastMatch.runCards[player.id]!.flat())] : lastMatch?.revealedCardIds[player.id]);
    const lineup = final && isLineupFinal(state.round, state) ? playedCardIds(state, player) : undefined;
    const cards = lineup ? cardsFor(state, [...lineup, ...player.ownedCardIds.filter((id) => !lineup.includes(id))])
      : state.finalAuction && final ? hand?.bestFive ?? [] : cardIds ? cardsFor(state, cardIds) : hand?.bestFive ?? [];
    return { playerId: player.id, points, handScore, stackScore, total: points + handScore + stackScore, hand,
      cards, usedCardIds: lineup ?? hand?.bestFive.map((card) => card.id) ?? [],
      finalPlace: final?.place ?? Infinity, eliminatedRound: player.eliminatedRound, stackBB };
  }).sort((a, b) => {
    const aEliminated = a.eliminatedRound !== undefined;
    const bEliminated = b.eliminatedRound !== undefined;
    // Finalists always occupy the top places. Eliminated players are frozen into the band for the
    // round in which they left: five rounds R4 -> 5th/6th, R3 -> 7th/8th; six rounds R5 -> 4th.
    if (aEliminated !== bEliminated) return aEliminated ? 1 : -1;
    if (aEliminated && bEliminated) {
      return b.eliminatedRound! - a.eliminatedRound!
        || b.points - a.points
        || a.playerId.localeCompare(b.playerId);
    }
    // A tied final score is decided by final-round placement, not by comparing cards again.
    // Keep a stable display order if those placements are tied as well.
    return b.total - a.total || a.finalPlace - b.finalPlace
      || a.playerId.localeCompare(b.playerId);
  });
  return rows.map((row, index) => ({ ...row, placement: index + 1, rankPoints: rankPoints[index]! }));
}

export function getCard(state: PorenaGameState, id: string): Card { return state.ownershipCardPool.find((entry) => entry.card.id === id)!.card; }
/** Completes decisions together; no future board exists until resolvePrimary. */
export function finishFinalLoadouts(source: PorenaGameState, now: number, humanIds: readonly string[] = ["p1"]): PorenaGameState {
  const auction = source.finalAuction;
  if (source.phase !== "FINAL_LOADOUT" || !auction || now < auction.loadoutStartsAt!) return source;
  const state = structuredClone(source), a = state.finalAuction!;
  const players = state.players.filter(p => !p.eliminated);
  for (const p of players) if (!p.finalLoadoutLocked && (!humanIds.includes(p.id) || now >= a.loadoutEndsAt!)) {
    p.finalLoadoutCardIds = bestFinalLoadout(p.ownedCardIds.map(id => getCard(state, id)), a.originalCardIds[p.id] ?? []);
    p.finalLoadoutLocked = true;
  }
  if (!players.every(p => p.finalLoadoutLocked)) return state;
  a.loadoutsRevealed = true;
  const equities = finalFourWayEquity(players.map(p => p.finalLoadoutCardIds!.map(id => getCard(state, id))), players.flatMap(p => p.ownedCardIds.map(id => getCard(state, id))));
  a.equities = Object.fromEntries(players.map((p, i) => [p.id, equities[i]!]));
  state.phase = "SHOWDOWN_PRIMARY"; freezePrimaryPairings(state); return state;
}
export function getCardPrice(state: PorenaGameState, playerId: string, cardId: string): number { return abilityPrice(playerById(state, playerId), getCard(state, cardId).rank); }
