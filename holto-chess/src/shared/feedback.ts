// Contract shared by the start-screen feedback form, the Worker that stores it and the admin inbox.
export const FEEDBACK_CATEGORIES = ["feedback", "bug", "inquiry", "support"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_STATUSES = ["unread", "read", "archived"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Counted the way a <textarea maxLength> counts: UTF-16 code units. */
export const FEEDBACK_MAX_LENGTH = 500;
export const FEEDBACK_EMAIL_MAX_LENGTH = 254;

export interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  /** Optional reply address. Only accepted together with `consent: true`. */
  contactEmail?: string;
  consent?: boolean;
  locale?: string;
  /** Honeypot: hidden from people, so any value means an automated submission. */
  website?: string;
}

export interface FeedbackItem {
  id: number;
  category: FeedbackCategory;
  message: string;
  contactEmail: string | null;
  locale: string | null;
  userAgent: string | null;
  status: FeedbackStatus;
  createdAt: number;
  updatedAt: number;
}

export const isFeedbackCategory = (value: unknown): value is FeedbackCategory =>
  typeof value === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
export const isFeedbackStatus = (value: unknown): value is FeedbackStatus =>
  typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
// Deliberately loose: one "@", a dotted domain and no whitespace. Deliverability is the reply's problem.
export const isContactEmail = (value: string) =>
  value.length <= FEEDBACK_EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export type FeedbackValidation =
  | { ok: true; value: { category: FeedbackCategory; message: string; contactEmail: string | null; locale: string | null } }
  | { ok: false; error: "category" | "message" | "email" | "consent" };

export function validateFeedback(input: unknown): FeedbackValidation {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (!isFeedbackCategory(body.category)) return { ok: false, error: "category" };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > FEEDBACK_MAX_LENGTH) return { ok: false, error: "message" };
  const email = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
  if (email && !isContactEmail(email)) return { ok: false, error: "email" };
  if (email && body.consent !== true) return { ok: false, error: "consent" };
  const locale = typeof body.locale === "string" && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(body.locale) ? body.locale : null;
  return { ok: true, value: { category: body.category, message, contactEmail: email || null, locale } };
}
