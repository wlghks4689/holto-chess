import { lazy, Suspense, useEffect, useState } from "react";
import { OnlineApp } from "./OnlineApp";
import { invitedRoom } from "./roomInvite";
import { StartScreen, type StartMode } from "./StartScreen";
import { useTranslation } from "../i18n";
const loadLocalApp = () => import("./App");
const FxPreview = lazy(() => import("./FxPreview").then((module) => ({ default: module.FxPreview })));
const LocalApp = lazy(() => loadLocalApp().then((module) => ({ default: module.App })));
const DraftPreview = lazy(() => import("./DraftPreview").then((m) => ({ default: m.DraftPreview })));
const ShowdownCardPreview = lazy(() => import("./ShowdownCardPreview").then((m) => ({ default: m.ShowdownCardPreview })));
// Chapters, practice scenarios and the simple bots load only when the guide is opened.
const TutorialApp = lazy(() => import("./tutorial/TutorialApp").then((module) => ({ default: module.TutorialApp })));
export function ModeApp() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<StartMode | null>(() => invitedRoom(typeof location === "undefined" ? "" : location.search) ? "multi" : null);
  useEffect(() => {
    if (mode === "single") void loadLocalApp();
  }, [mode]);
  // Unlisted effect gallery. The SPA fallback serves it at /fx on any deploy, so
  // the same build can be checked without a local dev server.
  if (typeof location !== "undefined" && location.pathname.replace(/\/$/, "") === "/fx") {
    return <Suspense fallback={<main className="local-loading-screen"><div><span>FX PREVIEW</span><b>{t("common.loading")}</b></div></main>}><FxPreview /></Suspense>;
  }
  if (import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("cinemaCards")) return <Suspense fallback={<p>{t("common.loading")}</p>}><ShowdownCardPreview /></Suspense>;
  if (import.meta.env.DEV && location.pathname === "/draft-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><DraftPreview /></Suspense>;
  if (!mode) return <StartScreen onStart={setMode} />;
  if (mode === "tutorial") return <Suspense fallback={<main className="local-loading-screen"><div><span>TUTORIAL</span><b>{t("common.loading")}</b></div></main>}><TutorialApp onHome={() => setMode(null)} onSinglePlay={() => setMode("single")} /></Suspense>;
  return <>{import.meta.env.DEV && <div className="mode-switch"><button className={`secondary ${mode === "multi" ? "locked" : ""}`} onClick={() => setMode("multi")}>{t("mode.multiplayer")}</button><button className={`secondary ${mode === "single" ? "locked" : ""}`} onClick={() => setMode("single")}>{t("mode.single")}</button></div>}{mode === "single" ? <Suspense fallback={<main className="local-loading-screen"><div><span>SINGLE PLAY</span><b>{t("home.singleDescription")}</b></div></main>}><LocalApp onHome={() => setMode(null)} /></Suspense> : <OnlineApp onHome={() => setMode(null)} />}</>;
}
