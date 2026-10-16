import { applyLocalGameCommand, localGameSnapshot } from "./localGameCommand";
import type { LocalGameRequest, LocalGameResponse } from "./localGameRunner";
import { classifyGameError } from "../shared/gameErrorCode";

self.onmessage = (event: MessageEvent<LocalGameRequest>) => {
  const { id, game, command } = event.data;
  let response: LocalGameResponse;
  try { response = { id, snapshot: localGameSnapshot(applyLocalGameCommand(game, command)) }; }
  catch (error) {
    const message = error instanceof Error ? error.message : "Unknown game command error";
    response = { id, error: message, fatal: command.type === "ADVANCE" || command.type === "AUCTION_TICK"
      || classifyGameError(message).code === "ACTION_REJECTED" };
  }
  self.postMessage(response);
};
