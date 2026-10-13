import { lazy, Suspense, useEffect, useState } from "react";
import { analytics } from "../analytics/events";
import { canonicalFor } from "../shared/searchPages";
import "./gameStyles";
import { invitedRoom } from "./roomInvite";
import { StartScreen, type StartMode } from "./StartScreen";
import { useTranslation } from "../i18n";
import { legalPageFor, navigate, usePathname } from "../legal/legalRoute";
import { activeSession } from "./sessionStore";
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
const RunThreePreview = import.meta.env.DEV ? lazy(() => import("./RunThreePreview").then(m => ({ default: m.RunThreePreview }))) : null;
const FinalAuctionPreview = import.meta.env.DEV ? lazy(() => import("./FinalAuctionPreview").then(m => ({ default: m.FinalAuctionPreview }))) : null;
const AccountPreview = import.meta.env.DEV ? lazy(() => import("./AccountPreview").then(m => ({ default: m.AccountPreview }))) : null;
const EntrancePreview = import.meta.env.DEV ? lazy(() => import("./EntrancePreview").then(m => ({ default: m.EntrancePreview }))) : null;
const PhasePreview = import.meta.env.DEV ? lazy(() => import("./PhasePreview").then(m => ({ default: m.PhasePreview }))) : null;
// Chapters, practice scenarios and the simple bots load only when the guide is opened.
// Privacy policy and terms (/privacy, /terms): public pages, fetched only when visited.
const LegalPage = lazy(() => import("../legal/LegalPage").then((module) => ({ default: module.LegalPage })));
const RankingPage = lazy(() => import("./RankingPage").then((module) => ({ default: module.RankingPage })));
const TutorialApp = lazy(() => import("./tutorial/TutorialApp").then((module) => ({ default: module.TutorialApp })));
export function ModeApp() {
  return <AccountProvider><ModeContent /></AccountProvider>;
}
function ModeContent() {
  const { t } = useTranslation();
  const account = useAccount();
  const entryRequested = useEntryIntent();
  const pathname = usePathname();
  const legalPage = legalPageFor(pathname);
  useEffect(() => {
    const href = canonicalFor(pathname);
    const current = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!href) { current?.remove(); return; }
    const link = current ?? document.createElement("link");
    link.rel = "canonical"; link.href = href;
    if (!current) document.head.append(link);
  }, [pathname]);
  const [landingVisit] = useState(() => crypto.randomUUID());
  useEffect(() => { if (pathname === "/") analytics.track("landing_view", {}, landingVisit); }, [pathname, landingVisit]);
  // A reload (F5) returns this tab to the game it was playing before the menu or login entrance can intervene.
  // The seat token alone reconnects; the account check only guards new seats.
  const [restoring] = useState(() => typeof location !== "undefined" && !!activeSession());
  const [mode, setMode] = useState<StartMode | null>(() => restoring || invitedRoom(typeof location === "undefined" ? "" : location.search) ? "multi" : null);
  useEffect(() => {
    if (mode === "single") void loadLocalApp();
    if (mode === "multi") void loadOnlineApp();
  }, [mode]);
  if (pathname.replace(/\/+$/, "").toLowerCase() === "/ranking") return <Suspense fallback={<main className="local-loading-screen"><div><span>RANKING</span><b>{t("common.loading")}</b></div></main>}><RankingPage onBack={() => { setMode(null); navigate("/"); }} /></Suspense>;
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
  if (RunThreePreview && location.pathname === "/run-three-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><RunThreePreview /></Suspense>;
  if (FinalAuctionPreview && location.pathname === "/final-auction-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><FinalAuctionPreview /></Suspense>;
  if (AccountPreview && location.pathname === "/account-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><AccountPreview /></Suspense>;
  if (EntrancePreview && location.pathname === "/entrance-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><EntrancePreview /></Suspense>;
  if (PhasePreview && location.pathname === "/phase-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><PhasePreview /></Suspense>;
  if (ResponsivePreview && location.pathname === "/responsive-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><ResponsivePreview /></Suspense>;
  if (import.meta.env.DEV && location.pathname === "/draft-preview") return <Suspense fallback={<p>{t("common.loading")}</p>}><DraftPreview /></Suspense>;
  if (!mode || (!(restoring && mode === "multi") && (!account.canEnter || entryRequested))) return <StartScreen onStart={(selectedMode) => { analytics.track("play_cta_click", { selected_mode: selectedMode }); setMode(selectedMode); }} />;
  if (mode === "tutorial") return <Suspense fallback={<main className="local-loading-screen"><div><span>TUTORIAL</span><b>{t("common.loading")}</b></div></main>}><TutorialApp onHome={() => setMode(null)} onSinglePlay={() => setMode("single")} /></Suspense>;
  return <>{import.meta.env.DEV && <div className="mode-switch"><button className={`secondary ${mode === "multi" ? "locked" : ""}`} onClick={() => setMode("multi")}>{t("mode.multiplayer")}</button><button className={`secondary ${mode === "single" ? "locked" : ""}`} onClick={() => setMode("single")}>{t("mode.single")}</button></div>}{mode === "single" && account.status === "authenticated" ? <Suspense fallback={<main className="local-loading-screen"><div><span>SINGLE PLAY</span><b>{t("common.loading")}</b></div></main>}><OnlineApp solo onHome={() => setMode(null)} /></Suspense> : mode === "single" ? <Suspense fallback={<main className="local-loading-screen"><div><span>SINGLE PLAY</span><b>{t("home.singleDescription")}</b></div></main>}><LocalApp onHome={() => setMode(null)} /></Suspense> : <Suspense fallback={<main className="local-loading-screen"><div><span>MULTIPLAYER</span><b>{t("common.loading")}</b></div></main>}><OnlineApp onHome={() => setMode(null)} /></Suspense>}</>;
}
