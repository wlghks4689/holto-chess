import {
  autoChooseOpponent, autoPickDraft, beginSecondary, completeDraft, completeOpponentSelect, finishAbilitySelection,
  finishCardAuctionReveal, finishFinalLoadouts, isDraftRevealing, isOpponentRevealing, leaveRoundResult, lockRunLoadouts, finishAbilityDeal,
  openDraft, prepareShowdown, resolvePrimary, resolveSecondary, resolveSurvival, startNextRound,
} from "../game/engine";
import { settleFinalAuction } from "../game/finalAuction";
import { tickAuctionBots } from "../game/finalAuctionBot";
import type { PorenaGameState, Round } from "../game/types";

/**
 * Development only (`?devRound=N`): the bot brain plays every seat, including the viewer's, through
 * the real engine until round N opens, so a later round's screens can be checked without replaying.
 */
export function fastForwardToRound(start: PorenaGameState, round: Round): PorenaGameState {
  let state = start;
  for (let guard = 0; guard < 400 && state.round < round && state.phase !== "GAME_RESULT"; guard += 1) {
    switch (state.phase) {
      case "ABILITY_DEAL": state = finishAbilityDeal(state); break;
      case "ABILITY_REVEAL": state = finishAbilitySelection(state); break;
      case "SHOP": state = prepareShowdown(state, []); break;
      case "DRAFT_ORDER": state = openDraft(state); break;
      case "OPEN_DRAFT": state = isDraftRevealing(state) ? completeDraft(state) : autoPickDraft(state, true); break;
      case "FINAL_AUCTION": {
        const auction = state.finalAuction!;
        if (auction.settledAt !== null) { state = finishCardAuctionReveal(state, auction.loadoutStartsAt ?? auction.settledAt); break; }
        // Late bids extend endsAt, so read it from the current state each tick.
        for (let now = auction.startedAt; now < state.finalAuction!.endsAt; now += 1_000) state = tickAuctionBots(state, [], now);
        state = settleFinalAuction(state, state.finalAuction!.endsAt); break;
      }
      case "FINAL_LOADOUT": state = finishFinalLoadouts(state, state.finalAuction!.loadoutEndsAt!, []); break;
      case "OPPONENT_SELECT": state = isOpponentRevealing(state) ? completeOpponentSelect(state) : autoChooseOpponent(state); break;
      case "RUN_LOADOUT": state = lockRunLoadouts(state, []); break;
      case "SHOWDOWN_PRIMARY": state = resolvePrimary(state); break;
      case "GROUP_ASSIGNMENT": state = beginSecondary(state); break;
      case "SHOWDOWN_SECONDARY": state = resolveSecondary(state); break;
      case "SURVIVAL_READY": state = resolveSurvival(state); break;
      case "ROUND_RESULT": state = leaveRoundResult(state); break;
      // Timed rounds start on the real clock once the screen opens.
      case "NEXT_ROUND": state = startNextRound(state, Date.now()); break;
      default: return state;
    }
  }
  return state;
}
