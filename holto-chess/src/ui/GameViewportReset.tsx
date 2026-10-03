import { useLayoutEffect, useRef } from "react";
import { restoreGameViewport } from "./viewportTransition";

/** Mounted inside the visible gate child, so returning from cinema also resets.
 * Only screen identity changes trigger this, never countdowns, picks or RUN frames.
 */
export function GameViewportReset({ screenKey }: { screenKey: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    restoreGameViewport(marker.current?.closest<HTMLElement>(".page-shell,.cinema"));
  }, [screenKey]);
  return <span ref={marker} hidden data-viewport-screen={screenKey} />;
}
