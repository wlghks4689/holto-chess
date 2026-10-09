import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

export function EquityMeter({ percent, name, viewer }: { percent: number | null; name: string; viewer: boolean }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(percent);
  const current = useRef(percent);
  useEffect(() => {
    const from = current.current;
    const start = performance.now();
    let request = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const progress = reduce || from === null || percent === null ? 1 : Math.min(1, (now - start) / 250);
      const next = percent === null ? null : (from ?? percent) + (percent - (from ?? percent)) * progress;
      current.current = next; setShown(next);
      if (progress < 1) request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [percent]);
  const value = shown === null ? null : Math.round(shown);
  const label = `${name} · ${t("showdown.equityLabel")} ${percent === null ? "—" : `${percent}%`}`;
  return <span className={`cinema-equity-meter ${viewer ? "is-viewer" : "is-opponent"}`} role="img" aria-label={label} title={label} data-equity={percent ?? "pending"}>
    <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" className="equity-track" /><circle cx="20" cy="20" r="17" className="equity-value" pathLength="100" strokeDasharray={`${shown ?? 0} 100`} transform="rotate(-90 20 20)" /></svg>
    <strong aria-hidden="true">{value === null ? "—" : <>{value}<small>%</small></>}</strong>
  </span>;
}
