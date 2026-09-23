import { useEffect, useState } from "react";

export type SpotlightRect = { top: number; left: number; width: number; height: number };

/** Frames the box must hold still before the hook stops measuring. */
const STABLE_FRAMES = 4;
/** Safety net for a layout change nothing else reports, such as a re-rendered panel. */
const RECHECK_MS = 500;

function same(a: SpotlightRect | null, b: SpotlightRect | null): boolean {
  return !!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/**
 * Finds the focused element live, so a rerolled shop or a re-rendered panel never keeps a stale hole.
 *
 * Measuring forces layout, so it is not done every frame forever: after any change the box is read
 * for a few frames until it settles — fonts, images and wrapped lines land after the first paint —
 * and then the hook goes quiet until scrolling, a resize or the periodic recheck wakes it again.
 */
export function useSpotlight(focusId: string | undefined): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  useEffect(() => {
    // No clearing here: the hook already reports null while there is no focus, and writing state
    // straight from an effect body would kick off a cascading render for nothing.
    if (!focusId) return;
    let frame = 0;
    let stable = 0;
    let last: SpotlightRect | null = null;
    const measure = () => {
      const element = document.querySelector<HTMLElement>(`[data-tutorial-id="${focusId}"]`);
      const box = element?.getBoundingClientRect();
      const next = box && box.width && box.height
        ? { top: box.top - 8, left: box.left - 8, width: box.width + 16, height: box.height + 16 }
        : null;
      stable = same(last, next) || (!last && !next) ? stable + 1 : 0;
      last = next;
      setRect((current) => (same(current, next) || (!current && !next) ? current : next));
    };
    const settle = () => {
      measure();
      frame = stable < STABLE_FRAMES ? requestAnimationFrame(settle) : 0;
    };
    const restart = () => { stable = 0; if (!frame) frame = requestAnimationFrame(settle); };
    restart();
    window.addEventListener("resize", restart);
    window.addEventListener("orientationchange", restart);
    window.addEventListener("scroll", restart, { capture: true, passive: true });
    const observer = new ResizeObserver(restart);
    observer.observe(document.body);
    const recheck = window.setInterval(restart, RECHECK_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(recheck);
      observer.disconnect();
      window.removeEventListener("resize", restart);
      window.removeEventListener("orientationchange", restart);
      window.removeEventListener("scroll", restart, { capture: true });
    };
  }, [focusId]);
  return focusId ? rect : null;
}

/** Below this the guidance is a bottom sheet covering the page rather than a panel beside it. */
const NARROW = "(max-width: 860px)";

/**
 * Height the guidance sheet takes off the bottom of the screen, or 0 when it sits beside the page.
 * Everything that must stay readable — the explanation panel, the control a step points at — is
 * positioned against this instead of against the viewport, which the sheet does not fully own.
 */
export function useCoachInset(dependency: unknown): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const sheet = document.querySelector<HTMLElement>(".tutorial-coach");
      const next = sheet && window.matchMedia(NARROW).matches ? sheet.getBoundingClientRect().height : 0;
      setInset((current) => (Math.abs(current - next) < 0.5 ? current : next));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    schedule();
    const observer = new ResizeObserver(schedule);
    const sheet = document.querySelector(".tutorial-coach");
    if (sheet) observer.observe(sheet);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, [dependency]);
  return inset;
}

/**
 * Brings the target into view once per step without fighting the reader's own scrolling.
 *
 * "In view" means the band the reader can actually see: on a narrow screen the guidance sheet owns
 * the bottom of the viewport, so centring against the whole window parks the highlighted control
 * underneath it — which is exactly what the step is asking the reader to press.
 */
export function useScrollIntoView(focusId: string | undefined, stepId: string): void {
  useEffect(() => {
    if (!focusId) return;
    const element = document.querySelector<HTMLElement>(`[data-tutorial-id="${focusId}"]`);
    if (!element) return;
    // Measured here rather than taken from state: this runs once per step and must be right even
    // when the frame callback that maintains the shared value has not had a chance to run.
    const sheet = document.querySelector<HTMLElement>(".tutorial-coach");
    const inset = sheet && window.matchMedia(NARROW).matches ? sheet.getBoundingClientRect().height : 0;
    const margin = 12;
    const top = margin;
    const bottom = window.innerHeight - inset - margin;
    if (bottom <= top) return;
    const box = element.getBoundingClientRect();
    if (box.top >= top && box.bottom <= bottom) return;
    const band = bottom - top;
    // Centre it in the band when it fits, otherwise show it from the top.
    const delta = box.height <= band ? box.top - (top + (band - box.height) / 2) : box.top - top;
    window.scrollBy({ top: delta, behavior: "smooth" });
  }, [focusId, stepId]);
}
