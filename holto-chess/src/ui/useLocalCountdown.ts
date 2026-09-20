import { useEffect, useState } from "react";

/** Local-only countdown. Remount the caller with a new key for every fresh turn. */
export function useLocalCountdown(durationSeconds: number): number {
  const [seconds, setSeconds] = useState(durationSeconds);
  useEffect(() => {
    const deadline = Date.now() + durationSeconds * 1000;
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => clearInterval(timer);
  }, [durationSeconds]);
  return seconds;
}
