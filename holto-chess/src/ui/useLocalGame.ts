import { useCallback, useEffect, useRef, useState } from "react";
import { createLocalGameRunner } from "./localGameRunner";
import { localGameSnapshot, localGameStep, type LocalGameCommand } from "./localGameCommand";
import type { PorenaGameState } from "../game/types";

export function useLocalGame(initialGame: () => PorenaGameState) {
  const [snapshot, setSnapshot] = useState(() => localGameSnapshot(initialGame()));
  const current = useRef(snapshot.game);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ kind: "worker" | "command"; message?: string } | null>(null);
  const failed = useRef(false);
  const lastCommand = useRef<LocalGameCommand | null>(null);
  const [runner] = useState(() => createLocalGameRunner(() => new Worker(new URL("./localGame.worker.ts", import.meta.url), { type: "module" })));
  useEffect(() => () => runner.cancel(), [runner]);
  const run = useCallback((command: LocalGameCommand, expectedStep?: string) => {
    if (expectedStep !== undefined && localGameStep(current.current) !== expectedStep) return true;
    if (failed.current) return false;
    const accepted = runner.run(current.current, command, (next) => {
      current.current = next.game; setSnapshot(next); setPending(false); setFailure(null);
    }, error => { failed.current = error.kind === "worker"; setFailure(error); setPending(false); });
    // A worker construction failure can report synchronously.
    if (accepted) { lastCommand.current = command; if (!failed.current) setPending(true); }
    return accepted;
  }, [runner]);
  const retry = useCallback(() => { failed.current = false; setFailure(null); if (lastCommand.current) run(lastCommand.current); }, [run]);
  const reset = useCallback((game: PorenaGameState) => {
    runner.cancel(); current.current = game; failed.current = false; lastCommand.current = null;
    setSnapshot(localGameSnapshot(game)); setPending(false); setFailure(null);
  }, [runner]);
  return { ...snapshot, pending, failure, run, retry, reset, clearError: () => setFailure(null) };
}
