import { makeDeck } from "../core/poker/cards";
import type { HoltoChessGameState, PlayerState, PoolCard } from "./types";

export function createOwnershipPool(): PoolCard[] {
  return makeDeck().map((card) => ({ card, state: "AVAILABLE" }));
}

export function assertPoolIntegrity(state: HoltoChessGameState): true {
  if (state.ownershipCardPool.length !== 52) throw new Error("Card pool must contain exactly 52 entries");
  const ids = new Set(state.ownershipCardPool.map((entry) => entry.card.id));
  if (ids.size !== 52) throw new Error("Card pool contains duplicate card ids");
  const players = new Map(state.players.map((player) => [player.id, player]));
  for (const entry of state.ownershipCardPool) {
    if (entry.state === "AVAILABLE" && (entry.ownerPlayerId || entry.reservedPlayerId)) throw new Error(`${entry.card.id} has dangling ownership`);
    if (entry.state === "OWNED") {
      const owner = entry.ownerPlayerId && players.get(entry.ownerPlayerId);
      if (!owner || !owner.ownedCardIds.includes(entry.card.id) || entry.reservedPlayerId) throw new Error(`${entry.card.id} owned state mismatch`);
    }
    if (entry.state === "RESERVED_IN_SHOP") {
      const reserver = entry.reservedPlayerId && players.get(entry.reservedPlayerId);
      if (!reserver || !reserver.shopCardIds.includes(entry.card.id) || entry.ownerPlayerId) throw new Error(`${entry.card.id} reservation mismatch`);
    }
  }
  return true;
}

export function releasePlayerCards(state: HoltoChessGameState, player: PlayerState): void {
  for (const id of [...player.ownedCardIds, ...player.shopCardIds]) {
    const entry = state.ownershipCardPool.find((item) => item.card.id === id)!;
    entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId;
  }
  player.ownedCardIds = []; player.shopCardIds = []; player.selectedCardIds = [];
}
