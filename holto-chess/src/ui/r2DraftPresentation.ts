import type { PlayerView } from "../shared/protocol";

export const DRAFT_DEAL_MS = 1450;
export function canPickR2Card(view: PlayerView, price: number, claimedBy: string | undefined, disabled: boolean, dealing: boolean) {
  return view.phase === "OPEN_DRAFT" && view.draft?.currentPlayerId === view.me.playerId && !disabled && !dealing && !claimedBy && view.me.stackBB >= price;
}
