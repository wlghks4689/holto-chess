import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { enUS } from "../i18n/locales/en-US";
import { koKR } from "../i18n/locales/ko-KR";
import { FEEDBACK_RETENTION_MS, FINISHED_ROOM_LIFETIME_MS, LOBBY_IDLE_LIFETIME_MS, ROOM_LIFETIME_MS } from "../shared/retention";
import { privacyEn, termsEn } from "./content.en";
import { privacyKo, termsKo } from "./content.ko";
import { LanguageSwitch, LegalView } from "./LegalPage";
import { LEGAL_PATHS, legalPageFor } from "./legalRoute";
import type { LegalDocument } from "./legalTypes";

const text = (doc: LegalDocument) => JSON.stringify(doc);

describe("legal routes", () => {
  it("recognises /privacy and /terms, with or without a trailing slash", () => {
    expect(legalPageFor("/privacy")).toBe("privacy");
    expect(legalPageFor("/terms/")).toBe("terms");
    expect(legalPageFor("/PRIVACY")).toBe("privacy");
    expect(LEGAL_PATHS).toEqual({ privacy: "/privacy", terms: "/terms" });
  });

  it("leaves every other path to the game", () => {
    for (const path of ["/", "/fx", "/privacy-policy", "/terms/old", "/api/feedback", "/admin"]) expect(legalPageFor(path)).toBeNull();
  });
});

describe("legal pages", () => {
  it("render in Korean with one h1, section headings and the language switch", () => {
    const html = renderToStaticMarkup(createElement(LegalView, { kind: "privacy", locale: "ko-KR", onLocale: () => undefined }));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<h1>개인정보처리방침</h1>");
    expect(html).toContain("2026-10-09");
    expect(html).toContain('aria-pressed="true">한국어');
    expect(html).toContain('href="mailto:wlghks4689@gmail.com"');
    expect(html).toContain('href="/terms"');
    expect(html.match(/<h2 id=/g)!.length).toBe(privacyKo.sections.length);
  });

  it("render in English", () => {
    const html = renderToStaticMarkup(createElement(LegalView, { kind: "terms", locale: "en-US", onLocale: () => undefined }));
    expect(html).toContain("<h1>Terms of Service</h1>");
    expect(html).toContain('aria-pressed="true">English');
    expect(html).toContain("2. Not real-money gambling");
  });

  it("switch language through the app-wide setting", () => {
    const onLocale = vi.fn();
    const view = LanguageSwitch({ locale: "ko-KR", onLocale, label: "언어" });
    const buttons: { props: { lang?: string; onClick?: () => void } }[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const element = node as { type?: unknown; props?: { children?: unknown; lang?: string; onClick?: () => void } };
      if (element.type === "button" && element.props) buttons.push(element as { props: { lang?: string; onClick?: () => void } });
      walk(element.props?.children);
    };
    walk(view);
    expect(buttons.map((button) => button.props.lang)).toEqual(["ko", "en"]);
    buttons.find((button) => button.props.lang === "en")!.props.onClick!();
    expect(onLocale).toHaveBeenCalledWith("en-US");
    buttons.find((button) => button.props.lang === "ko")!.props.onClick!();
    expect(onLocale).toHaveBeenLastCalledWith("ko-KR");
  });

  it("open external links in a new tab and keep in-app links in the page", () => {
    const html = renderToStaticMarkup(createElement(LegalView, { kind: "privacy", locale: "en-US", onLocale: () => undefined }));
    expect(html).toContain('href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('href="https://discord.com/privacy" target="_blank"');
    expect(html).not.toMatch(/href="\/[^"]*" target=/);
  });
});

describe("policy text matches the code", () => {
  it("quotes the retention periods the Worker enforces", () => {
    expect([LOBBY_IDLE_LIFETIME_MS, ROOM_LIFETIME_MS, FINISHED_ROOM_LIFETIME_MS, FEEDBACK_RETENTION_MS]).toEqual([30 * 60_000, 24 * 3_600_000, 15 * 60_000, 90 * 86_400_000]);
    for (const needle of ["30분", "24시간", "15분", "90일", "14개월"]) expect(text(privacyKo)).toContain(needle);
    for (const needle of ["30 minutes", "24 hours", "15 minutes", "90 days", "14 months"]) expect(text(privacyEn)).toContain(needle);
  });

  it("states the operator, contact, minimum age, GA4 property and what Discord data is not collected", () => {
    for (const doc of [privacyKo, privacyEn]) {
      expect(text(doc)).toContain("김지환");
      expect(text(doc)).toContain("wlghks4689@gmail.com");
      expect(text(doc)).toContain("G-34CRPR69CF");
      expect(text(doc)).toContain("frame_id");
    }
    expect(text(privacyKo)).toContain("만 14세");
    expect(text(termsKo)).toContain("만 14세");
    expect(text(privacyEn)).toContain("aged 14 and over");
    expect(text(termsEn)).toContain("aged 14 and over");
    expect(text(privacyKo)).toContain("IP 주소를 저장하지 않습니다");
    expect(text(privacyEn)).toContain("does not store IP addresses");
  });

  it("keeps the feedback consent text in line with the retention policy", () => {
    expect(koKR["feedback.consent"]).toContain("처리 목적이 끝나면 삭제");
    expect(koKR["feedback.consent"]).toContain("90일");
    expect(enUS["feedback.consent"]).toContain("90 days");
    expect(koKR["legal.privacy"]).toBe("개인정보처리방침");
    expect(enUS["legal.terms"]).toBe("Terms of Service");
  });
});
