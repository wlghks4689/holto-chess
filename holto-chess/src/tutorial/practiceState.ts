import { bestBotSelection, bestRunLoadout } from "../game/botStrategy";
import { BALANCE, handLimitFor, isAuctionRound, isLineupFinal, isTripleRunRound, purchaseLimitFor, rerollLimitFor } from "../game/config";
import {
  autoChooseOpponent, autoPickDraft, beginSecondary, buyCard, completeOpponentSelect, confirmSelection, createGame, finishCardAuctionReveal, getCard, getCardPrice,
  isOpponentRevealing, leaveRoundResult, lockRunLoadouts, openDraft, prepareShowdown, resolvePrimary, resolveSecondary, resolveSurvival,
  setRunLoadout, startNextRound, toggleSelectedCard,
} from "../game/engine";
import type { PorenaGameState, Round } from "../game/types";
import { tutorialBotPolicy } from "./tutorialBots";
import { settleFinalAuction } from "../game/finalAuction";
import { tickAuctionBots } from "../game/finalAuctionBot";
import { finishFinalLoadouts } from "../game/engine";

/** Phase a round opens on, so the autopilot knows where a chapter begins. */
export function roundEntryPhase(round: Round, sixRounds = true): "SHOP" | "DRAFT_ORDER" | "FINAL_AUCTION" | "OPPONENT_SELECT" {
  if (sixRounds) return round === 3 ? "FINAL_AUCTION" : round === 5 ? "OPPONENT_SELECT" : round === 2 || round === 4 ? "DRAFT_ORDER" : "SHOP";
  return round === 5 ? "FINAL_AUCTION" : round === 2 || round === 4 ? "DRAFT_ORDER" : "SHOP";
}

/** The practice seat shops like a practice bot: legal, simple, and never given anything extra. */
function autoShop(source: PorenaGameState): PorenaGameState {
  let state = source;
  const me = () => state.players[0]!;
  for (let step = 0; step < 12; step += 1) {
    const player = me();
    if (player.eliminated || player.ownedCardIds.length >= handLimitFor(state.round, state)) break;
    const action = tutorialBotPolicy({
      round: state.round, playerId: player.id, stackBB: player.stackBB, handLimit: handLimitFor(state.round, state),
      purchasesLeft: purchaseLimitFor(state.round, state) - player.purchasesThisRound,
      rerollsLeft: rerollLimitFor(state.round, state) - (player.rerollsUsed ?? 0),
      rerollCost: BALANCE.rerollCostBB,
      ownedCards: player.ownedCardIds.map((id) => getCard(state, id)),
      shopCards: player.shopCardIds.map((id) => ({ card: getCard(state, id), price: getCardPrice(state, player.id, id) })),
    });
    if (action.type !== "BUY") break;
    state = buyCard(state, player.id, action.cardId);
  }
  return state;
}

/** One engine step for whatever phase the practice game is sitting in. */
export function autoStep(source: PorenaGameState): PorenaGameState {
  const me = source.players[0]!;
  switch (source.phase) {
    case "FINAL_AUCTION": {
      const auction = source.finalAuction!;
      if (auction.settledAt !== null) return finishCardAuctionReveal(source, auction.loadoutStartsAt ?? auction.settledAt);
      // The R3 auction is played out like a real one, the practice seat bidding like a bot; the R5 practice auction settles as it stands.
      let state = source;
      // Late bids extend endsAt, so read it from the current state each tick.
      if (isAuctionRound(state.round, state)) for (let now = auction.startedAt; now < state.finalAuction!.endsAt; now += 1_000) state = tickAuctionBots(state, [], now);
      return settleFinalAuction(state, state.finalAuction!.endsAt);
    }
    case "OPPONENT_SELECT": return isOpponentRevealing(source) ? completeOpponentSelect(source) : autoChooseOpponent(source);
    case "FINAL_LOADOUT": return finishFinalLoadouts(source, source.finalAuction!.loadoutEndsAt!, []);
    case "SHOP": return prepareShowdown(autoShop(source), ["p1"], tutorialBotPolicy);
    case "DECK_SELECT": {
      let state = source;
      for (const id of bestBotSelection(state.round, me.ownedCardIds.map((cardId) => getCard(state, cardId)))) state = toggleSelectedCard(state, "p1", id);
      return confirmSelection(state);
    }
    case "DRAFT_ORDER": return openDraft(source);
    case "OPEN_DRAFT": return autoPickDraft(source);
    // R5 arrives with the recommended split already placed; R2 solves its anchor here.
    case "RUN_LOADOUT": return lockRunLoadouts(me.eliminated || isTripleRunRound(source.round, source) || isLineupFinal(source.round, source) ? source : setRunLoadout(source, "p1", bestRunLoadout(me, me.ownedCardIds.map((id) => getCard(source, id)))));
    case "SHOWDOWN_PRIMARY": return resolvePrimary(source);
    case "GROUP_ASSIGNMENT": return beginSecondary(source);
    case "SHOWDOWN_SECONDARY": return resolveSecondary(source);
    case "SURVIVAL_READY": return resolveSurvival(source);
    case "ROUND_RESULT": return leaveRoundResult(source);
    case "NEXT_ROUND": return startNextRound(source);
    default: throw new Error(`연습 상태를 만들 수 없는 단계입니다: ${source.phase}`);
  }
}

/**
 * Builds the practice hand a later chapter starts from by actually playing the earlier rounds with
 * the real engine and the practice bots. Nothing is hand-placed: the ledger, BB and shop reservations
 * are whatever the rules produced, so a chapter can be entered directly without faking a game.
 */
export function practiceState(seed: number, round: Round, sixRounds = true): PorenaGameState {
  let state = createGame(seed, "seeded", 2, false, sixRounds);
  const entry = roundEntryPhase(round, sixRounds);
  for (let step = 0; step < 400 && !(state.round === round && state.phase === entry); step += 1) {
    if (state.round > round || state.phase === "GAME_RESULT") throw new Error(`R${round} 연습 상태를 만들지 못했습니다.`);
    state = autoStep(state);
  }
  if (state.round !== round || state.phase !== entry) throw new Error(`R${round} 연습 상태를 만들지 못했습니다.`);
  return state;
}
