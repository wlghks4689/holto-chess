import { useEffect, useState } from "react";

/** Local-only countdown. Pass a turn key to reset without remounting modal state. */
export function useLocalCountdown(durationSeconds: number, turnKey?: string): number {
  const [seconds, setSeconds] = useState(durationSeconds);
  useEffect(() => {
    const deadline = Date.now() + durationSeconds * 1000;
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => clearInterval(timer);
  }, [durationSeconds, turnKey]);
  return seconds;
}
