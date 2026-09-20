import { lazy, Suspense, useEffect, useState } from "react";
import { OnlineApp } from "./OnlineApp";
import { StartScreen } from "./StartScreen";
const loadLocalApp = () => import("./App");
const FxPreview = lazy(() => import("./FxPreview").then((module) => ({ default: module.FxPreview })));
const LocalApp = lazy(() => loadLocalApp().then((module) => ({ default: module.App })));
const DraftPreview = lazy(() => import("./DraftPreview").then((m) => ({ default: m.DraftPreview })));
export function ModeApp() {
  const [local, setLocal] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV && started) void loadLocalApp();
  }, [started]);
  // Unlisted effect gallery. The SPA fallback serves it at /fx on any deploy, so
  // the same build can be checked without a local dev server.
  if (typeof location !== "undefined" && location.pathname.replace(/\/$/, "") === "/fx") {
    return <Suspense fallback={<main className="local-loading-screen"><div><span>FX PREVIEW</span><b>이펙트를 불러오는 중입니다.</b></div></main>}><FxPreview /></Suspense>;
  }
  if (import.meta.env.DEV && location.pathname === "/draft-preview") return <Suspense fallback={<p>드래프트 준비 중…</p>}><DraftPreview /></Suspense>;
  if (!started) return <StartScreen onStart={() => setStarted(true)} />;
  return <>{import.meta.env.DEV && <div className="mode-switch"><button className={`secondary ${!local ? "locked" : ""}`} onClick={() => setLocal(false)}>ONLINE</button><button className={`secondary ${local ? "locked" : ""}`} onClick={() => setLocal(true)}>LOCAL / DEV simulation</button></div>}{import.meta.env.DEV && local ? <Suspense fallback={<main className="local-loading-screen"><div><span>LOCAL SIMULATION</span><b>로컬 게임을 준비하고 있습니다.</b></div></main>}><LocalApp /></Suspense> : <OnlineApp onHome={() => setStarted(false)} />}</>;
}
