import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../i18n";
import { HAND_KEY, HAND_LADDER, handScore } from "./guide/guideRules";
import "./hand-score-disclosure.css";

/** Public base rules only: never reads a player's cards or unpublished match results. */
export function HandScoreTable() {
  const { t } = useTranslation();
  return <><p className="hand-score-note">{t("final.handScoreNote")}</p>
    <table className="hand-score-table" aria-label={t("final.handScoreTable")}><tbody>
      {HAND_LADDER.map(category => <tr key={category}><th scope="row" data-category={category}>{t(HAND_KEY[category])}</th><td>{handScore(category)}P</td></tr>)}
    </tbody></table>
    <p className="hand-score-note">{t("final.handScoreAbilityNote")}</p>
  </>;
}

export function HandScoreDisclosure() {
  const { t } = useTranslation();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 320, maxHeight: 400 });
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
    };
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close);
    };
  }, [open]);
  return <div className="hand-score-disclosure">
    <button ref={trigger} type="button" className="hand-score-trigger" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => {
      const rect = trigger.current!.getBoundingClientRect();
      const width = Math.min(rect.width, 360, window.innerWidth - 24);
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: rect.bottom + 4,
        width, maxHeight: Math.max(0, window.innerHeight - rect.bottom - 16) });
      setOpen(value => !value);
    }}>{t("final.handScoreTable")}<span aria-hidden="true">{open ? "▴" : "▾"}</span></button>
    {open && createPortal(<div ref={panel} id={id} className="hand-score-popover" role="region" aria-label={t("final.handScoreTable")} tabIndex={-1} style={position}>
      <HandScoreTable />
      <button type="button" className="hand-score-close" onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}>{t("ability.ux.close")}</button>
    </div>, document.body)}
  </div>;
}
