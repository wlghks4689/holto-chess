import { bestBotSelection, bestRunLoadout } from "../game/botStrategy";
import { BALANCE, purchaseLimitFor, rerollLimitFor } from "../game/config";
import {
  autoPickDraft, beginSecondary, buyCard, confirmSelection, createGame, getCard, getCardPrice,
  leaveRoundResult, lockRunLoadouts, openDraft, prepareShowdown, resolvePrimary, resolveSecondary, resolveSurvival,
  setRunLoadout, startNextRound, toggleSelectedCard,
} from "../game/engine";
import type { PorenaGameState, Round } from "../game/types";
import { tutorialBotPolicy } from "./tutorialBots";

/** Phase a round opens on, so the autopilot knows where a chapter begins. */
export function roundEntryPhase(round: Round): "SHOP" | "DRAFT_ORDER" {
  return round === 2 || round === 4 ? "DRAFT_ORDER" : "SHOP";
}

/** The practice seat shops like a practice bot: legal, simple, and never given anything extra. */
function autoShop(source: PorenaGameState): PorenaGameState {
  let state = source;
  const me = () => state.players[0]!;
  for (let step = 0; step < 12; step += 1) {
    const player = me();
    if (player.eliminated || player.ownedCardIds.length >= BALANCE.handLimits[state.round]) break;
    const action = tutorialBotPolicy({
      round: state.round, playerId: player.id, stackBB: player.stackBB, handLimit: BALANCE.handLimits[state.round],
      purchasesLeft: purchaseLimitFor(state.round, state.rulesVersion ?? 1) - player.purchasesThisRound,
      rerollsLeft: rerollLimitFor(state.round, state.rulesVersion ?? 1) - (player.rerollsUsed ?? 0),
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
    case "SHOP": return prepareShowdown(autoShop(source), ["p1"], tutorialBotPolicy);
    case "DECK_SELECT": {
      let state = source;
      for (const id of bestBotSelection(state.round, me.ownedCardIds.map((cardId) => getCard(state, cardId)))) state = toggleSelectedCard(state, "p1", id);
      return confirmSelection(state);
    }
    case "DRAFT_ORDER": return openDraft(source);
    case "OPEN_DRAFT": return autoPickDraft(source);
    case "RUN_LOADOUT": return lockRunLoadouts(me.eliminated ? source : setRunLoadout(source, "p1", bestRunLoadout(me, me.ownedCardIds.map((id) => getCard(source, id)))));
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
export function practiceState(seed: number, round: Round): PorenaGameState {
  let state = createGame(seed);
  const entry = roundEntryPhase(round);
  for (let step = 0; step < 400 && !(state.round === round && state.phase === entry); step += 1) {
    if (state.round > round || state.phase === "GAME_RESULT") throw new Error(`R${round} 연습 상태를 만들지 못했습니다.`);
    state = autoStep(state);
  }
  if (state.round !== round || state.phase !== entry) throw new Error(`R${round} 연습 상태를 만들지 못했습니다.`);
  return state;
}
