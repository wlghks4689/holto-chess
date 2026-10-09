// Shape of the privacy policy and terms pages. Text may carry inline links written as [label](href).

export type LegalKind = "privacy" | "terms";
export type LegalBlock =
  | string
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } };
export type LegalSection = { id: string; title: string; body: LegalBlock[] };
export type LegalDocument = { title: string; intro: string[]; sections: LegalSection[] };

/** Page chrome shared by both documents in one language. */
export type LegalChrome = {
  siteTitle: (kind: LegalKind) => string;
  effective: string;
  home: string;
  contents: string;
  other: Record<LegalKind, string>;
  language: string;
};

export const LEGAL_EFFECTIVE_DATE = "2026-10-09";
export const OPERATOR_NAME = "김지환";
export const CONTACT_EMAIL = "wlghks4689@gmail.com";
export const SITE_URL = "https://porena.kr";
export const GA_MEASUREMENT_ID = "G-34CRPR69CF";
export const MINIMUM_AGE = 14;
