import { useEffect, useState } from "react";

/** Local-only countdown. Pass a turn key to reset without remounting modal state. */
export function useLocalCountdown(durationSeconds: number, turnKey?: string): number {
  const [countdown, setCountdown] = useState({ seconds: durationSeconds, durationSeconds, turnKey });
  useEffect(() => {
    const deadline = Date.now() + durationSeconds * 1000;
    const timer = setInterval(() => setCountdown({ seconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)), durationSeconds, turnKey }), 250);
    return () => clearInterval(timer);
  }, [durationSeconds, turnKey]);
  // A new phase displays its own duration immediately, before the first interval tick.
  return countdown.turnKey === turnKey && countdown.durationSeconds === durationSeconds ? countdown.seconds : durationSeconds;
}
