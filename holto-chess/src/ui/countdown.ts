export type CountdownUrgency = "normal" | "warning" | "critical";

/** Whole seconds left, rounded up so the display reaches 0 exactly at the deadline. */
export function secondsUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function countdownUrgency(seconds: number): CountdownUrgency {
  if (seconds <= 5) return "critical";
  if (seconds <= 10) return "warning";
  return "normal";
}
