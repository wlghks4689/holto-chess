import type { PorenaGameState, Round } from "../game/types";
import type { GameAction, PlayerView } from "../shared/protocol";
import {
  autoChooseOpponent, autoPickDraft, beginSecondary, buyCard, chooseOpponent, completeDraft, completeOpponentSelect,
  completeR2Briefing, confirmSelection, finishAbilityDeal, finishAbilitySelection, finishCardAuctionReveal,
  finishFinalLoadouts, isDraftRevealing, isOpponentRevealing, leaveRoundResult, lockRunLoadouts, openDraft,
  pickDraftCard, prepareShowdown, rerollShop, resolvePrimary, resolveSecondary, resolveSurvival, sellCard,
  setRunLoadout, toggleSelectedCard, toggleShopLock,
} from "../game/engine";
import { bidFinalAuction, setFinalLoadout, settleFinalAuction } from "../game/finalAuction";
import { tickAuctionBots } from "../game/finalAuctionBot";
import { createPlayerView } from "../game/playerView";
import { advanceLocalNextRound } from "./localRoundTransition";
import { fastForwardToRound } from "./devFastForward";

/** Serializable local commands; never send callbacks or execute game mutations during React rendering. */
export type LocalGameCommand =
  | Extract<GameAction, { type: "BUY_CARD" | "SELL_CARD" | "REROLL" | "LOCK_SHOP" | "DRAFT_PICK" | "CHOOSE_OPPONENT" | "RUN_LOADOUT" | "FINAL_AUCTION_BID" | "FINAL_LOADOUT" | "LOCK_FINAL_LOADOUT" }>
  | { type: "ADVANCE" }
  | { type: "TOGGLE_SELECTED_CARD"; cardId: string }
  | { type: "AUCTION_TICK" }
  | { type: "DEV_ROUND"; round: Round };

export type LocalGameSnapshot = { game: PorenaGameState; view: PlayerView };
/** A timer/click from the previous screen must never operate on the next turn. */
export function localGameStep(game: PorenaGameState): string {
  return `${game.round}:${game.phase}:${game.draft?.picks.length ?? 0}:${game.opponentSelect?.opponentId ?? ""}:${game.encounterSequence}`;
}
export function localGameSnapshot(game: PorenaGameState): LocalGameSnapshot {
  // This projection can compute final equity. It belongs in the game worker too.
  const view = createPlayerView({ schema: 1, roomId: "LOCAL", revision: 0, status: "PLAYING", game,
    sessions: [{ playerId: "p1", tokenHash: "local", requests: [] }], readyIds: [], endedShopIds: [] }, "p1");
  return { game, view };
}

function advance(state: PorenaGameState): PorenaGameState {
  switch (state.phase) {
    case "ABILITY_DEAL": return finishAbilityDeal(state);
    case "ABILITY_REVEAL": return finishAbilitySelection(state);
    case "SHOP": return prepareShowdown(state);
    case "DECK_SELECT": return confirmSelection(state);
    case "DRAFT_ORDER": return openDraft(state);
    case "OPEN_DRAFT": return isDraftRevealing(state) ? completeDraft(state) : autoPickDraft(state, true);
    case "OPPONENT_SELECT": return isOpponentRevealing(state) ? completeOpponentSelect(state) : autoChooseOpponent(state);
    case "RUN_LOADOUT": return lockRunLoadouts(state);
    case "R2_BRIEFING": return completeR2Briefing(state);
    case "SHOWDOWN_PRIMARY": return resolvePrimary(state);
    case "GROUP_ASSIGNMENT": return beginSecondary(state);
    case "SHOWDOWN_SECONDARY": return resolveSecondary(state);
    case "SURVIVAL_READY": return resolveSurvival(state);
    case "ROUND_RESULT": return leaveRoundResult(state);
    default: return state;
  }
}

/** Same engine and RNG as before; only its execution thread changes. */
export function applyLocalGameCommand(source: PorenaGameState, command: LocalGameCommand, now = Date.now()): PorenaGameState {
  let next = source;
  switch (command.type) {
    case "ADVANCE": next = advance(source); break;
    case "BUY_CARD": next = buyCard(source, "p1", command.cardId); break;
    case "SELL_CARD": next = sellCard(source, "p1", command.cardId); break;
    case "REROLL": next = rerollShop(source, "p1"); break;
    case "LOCK_SHOP": next = toggleShopLock(source, "p1", command.cardId); break;
    case "TOGGLE_SELECTED_CARD": next = toggleSelectedCard(source, "p1", command.cardId); break;
    case "DRAFT_PICK": next = pickDraftCard(source, "p1", command.cardId, true); break;
    case "CHOOSE_OPPONENT": next = chooseOpponent(source, "p1", command.playerId); break;
    case "RUN_LOADOUT": next = setRunLoadout(source, "p1", command.cardIds); break;
    case "FINAL_AUCTION_BID": next = bidFinalAuction(source, "p1", command, now); break;
    case "FINAL_LOADOUT": next = setFinalLoadout(source, "p1", command.cardIds, now); break;
    case "LOCK_FINAL_LOADOUT": next = finishFinalLoadouts(setFinalLoadout(source, "p1", source.players[0]!.finalLoadoutCardIds ?? [], now, true), now); break;
    case "AUCTION_TICK": {
      if (source.phase === "FINAL_AUCTION") {
        const auction = source.finalAuction!;
        if (auction.settledAt !== null) next = now >= (auction.loadoutStartsAt ?? auction.settledAt) ? finishCardAuctionReveal(source, now) : source;
        else if (now < auction.endsAt) next = tickAuctionBots(source, ["p1"], now);
        else { next = settleFinalAuction(source, now); if (next.phase === "FINAL_LOADOUT") next = finishFinalLoadouts(next, now); }
      } else if (source.phase === "FINAL_LOADOUT") next = finishFinalLoadouts(source, now);
      break;
    }
    case "DEV_ROUND": next = fastForwardToRound(source, command.round); break;
  }
  return advanceLocalNextRound(next);
}
