import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useCinematicMotion } from "./useCinematicMotion";
import { resetSeenRoundGuides, setAutoRoundGuides, useRoundGuidePreferences } from "./roundGuidePreferences";
import { useMadeSoundPreferences, writeMadeSoundPreferences } from "./madeSound";
import { useTranslation } from "../i18n";
import { followInApp, LEGAL_PATHS } from "../legal/legalRoute";
import "./start-screen.css";
import { AccountLogin, ProfileForm } from "./AccountLogin";
import { useAccount } from "./useAccount";
import { EntranceLayer } from "./EntranceLayer";
import { ACCOUNTS_ENABLED } from "../shared/features";
import { GAME_INTRO } from "../shared/gameIntroduction";

// The guide carries its own copy, examples and styles, so it loads only when opened.
const GameOverviewGuide = lazy(() => import("./GameOverviewGuide").then((module) => ({ default: module.GameOverviewGuide })));
const FeedbackDialog = lazy(() => import("./FeedbackDialog").then((module) => ({ default: module.FeedbackDialog })));

export type StartMode = "single" | "multi";
type MenuOverlay = "mode" | "guide" | "settings" | "feedback" | "profile" | null;
/**
 * The home page asks nothing before the visitor sees the game (HOME-GATE-001). It is the gate: four menu items over the
 * closed doors. "Game start" opens the doors (the entrance film), and the play-mode box appears over the arena behind
 * them. Closing that box walks back out to the gate.
 */
type Stage = "gate" | "opening" | "arena";

export function StartScreen({ onStart, entryPreview }: { onStart: (mode: StartMode) => void; entryPreview?: { failure?: boolean; reduced?: boolean } }) {
  const { locale, setLocale, t } = useTranslation();
  const account = useAccount();
  const [stage, setStage] = useState<Stage>("gate");
  const entering = stage === "opening";
  const motion = useCinematicMotion();
  const roundGuides = useRoundGuidePreferences();
  const sounds = useMadeSoundPreferences();
  const [overlay, setOverlay] = useState<MenuOverlay>(null);
  const modal = useRef<HTMLDivElement>(null);
  // The arena exists only to choose a play mode: once that box closes (×, Escape), the visitor is back at the gate,
  // with focus on "game start" again so a keyboard user keeps their place.
  const startButton = useRef<HTMLButtonElement>(null);
  const wasArena = useRef(false);
  const closeOverlay = useCallback(() => { setOverlay(null); setStage(current => current === "arena" ? "gate" : current); }, []);
  useEffect(() => { if (stage === "gate" && wasArena.current) startButton.current?.focus(); wasArena.current = stage === "arena"; }, [stage]);

  // Keep keyboard navigation inside either menu overlay and restore its trigger.
  useEffect(() => {
    if (!overlay) return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(modal.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex='0']") ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOverlay();
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
  }, [overlay, closeOverlay]);

  // Behind the film the page already shows the arena, so the fade at its end reveals the arena, never the gate again.
  return <main className={`start-screen${stage === "gate" ? " start-gate-screen" : " start-arena-stage"}${entering ? " is-entering" : ""}`} aria-busy={entering}>
    {stage !== "arena" && <div className="start-content" inert={overlay !== null || entering}>
      <div className="start-topbar">
        <div className="start-language" role="group" aria-label={t("language.label")}>
          <button type="button" lang="ko" aria-pressed={locale === "ko-KR"} onClick={() => setLocale("ko-KR")}>한국어</button>
          <button type="button" lang="en" aria-pressed={locale === "en-US"} onClick={() => setLocale("en-US")}>English</button>
        </div>
        {ACCOUNTS_ENABLED && account.canEnter && <AccountLogin onProfile={() => setOverlay("profile")} />}
      </div>
      <div className="start-main">
        <header className="start-title"><p>POKER STRATEGY · AUTO BATTLER</p><h1><img src="/assets/start/porena-wordmark.webp" alt="포레나 PORENA" /></h1><p className="start-tagline">{t("home.tagline")}</p></header>
        <div className="start-menu" aria-label={t("home.menu")}>
          <button ref={startButton} type="button" className="start-menu-primary" onClick={() => setStage("opening")}><span>{t("home.start")}</span></button>
          <button type="button" onClick={() => setOverlay("guide")}><span>{t("home.guide")}</span></button>
          <button type="button" onClick={() => setOverlay("settings")}><span>{t("home.settings")}</span></button>
          <button type="button" onClick={() => setOverlay("feedback")}><span>{t("home.feedback")}</span></button>
        </div>
      </div>
      <footer className="start-footer">
        <nav aria-label={t("legal.nav")}>
          <a href="/about">{GAME_INTRO[locale].link}</a><span aria-hidden="true">·</span>
          <a href={LEGAL_PATHS.privacy} onClick={followInApp(LEGAL_PATHS.privacy)}>{t("legal.privacy")}</a>
          <span aria-hidden="true">·</span>
          <a href={LEGAL_PATHS.terms} onClick={followInApp(LEGAL_PATHS.terms)}>{t("legal.terms")}</a>
        </nav>
        {import.meta.env.DEV ? <small>DEVELOPMENT PREVIEW</small> : null}
      </footer>
    </div>}
    {/* At the gate the film preloads; "game start" plays it, and its end opens the arena with the play-mode box. */}
    <EntranceLayer key={entering ? "playing" : "preload"} active={entering} preload={stage === "gate"} onComplete={() => { setStage("arena"); setOverlay("mode"); }}
      forceFailure={entryPreview?.failure} forceReducedMotion={entryPreview?.reduced} />
    {overlay && <div ref={modal} className="start-overlay">
      {overlay === "mode" ? <div className="start-mode-backdrop"><section className="start-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="start-mode-title">
        <header><div><small>SELECT PLAY MODE</small><h2 id="start-mode-title">{t("home.selectMode")}</h2></div><button type="button" aria-label={`${t("home.selectMode")} · ${t("common.close")}`} onClick={() => closeOverlay()}>×</button></header>
        <div className="start-mode-options">
          <button type="button" onClick={() => onStart("single")}><span>SINGLE PLAY</span><strong>{t("home.single")}</strong><small>{t(ACCOUNTS_ENABLED && account.status === "authenticated" ? "home.singleRankedDescription" : "home.singlePracticeDescription")}</small><i>→</i></button>
          <button type="button" onClick={() => onStart("multi")}><span>MULTIPLAYER</span><strong>{t("home.multi")}</strong><small>{t("home.multiDescription")}</small><i>→</i></button>
        </div>
      </section></div> : overlay === "guide" ? <Suspense fallback={<div className="game-guide-backdrop" role="presentation" />}><GameOverviewGuide onClose={() => closeOverlay()} /></Suspense> :
        overlay === "feedback" ? <Suspense fallback={<div className="start-settings-backdrop" role="presentation" />}><FeedbackDialog onClose={() => closeOverlay()} /></Suspense> :
        overlay === "profile" ? <div className="start-settings-backdrop"><section className="start-settings" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title"><header><h2 id="profile-edit-title">{t("profile.edit")}</h2><button type="button" aria-label={t("common.close")} onClick={() => closeOverlay()}>×</button></header><ProfileForm onSaved={() => closeOverlay()} onCancel={() => closeOverlay()} /></section></div> :
        <div className="start-settings-backdrop"><section className="start-settings" role="dialog" aria-modal="true" aria-labelledby="start-settings-title">
          <header><div><small>PREFERENCES</small><h2 id="start-settings-title">{t("settings.title")}</h2></div><button type="button" aria-label={`${t("settings.title")} · ${t("common.close")}`} onClick={() => closeOverlay()}>×</button></header>
          <fieldset><legend>{t("settings.visuals")}</legend><label>{t("settings.motion")}<input type="checkbox" role="switch" checked={motion.enabled} onChange={(event) => motion.setEnabled(event.target.checked)} /></label><p className="start-settings-note">{t("settings.motionHelp")}</p></fieldset>
          <fieldset><legend>{t("settings.help")}</legend><label>{t("settings.autoGuide")}<input type="checkbox" role="switch" checked={roundGuides.autoEnabled} onChange={(event) => setAutoRoundGuides(event.target.checked)} /></label><p className="start-settings-note">{t("settings.autoGuideHelp")}</p><button className="secondary" type="button" onClick={() => resetSeenRoundGuides()}>{t("settings.resetGuides")}</button></fieldset>
          <fieldset><legend>{t("settings.madeSound")}</legend><label>{t("settings.soundEnabled")}<input type="checkbox" role="switch" checked={sounds.enabled} onChange={(event) => writeMadeSoundPreferences({ ...sounds, enabled: event.target.checked })} /></label><label>{t("settings.soundVolume")}<input type="range" min="0" max="100" value={Math.round(sounds.volume * 100)} onChange={(event) => writeMadeSoundPreferences({ ...sounds, volume: Number(event.target.value) / 100 })} /></label><p className="start-settings-note">{t("settings.soundHelp")}</p></fieldset>
          <button className="primary" type="button" onClick={() => closeOverlay()}>{t("common.close")}</button>
        </section></div>}
    </div>}
  </main>;
}
