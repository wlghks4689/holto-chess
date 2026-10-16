/** Local presentation time, like the local cinematic: hidden tabs and long stalls cannot consume a whole reveal. */
export function visibleTimeout(done: () => void, durationMs: number, onTick?: (remainingMs: number) => void,
  visible = () => !document.hidden) {
  let previous = performance.now();
  let elapsed = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    if (visible()) elapsed += Math.min(100, Math.max(0, now - previous));
    previous = now;
    onTick?.(Math.max(0, durationMs - elapsed));
    if (elapsed >= durationMs) { clearInterval(timer); done(); }
  }, 40);
  return () => clearInterval(timer);
}
