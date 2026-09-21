import { useEffect, type ReactNode } from "react";
import { useLocalCountdown } from "./useLocalCountdown";

/** Must be mounted INSIDE CinematicGate: hidden results must not consume viewing time. */
export function LocalResultWindow({ active, onExpire, children }: {
  active: boolean; onExpire: () => void; children: (seconds: number | null) => ReactNode;
}) {
  const seconds = useLocalCountdown(active ? 30 : 0);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(onExpire, 30_000);
    return () => clearTimeout(timer);
  }, [active, onExpire]);
  return <>{children(active ? seconds : null)}</>;
}
