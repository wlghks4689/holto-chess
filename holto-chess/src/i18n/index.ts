import { useSyncExternalStore } from "react";
import { enUS } from "./locales/en-US";
import { koKR } from "./locales/ko-KR";

export const LOCALES = ["ko-KR", "en-US"] as const;
export type Locale = (typeof LOCALES)[number];
export type TranslationKey = keyof typeof koKR;
export type TranslationParams = Record<string, string | number>;
export const LOCALE_STORAGE_KEY = "porena.locale";

function supportedLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "ko" || normalized.startsWith("ko-")) return "ko-KR";
  if (normalized === "en" || normalized.startsWith("en-")) return "en-US";
  return undefined;
}

export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const locale = supportedLocale(language);
    if (locale) return locale;
  }
  return "en-US";
}

function getInitialLocale(): Locale {
  if (typeof document === "undefined") return "ko-KR";
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) return supportedLocale(stored) ?? "en-US";
  } catch { /* Storage can be disabled. */ }
  return detectLocale(typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
}

let locale: Locale = getInitialLocale();
const listeners = new Set<() => void>();
const resources = { "ko-KR": koKR, "en-US": enUS } as const;

function applyDocumentLocale(value: Locale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = value === "ko-KR" ? "ko" : "en";
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", resources[value]["document.description"]);
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute("content", resources[value]["document.description"]);
  }
}
applyDocumentLocale(locale);

export function getLocale(): Locale { return locale; }

export function setLocale(value: Locale) {
  const changed = locale !== value;
  locale = value;
  applyDocumentLocale(value);
  try { localStorage.setItem(LOCALE_STORAGE_KEY, value); } catch { /* The choice remains active for this tab. */ }
  if (changed) for (const listener of listeners) listener();
}

export function initializeLocaleDocument() { applyDocumentLocale(locale); }

export function t(key: TranslationKey, params: TranslationParams = {}): string {
  const template = resources[locale][key] ?? koKR[key];
  return template.replace(/\{([a-zA-Z][\w]*)\}/g, (match, name: string) => name in params ? String(params[name]) : match);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key !== LOCALE_STORAGE_KEY || !event.newValue) return;
  const next = supportedLocale(event.newValue) ?? "en-US";
  if (locale === next) return;
  locale = next;
  applyDocumentLocale(next);
  for (const listener of listeners) listener();
});

export function useTranslation() {
  const current = useSyncExternalStore<Locale>(subscribe, getLocale, () => "ko-KR");
  return { locale: current, setLocale, t: (key: TranslationKey, params?: TranslationParams) => {
    const template = resources[current][key] ?? koKR[key];
    return template.replace(/\{([a-zA-Z][\w]*)\}/g, (match, name: string) => name in (params ?? {}) ? String(params![name]) : match);
  } };
}
