import { useCallback, useEffect, useRef, useState } from "react";
import { createLocalGameRunner } from "./localGameRunner";
import { localGameSnapshot, localGameStep, type LocalGameCommand } from "./localGameCommand";
import type { PorenaGameState } from "../game/types";

export function useLocalGame(initialGame: () => PorenaGameState) {
  const [snapshot, setSnapshot] = useState(() => localGameSnapshot(initialGame()));
  const current = useRef(snapshot.game);
  const [pending, setPending] = useState(false);
  // The auction clock and bot turns send a command every few hundred ms; only a command that is actually slow shows "processing".
  const [commandCount, setCommandCount] = useState(0);
  const [slowCommand, setSlowCommand] = useState(-1);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlowCommand(commandCount), 400);
    return () => clearTimeout(timer);
  }, [pending, commandCount]);
  const slowPending = pending && slowCommand === commandCount;
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
    if (accepted) { lastCommand.current = command; if (!failed.current) { setPending(true); setCommandCount((count) => count + 1); } }
    return accepted;
  }, [runner]);
  const retry = useCallback(() => { failed.current = false; setFailure(null); if (lastCommand.current) run(lastCommand.current); }, [run]);
  const reset = useCallback((game: PorenaGameState) => {
    runner.cancel(); current.current = game; failed.current = false; lastCommand.current = null;
    setSnapshot(localGameSnapshot(game)); setPending(false); setFailure(null);
  }, [runner]);
  return { ...snapshot, pending, slowPending, failure, run, retry, reset, clearError: () => setFailure(null) };
}
