import { lazy, Suspense, useState } from "react";
import { OnlineApp } from "./OnlineApp";
const LocalApp = lazy(() => import("./App").then((m) => ({ default: m.App })));
export function ModeApp() {
  const [local, setLocal] = useState(false);
  return <><div className="mode-switch"><button className={`secondary ${!local ? "locked" : ""}`} onClick={() => setLocal(false)}>ONLINE</button><button className={`secondary ${local ? "locked" : ""}`} onClick={() => setLocal(true)}>LOCAL / DEV simulation</button></div>{local ? <Suspense fallback={<p>로컬 게임 준비 중…</p>}><LocalApp /></Suspense> : <OnlineApp />}</>;
}
