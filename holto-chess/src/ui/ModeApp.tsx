import { lazy, Suspense, useEffect, useState } from "react";
import { OnlineApp } from "./OnlineApp";
import { invitedRoom } from "./roomInvite";
import { StartScreen, type StartMode } from "./StartScreen";
const loadLocalApp = () => import("./App");
const FxPreview = lazy(() => import("./FxPreview").then((module) => ({ default: module.FxPreview })));
const LocalApp = lazy(() => loadLocalApp().then((module) => ({ default: module.App })));
const DraftPreview = lazy(() => import("./DraftPreview").then((m) => ({ default: m.DraftPreview })));
export function ModeApp() {
  const [mode, setMode] = useState<StartMode | null>(() => invitedRoom(typeof location === "undefined" ? "" : location.search) ? "multi" : null);
  useEffect(() => {
    if (mode === "single") void loadLocalApp();
  }, [mode]);
  // Unlisted effect gallery. The SPA fallback serves it at /fx on any deploy, so
  // the same build can be checked without a local dev server.
  if (typeof location !== "undefined" && location.pathname.replace(/\/$/, "") === "/fx") {
    return <Suspense fallback={<main className="local-loading-screen"><div><span>FX PREVIEW</span><b>이펙트를 불러오는 중입니다.</b></div></main>}><FxPreview /></Suspense>;
  }
  if (import.meta.env.DEV && location.pathname === "/draft-preview") return <Suspense fallback={<p>드래프트 준비 중…</p>}><DraftPreview /></Suspense>;
  if (!mode) return <StartScreen onStart={setMode} />;
  return <>{import.meta.env.DEV && <div className="mode-switch"><button className={`secondary ${mode === "multi" ? "locked" : ""}`} onClick={() => setMode("multi")}>MULTIPLAYER</button><button className={`secondary ${mode === "single" ? "locked" : ""}`} onClick={() => setMode("single")}>SINGLE / AI</button></div>}{mode === "single" ? <Suspense fallback={<main className="local-loading-screen"><div><span>SINGLE PLAY</span><b>AI 아레나를 준비하고 있습니다.</b></div></main>}><LocalApp onHome={() => setMode(null)} /></Suspense> : <OnlineApp onHome={() => setMode(null)} />}</>;
}
