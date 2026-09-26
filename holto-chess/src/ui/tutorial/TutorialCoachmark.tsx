import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SpotlightRect } from "./useSpotlight";
import { useTranslation } from "../../i18n";

/**
 * Non-modal guidance panel. It sits beside the highlight on a wide screen and becomes a bottom sheet
 * on a narrow one, and it never traps focus: the reader can Tab straight into the shop controls the
 * step is asking them to use.
 */
export function TutorialCoachmark({ chapter, step, title, body, more, goal, next, rect, busy, hidden = false, onHide, onShow, onNext, onRestart, onExit, onChapters }: {
  chapter: string; step: string; title: string; body: string[]; more?: string[]; goal?: string;
  next?: string; rect: SpotlightRect | null; busy?: boolean; hidden?: boolean;
  onHide?: () => void; onShow?: () => void;
  onNext?: () => void; onRestart: () => void; onExit: () => void; onChapters: () => void;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  // ESC only puts the guidance away. It never confirms a step or buys anything.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !hidden) onHide?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hidden, onHide]);
  const [style, setStyle] = useState<CSSProperties>({});
  useEffect(() => {
    const place = () => {
      const element = panel.current;
      if (!element || window.matchMedia("(max-width: 860px)").matches) { setStyle({}); return; }
      const size = element.getBoundingClientRect();
      if (!rect) { setStyle({ right: 32, bottom: 32 }); return; }
      const gap = 16;
      const clampTop = (value: number) => Math.min(Math.max(gap, value), Math.max(gap, window.innerHeight - size.height - gap));
      const clampLeft = (value: number) => Math.min(Math.max(gap, value), Math.max(gap, window.innerWidth - size.width - gap));
      // Beside the highlight when there is room, then below, then above. The panel must never sit on
      // top of the thing it is pointing at.
      const candidates = [
        { fits: rect.left + rect.width + gap + size.width < window.innerWidth - gap, top: clampTop(rect.top), left: rect.left + rect.width + gap },
        { fits: rect.left - gap - size.width > gap, top: clampTop(rect.top), left: rect.left - gap - size.width },
        { fits: rect.top + rect.height + gap + size.height < window.innerHeight - gap, top: rect.top + rect.height + gap, left: clampLeft(rect.left) },
        { fits: rect.top - gap - size.height > gap, top: rect.top - gap - size.height, left: clampLeft(rect.left) },
      ];
      const spot = candidates.find((candidate) => candidate.fits);
      setStyle(spot ? { top: spot.top, left: spot.left } : { right: gap, bottom: gap });
    };
    const frame = requestAnimationFrame(place);
    // The panel's own height settles a frame later (fonts, wrapped lines, an opened details block),
    // so placement is recomputed whenever its box changes rather than trusting the first measurement.
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("orientationchange", place);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("resize", place); window.removeEventListener("orientationchange", place);
    };
  }, [rect, step]);
  if (hidden) return <button type="button" className="tutorial-coach-reopen" onClick={onShow}>{t("tutorial.showGuide")}</button>;
  return <aside ref={panel} className="tutorial-coach" style={style} aria-live="polite" data-tutorial-coach>
    <header><small>{chapter}</small>{goal ? <strong className="tutorial-goal">{t("tutorial.currentGoal", { goal })}</strong> : null}</header>
    <h2>{title}</h2>
    {body.map((line, index) => <p key={index}>{line}</p>)}
    {more?.length ? <details key={step}>
      <summary>{t("tutorial.learnMore")}</summary>
      {more.map((line, index) => <p key={index}>{line}</p>)}
    </details> : null}
    <div className="tutorial-coach-actions">
      {onNext ? <button type="button" className="primary" disabled={busy} onClick={onNext}>{next ?? t("tutorial.continue")}</button>
        : <span className="tutorial-waiting">{t("tutorial.tryOnScreen")}</span>}
      <button type="button" className="secondary" onClick={onRestart}>{t("tutorial.retryStep")}</button>
    </div>
    <div className="tutorial-coach-links">
      <button type="button" onClick={onHide}>{t("tutorial.hideGuide")}</button>
      <button type="button" onClick={onChapters}>{t("tutorial.chooseChapter")}</button>
      <button type="button" onClick={onExit}>{t("tutorial.exit")}</button>
    </div>
  </aside>;
}
