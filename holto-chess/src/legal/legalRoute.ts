import { useSyncExternalStore, type MouseEvent } from "react";
import { currentPlatform } from "../platform/runtime";
import type { LegalKind } from "./legalTypes";

/**
 * /privacy and /terms are client routes: the Worker answers any page path with the app shell, so a direct
 * visit or a refresh renders them too. Moving between them and the start screen uses the History API, so the
 * browser's back and forward buttons work and a Discord Activity never reloads (and never loses its launch query).
 */
export const LEGAL_PATHS: Record<LegalKind, string> = { privacy: "/privacy", terms: "/terms" };

export function legalPageFor(pathname: string): LegalKind | null {
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  if (path === LEGAL_PATHS.privacy) return "privacy";
  if (path === LEGAL_PATHS.terms) return "terms";
  return null;
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => { listeners.delete(listener); window.removeEventListener("popstate", listener); };
}
const pathname = () => location.pathname;

export function usePathname(): string {
  return useSyncExternalStore(subscribe, pathname, () => "/");
}

/** Discord passes frame_id/instance_id in the query string; the web build has nothing worth carrying over. */
function keptSearch(): string {
  return currentPlatform().kind === "discord" ? location.search : "";
}

export function navigate(path: string): void {
  history.pushState(null, "", `${path}${keptSearch()}`);
  window.scrollTo(0, 0);
  for (const listener of listeners) listener();
}

/** onClick for an <a href> inside the app: plain clicks stay in the page, modified clicks open a tab as usual. */
export function followInApp(path: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  };
}
