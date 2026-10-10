import { useEffect, useRef } from "react";
import type { FinalArenaFx as Fx } from "./finalArenaStage";

// Creation and teardown run one after another: destroying an app releases Pixi's global pools,
// which would corrupt a second app still alive (StrictMode mounts twice, remounts overlap).
let lifecycle: Promise<unknown> = Promise.resolve();

/** Mounts the final-round Pixi layer (pixi.js loads on demand) and feeds it the cinematic phase. */
export function FinalArenaFx({ phase, winnerIds, catchUp }: { phase: string; winnerIds: readonly string[]; catchUp: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const fx = useRef<Fx | null>(null);
  const latest = useRef({ phase, winnerIds });

  useEffect(() => {
    let cancelled = false;
    let created: Fx | null = null;
    lifecycle = lifecycle.then(async () => {
      if (cancelled || !host.current) return;
      const { createFinalArenaFx } = await import("./finalArenaStage");
      created = await createFinalArenaFx(host.current);
      if (cancelled) return;
      fx.current = created;
      // Whatever phase was reached while pixi loaded is applied without its entrance beat.
      created.setPhase(latest.current.phase, latest.current.winnerIds, true);
    }).catch(() => { /* no WebGL: the CSS presentation stands on its own */ });
    return () => {
      cancelled = true; fx.current = null;
      lifecycle = lifecycle.then(() => { created?.destroy(); created = null; });
    };
  }, []);

  useEffect(() => {
    latest.current = { phase, winnerIds };
    fx.current?.setPhase(phase, winnerIds, catchUp);
  }, [phase, winnerIds, catchUp]);

  return <div ref={host} className="cinema-final-fx" aria-hidden="true" />;
}
