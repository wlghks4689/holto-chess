import type { PlayerView, SessionCredential } from "../shared/protocol";

/** A credential alone is not proof the server has started a game. */
export function onlineScreen(credential: SessionCredential | null, view: PlayerView | null) {
  if (!credential) return "lobby";
  if (!view || view.roomId !== credential.roomId) return "connecting";
  if (view.players.find((player) => player.playerId === view.me.playerId)?.departed) return "departed";
  return view.status === "PLAYING" ? "game" : "waiting";
}
