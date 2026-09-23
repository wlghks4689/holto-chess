import { useEffect, useState } from "react";

export type SpotlightRect = { top: number; left: number; width: number; height: number };

/** Finds the focused element live, so a rerolled shop or a re-rendered panel never keeps a stale hole. */
export function useSpotlight(focusId: string | undefined): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  useEffect(() => {
    if (!focusId) return;
    let frame = 0;
    const measure = () => {
      const element = document.querySelector<HTMLElement>(`[data-tutorial-id="${focusId}"]`);
      if (!element) { setRect(null); return; }
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) { setRect(null); return; }
      setRect((current) => {
        const next = { top: box.top - 8, left: box.left - 8, width: box.width + 16, height: box.height + 16 };
        return current && Math.abs(current.top - next.top) < 0.5 && Math.abs(current.left - next.left) < 0.5
          && Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5 ? current : next;
      });
    };
    // Re-measured on the next frames as well: fonts, images and layout settle after the first paint.
    const loop = () => { measure(); frame = requestAnimationFrame(loop); };
    loop();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); };
  }, [focusId]);
  return focusId ? rect : null;
}

/** Brings the target into view once per step without fighting the reader's own scrolling. */
export function useScrollIntoView(focusId: string | undefined, stepId: string): void {
  useEffect(() => {
    if (!focusId) return;
    const element = document.querySelector<HTMLElement>(`[data-tutorial-id="${focusId}"]`);
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, stepId]);
}
