import { describe, expect, it } from "vitest";
import { FEEDBACK_MAX_LENGTH, validateFeedback } from "./feedback";

describe("validateFeedback", () => {
  it("trims the message and drops an empty email", () => {
    expect(validateFeedback({ category: "feedback", message: "  좋아요 ", contactEmail: " ", locale: "ko-KR" }))
      .toEqual({ ok: true, value: { category: "feedback", message: "좋아요", contactEmail: null, locale: "ko-KR" } });
  });
  it("counts length the way the textarea does", () => {
    expect(validateFeedback({ category: "bug", message: "a".repeat(FEEDBACK_MAX_LENGTH) }).ok).toBe(true);
    expect(validateFeedback({ category: "bug", message: "a".repeat(FEEDBACK_MAX_LENGTH + 1) })).toEqual({ ok: false, error: "message" });
  });
  it("requires consent for a reply address and ignores a malformed locale", () => {
    expect(validateFeedback({ category: "inquiry", message: "?", contactEmail: "me@example.com" })).toEqual({ ok: false, error: "consent" });
    const accepted = validateFeedback({ category: "inquiry", message: "?", contactEmail: "me@example.com", consent: true, locale: "<script>" });
    expect(accepted).toEqual({ ok: true, value: { category: "inquiry", message: "?", contactEmail: "me@example.com", locale: null } });
  });
  it("rejects unknown categories and non-object bodies", () => {
    expect(validateFeedback({ category: "admin", message: "x" })).toEqual({ ok: false, error: "category" });
    expect(validateFeedback(null)).toEqual({ ok: false, error: "category" });
  });
});
