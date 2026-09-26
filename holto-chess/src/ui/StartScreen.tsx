import { useEffect, useRef, useState } from "react";
import { GameOverviewGuide } from "./GameOverviewGuide";
import { useCinematicMotion } from "./useCinematicMotion";
import { resetSeenRoundGuides, setAutoRoundGuides, useRoundGuidePreferences } from "./roundGuidePreferences";
import { useMadeSoundPreferences, writeMadeSoundPreferences } from "./madeSound";
import { useTranslation } from "../i18n";
import "./start-screen.css";

export type StartMode = "single" | "multi" | "tutorial";
type MenuOverlay = "mode" | "guide" | "settings" | null;

export function StartScreen({ onStart }: { onStart: (mode: StartMode) => void }) {
  const { locale, setLocale, t } = useTranslation();
  const motion = useCinematicMotion();
  const roundGuides = useRoundGuidePreferences();
  const sounds = useMadeSoundPreferences();
  const [overlay, setOverlay] = useState<MenuOverlay>(null);
  const modal = useRef<HTMLDivElement>(null);

  // Keep keyboard navigation inside either menu overlay and restore its trigger.
  useEffect(() => {
    if (!overlay) return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(modal.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex='0']") ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay(null);
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [overlay]);

  return <main className="start-screen">
    <div className="start-content" inert={overlay !== null}>
      <div className="start-main">
        <header className="start-title"><p>POKER STRATEGY · AUTO BATTLER</p><h1><img src="/assets/start/porena-wordmark.webp" alt="PORENA" /></h1><p className="start-tagline">{t("home.tagline")}</p></header>
        <div className="start-menu" aria-label={t("home.menu")}>
          <button type="button" className="start-menu-primary" onClick={() => setOverlay("mode")}><span>{t("home.start")}</span></button>
          <button type="button" onClick={() => onStart("tutorial")}><span>{t("home.tutorial")}</span></button>
          <button type="button" onClick={() => setOverlay("guide")}><span>{t("home.guide")}</span></button>
          <button type="button" onClick={() => setOverlay("settings")}><span>{t("home.settings")}</span></button>
        </div>
      </div>
      <footer className="start-footer">
        <a href={`mailto:wlghks1778@gmail.com?subject=${encodeURIComponent("[PORENA] " + t("home.bugReport"))}&body=${encodeURIComponent(t("home.bugReportEmailBody"))}`}>{t("home.bugReport")} · wlghks1778@gmail.com</a>
        {import.meta.env.DEV ? <><span>·</span> DEVELOPMENT PREVIEW</> : null}
      </footer>
    </div>
    {overlay && <div ref={modal} className="start-overlay">
      {overlay === "mode" ? <div className="start-mode-backdrop"><section className="start-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="start-mode-title">
        <header><div><small>SELECT PLAY MODE</small><h2 id="start-mode-title">{t("home.selectMode")}</h2></div><button type="button" aria-label={`${t("home.selectMode")} · ${t("common.close")}`} onClick={() => setOverlay(null)}>×</button></header>
        <div className="start-mode-options">
          <button type="button" onClick={() => onStart("single")}><span>SINGLE PLAY</span><strong>{t("home.single")}</strong><small>{t("home.singleDescription")}</small><i>→</i></button>
          <button type="button" onClick={() => onStart("multi")}><span>MULTIPLAYER</span><strong>{t("home.multi")}</strong><small>{t("home.multiDescription")}</small><i>→</i></button>
        </div>
      </section></div> : overlay === "guide" ? <GameOverviewGuide onClose={() => setOverlay(null)} /> :
        <div className="start-settings-backdrop"><section className="start-settings" role="dialog" aria-modal="true" aria-labelledby="start-settings-title">
          <header><div><small>PREFERENCES</small><h2 id="start-settings-title">{t("settings.title")}</h2></div><button type="button" aria-label={`${t("settings.title")} · ${t("common.close")}`} onClick={() => setOverlay(null)}>×</button></header>
          <label className="locale-setting"><span>{t("language.label")}</span><select aria-label={t("language.label")} value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}><option value="ko-KR">한국어</option><option value="en-US">English</option></select></label>
          <fieldset><legend>{t("settings.visuals")}</legend><label>{t("settings.motion")}<input type="checkbox" role="switch" checked={motion.enabled} onChange={(event) => motion.setEnabled(event.target.checked)} /></label><p className="start-settings-note">{t("settings.motionHelp")}</p></fieldset>
          <fieldset><legend>{t("settings.help")}</legend><label>{t("settings.autoGuide")}<input type="checkbox" role="switch" checked={roundGuides.autoEnabled} onChange={(event) => setAutoRoundGuides(event.target.checked)} /></label><p className="start-settings-note">{t("settings.autoGuideHelp")}</p><button className="secondary" type="button" onClick={() => resetSeenRoundGuides()}>{t("settings.resetGuides")}</button></fieldset>
          <fieldset><legend>{t("settings.madeSound")}</legend><label>{t("settings.soundEnabled")}<input type="checkbox" role="switch" checked={sounds.enabled} onChange={(event) => writeMadeSoundPreferences({ ...sounds, enabled: event.target.checked })} /></label><label>{t("settings.soundVolume")}<input type="range" min="0" max="100" value={Math.round(sounds.volume * 100)} onChange={(event) => writeMadeSoundPreferences({ ...sounds, volume: Number(event.target.value) / 100 })} /></label><p className="start-settings-note">{t("settings.soundHelp")}</p></fieldset>
          <button className="primary" type="button" onClick={() => setOverlay(null)}>{t("common.close")}</button>
        </section></div>}
    </div>}
  </main>;
}
