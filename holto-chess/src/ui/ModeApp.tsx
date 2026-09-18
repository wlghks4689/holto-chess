import { lazy, Suspense, useEffect, useState } from "react";
import { OnlineApp } from "./OnlineApp";
import { StartScreen } from "./StartScreen";
const loadLocalApp = () => import("./App");
const LocalApp = lazy(() => loadLocalApp().then((module) => ({ default: module.App })));
export function ModeApp() {
  const [local, setLocal] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV && started) void loadLocalApp();
  }, [started]);
  if (!started) return <StartScreen onStart={() => setStarted(true)} />;
  return <>{import.meta.env.DEV && <div className="mode-switch"><button className={`secondary ${!local ? "locked" : ""}`} onClick={() => setLocal(false)}>ONLINE</button><button className={`secondary ${local ? "locked" : ""}`} onClick={() => setLocal(true)}>LOCAL / DEV simulation</button></div>}{import.meta.env.DEV && local ? <Suspense fallback={<main className="local-loading-screen"><div><span>LOCAL SIMULATION</span><b>로컬 게임을 준비하고 있습니다.</b></div></main>}><LocalApp /></Suspense> : <OnlineApp />}</>;
}
