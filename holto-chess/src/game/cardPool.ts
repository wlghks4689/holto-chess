import { makeDeck } from "../core/poker/cards";
import type { PorenaGameState, PlayerState, PoolCard } from "./types";

export function createOwnershipPool(): PoolCard[] {
  return makeDeck().map((card) => ({ card, state: "AVAILABLE" }));
}

/** Shop reservations are not owned until purchased, so they remain in the meter. */
export function ownershipCounts(state: PorenaGameState) {
  return {
    remaining: state.ownershipCardPool.filter((entry) => entry.state !== "OWNED").length,
    owned: state.players.reduce((total, player) => total + player.ownedCardIds.length, 0),
  };
}

export function assertPoolIntegrity(state: PorenaGameState): true {
  if (state.ownershipCardPool.length !== 52) throw new Error("Card pool must contain exactly 52 entries");
  const ids = new Set(state.ownershipCardPool.map((entry) => entry.card.id));
  if (ids.size !== 52) throw new Error("Card pool contains duplicate card ids");
  const players = new Map(state.players.map((player) => [player.id, player]));
  const assigned = new Set<string>();
  for (const player of state.players) {
    for (const [expected, cardIds] of [["OWNED", player.ownedCardIds], ["RESERVED_IN_SHOP", player.shopCardIds]] as const) {
      for (const id of cardIds) {
        const entry = state.ownershipCardPool.find((card) => card.card.id === id);
        if (assigned.has(id)) throw new Error(`${id} assigned more than once`);
        assigned.add(id);
        if (!entry || entry.state !== expected || (expected === "OWNED" ? entry.ownerPlayerId : entry.reservedPlayerId) !== player.id) throw new Error(`${id} player ledger mismatch`);
      }
    }
    if ((player.lockedShopCardIds ?? []).some((id) => !player.shopCardIds.includes(id))) throw new Error("Locked card is not reserved in shop");
  }
  for (const entry of state.ownershipCardPool) {
    if (!["AVAILABLE", "OWNED", "RESERVED_IN_SHOP"].includes(entry.state)) throw new Error("Unknown ledger state");
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

export function releasePlayerCards(state: PorenaGameState, player: PlayerState): void {
  for (const id of [...player.ownedCardIds, ...player.shopCardIds]) {
    const entry = state.ownershipCardPool.find((item) => item.card.id === id)!;
    entry.state = "AVAILABLE"; delete entry.ownerPlayerId; delete entry.reservedPlayerId;
  }
  player.ownedCardIds = []; player.shopCardIds = []; player.selectedCardIds = [];
  player.lockedShopCardIds = [];
}
