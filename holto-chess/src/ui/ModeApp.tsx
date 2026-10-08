import { lazy, Suspense, useEffect, useState } from "react";
import "./gameStyles";
import { invitedRoom } from "./roomInvite";
import { StartScreen, type StartMode } from "./StartScreen";
import { useTranslation } from "../i18n";
import { legalPageFor, usePathname } from "../legal/legalRoute";
import { AccountProvider } from "./AccountProvider";
import { useAccount } from "./useAccount";
import { useEntryIntent } from "./entryIntent";
const loadLocalApp = () => import("./App");
const FxPreview = lazy(() => import("./FxPreview").then((module) => ({ default: module.FxPreview })));
const LocalApp = lazy(() => loadLocalApp().then((module) => ({ default: module.App })));
// Multiplayer (lobby, socket session, online views) is only fetched once the player picks it or opens an invite.
const loadOnlineApp = () => import("./OnlineApp");
const OnlineApp = lazy(() => loadOnlineApp().then((module) => ({ default: module.OnlineApp })));
const DraftPreview = lazy(() => import("./DraftPreview").then((m) => ({ default: m.DraftPreview })));
const ShowdownCardPreview = lazy(() => import("./ShowdownCardPreview").then((m) => ({ default: m.ShowdownCardPreview })));
const AbilityPreview = lazy(() => import("./AbilityPreview").then((m) => ({ default: m.AbilityPreview })));
const ResponsivePreview = import.meta.env.DEV ? lazy(() => import("./ResponsivePreview").then(m => ({ default: m.ResponsivePreview }))) : null;
const MadePreview = import.meta.env.DEV ? lazy(() => import("./MadePreview").then(m => ({ default: m.MadePreview }))) : null;
const RunTwicePreview = import.meta.env.DEV ? lazy(() => import("./RunTwicePreview").then(m => ({ default: m.RunTwicePreview }))) : null;
const FinalAuctionPreview = import.meta.env.DEV ? lazy(() => import("./FinalAuctionPreview").then(m => ({ default: m.FinalAuctionPreview }))) : null;
const AccountPreview = import.meta.env.DEV ? lazy(() => import("./AccountPreview").then(m => ({ default: m.AccountPreview }))) : null;
const EntrancePreview = import.meta.env.DEV ? lazy(() => import("./EntrancePreview").then(m => ({ default: m.EntrancePreview }))) : null;
// Chapters, practice scenarios and the simple bots load only when the guide is opened.
// Privacy policy and terms (/privacy, /terms): public pages, fetched only when visited.
const LegalPage = lazy(() => import("../legal/LegalPage").then((module) => ({ default: module.LegalPage })));
const TutorialApp = lazy(() => import("./tutorial/TutorialApp").then((module) => ({ default: module.TutorialApp })));
export function ModeApp() {
  return <AccountProvider><ModeContent /></AccountProvider>;
}
function ModeContent() {
  const { t } = useTranslation();
  const account = useAccount();
  const entryRequested = useEntryIntent();
  const legalPage = legalPageFor(usePathname());
  const [mode, setMode] = useState<StartMode | null>(() => invitedRoom(typeof location === "undefined" ? "" : location.search) ? "multi" : null);
  useEffect(() => {
    if (mode === "single") void loadLocalApp();
    if (mode === "multi") void loadOnlineApp();
  }, [mode]);
  if (legalPage) return <Suspense fallback={<main className="local-loading-screen"><div><span>PORENA</span><b>{t("common.loading")}</b></div></main>}><LegalPage kind={legalPage} /></Suspense>;
  // Unlisted effect gallery. The SPA fallback serves it at /fx on any deploy, so
  // the same build can be checked without a local dev server.
  if (typeof location !== "undefined" && location.pathname.replace(/\/$/, "") === "/fx") {
    return <Suspense fallback={<main className="local-loading-screen"><div><span>FX PREVIEW</span><b>{t("common.loading")}</b></div></main>}><FxPreview /></Suspense>;
  }
  if (import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("cinemaCards")) return <Suspense fallback={<p>{t("common.loading")}</p>}><ShowdownCardPreview /></Suspense>;
  if (import.meta.env.DEV && location.pathname === "/abilities-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><AbilityPreview /></Suspense>;
  if (MadePreview && location.pathname === "/made-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><MadePreview /></Suspense>;
  if (RunTwicePreview && location.pathname === "/run-twice-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><RunTwicePreview /></Suspense>;
  if (FinalAuctionPreview && location.pathname === "/final-auction-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><FinalAuctionPreview /></Suspense>;
  if (AccountPreview && location.pathname === "/account-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><AccountPreview /></Suspense>;
  if (EntrancePreview && location.pathname === "/entrance-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><EntrancePreview /></Suspense>;
  if (ResponsivePreview && location.pathname === "/responsive-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><ResponsivePreview /></Suspense>;
  if (import.meta.env.DEV && location.pathname === "/draft-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><DraftPreview /></Suspense>;
  if (!account.canEnter || entryRequested || !mode) return <StartScreen onStart={setMode} />;
  if (mode === "tutorial") return <Suspense fallback={<main className="local-loading-screen"><div><span>TUTORIAL</span><b>{t("common.loading")}</b></div></main>}><TutorialApp onHome={() => setMode(null)} onSinglePlay={() => setMode("single")} /></Suspense>;
  return <>{import.meta.env.DEV && <div className="mode-switch"><button className={`secondary ${mode === "multi" ? "locked" : ""}`} onClick={() => setMode("multi")}>{t("mode.multiplayer")}</button><button className={`secondary ${mode === "single" ? "locked" : ""}`} onClick={() => setMode("single")}>{t("mode.single")}</button></div>}{mode === "single" ? <Suspense fallback={<main className="local-loading-screen"><div><span>SINGLE PLAY</span><b>{t("home.singleDescription")}</b></div></main>}><LocalApp onHome={() => setMode(null)} /></Suspense> : <Suspense fallback={<main className="local-loading-screen"><div><span>MULTIPLAYER</span><b>{t("common.loading")}</b></div></main>}><OnlineApp onHome={() => setMode(null)} /></Suspense>}</>;
}
