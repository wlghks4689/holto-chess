import { BALANCE } from "../../src/game/config";
import { assertPoolIntegrity } from "../../src/game/cardPool";
import type { PorenaGameState } from "../../src/game/types";

export function assertSimulationInvariants(state: PorenaGameState, expectedAlive?: number): true {
  assertPoolIntegrity(state);
  const owned = state.players.flatMap((player) => player.ownedCardIds);
  if (new Set(owned).size !== owned.length) throw new Error("A physical card is owned by more than one player");
  for (const player of state.players) {
    if (player.ownedCardIds.length > BALANCE.handLimits[state.round]) throw new Error(`${player.id} exceeds R${state.round} hand limit`);
  }
  if (expectedAlive !== undefined) {
    const alive = state.players.filter((player) => !player.eliminated).length;
    if (alive !== expectedAlive) throw new Error(`R${state.round} expected ${expectedAlive} active players, found ${alive}`);
  }
  for (const match of state.roundResults) {
    match.boards.forEach((board, boardIndex) => {
      const boardPlayerIds = match.boardResults[boardIndex]?.map((result) => result.playerId) ?? match.playerIds;
      const participantOwned = new Set(boardPlayerIds.flatMap((id) => state.players.find((player) => player.id === id)?.ownedCardIds ?? []));
      const leaked = board.find((card) => participantOwned.has(card.id));
      if (leaked) throw new Error(`${match.id} board ${boardIndex + 1} contains participant-owned card ${leaked.id} for [${boardPlayerIds.join(", ")}]`);
    });
    if (match.runoutCount === 2) {
      const firstTwo = match.boards.slice(0, 2).flat().map((card) => card.id);
      if (new Set(firstTwo).size !== firstTwo.length) throw new Error(`${match.id} repeats a physical card across Board A and Board B`);
    }
  }
  return true;
}
