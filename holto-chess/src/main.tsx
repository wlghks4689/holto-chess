import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ModeApp } from "./ui/ModeApp";
import { initializeLocaleDocument } from "./i18n";
import { startPlatform } from "./platform/runtime";
import { PlatformNotice } from "./ui/PlatformNotice";
import "./ui/styles.css";
import "./ui/online.css";
import "./ui/responsive.css";

// A tab opened before a deploy still points at the previous build's chunk names, which no longer exist.
// Reload once onto the new build instead of leaving a blank screen; the timestamp guard prevents a reload loop.
const RELOAD_KEY = "porena.chunkReloadAt";
window.addEventListener("vite:preloadError", (event) => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { return; /* Storage blocked: no loop guard, so leave the error to the normal failure path. */ }
  event.preventDefault();
  location.reload();
});

initializeLocaleDocument();
// Web: no-op. Discord Activity: SDK handshake in the background; the game never waits for it.
void startPlatform();
createRoot(document.getElementById("root")!).render(<StrictMode><ModeApp /><PlatformNotice /></StrictMode>);
