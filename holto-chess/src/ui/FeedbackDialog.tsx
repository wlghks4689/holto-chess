import { useId, useState, type FormEvent } from "react";
import { FEEDBACK_CATEGORIES, FEEDBACK_EMAIL_MAX_LENGTH, FEEDBACK_MAX_LENGTH, type FeedbackCategory, type FeedbackSubmission } from "../shared/feedback";
import { useTranslation, type TranslationKey } from "../i18n";
import { endpoints } from "../network/endpoints";
import { followInApp, LEGAL_PATHS } from "../legal/legalRoute";
import { currentPlatform } from "../platform/runtime";
import "./feedback.css";

type SendError = "rateLimited" | "email" | "consent" | "generic";

/** Start-screen form that replaces the old mailto link: messages go to the admin inbox, never to a public address. */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { locale, t } = useTranslation();
  const id = useId();
  const [category, setCategory] = useState<FeedbackCategory>("feedback");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<SendError | null>(null);
  const wantsReply = email.trim() !== "";
  const ready = message.trim() !== "" && (!wantsReply || consent) && state === "idle";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setState("sending"); setError(null);
    const body: FeedbackSubmission = { category, message, locale, website, ...(wantsReply ? { contactEmail: email.trim(), consent } : {}) };
    try {
      const response = await fetch(endpoints.feedback(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.ok) { setState("sent"); return; }
      const reason = response.status === 429 ? "rateLimited" : ((await response.json().catch(() => ({}))) as { error?: string }).error;
      setError(reason === "rateLimited" || reason === "email" || reason === "consent" ? reason : "generic");
    } catch { setError("generic"); }
    setState("idle");
  };
  const reset = () => { setMessage(""); setEmail(""); setConsent(false); setError(null); setState("idle"); };

  return <div className="feedback-backdrop"><section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
    <header><div><small>FEEDBACK &amp; CONTACT</small><h2 id={`${id}-title`}>{t("feedback.title")}</h2></div><button type="button" aria-label={`${t("feedback.title")} · ${t("common.close")}`} onClick={onClose}>×</button></header>
    {state === "sent" ? <div className="feedback-sent" role="status">
      <strong>{t("feedback.sentTitle")}</strong>
      <p>{t("feedback.sentBody")}</p>
      <div className="feedback-actions"><button className="secondary" type="button" onClick={reset}>{t("feedback.sendAnother")}</button><button className="primary" type="button" onClick={onClose}>{t("common.close")}</button></div>
    </div> : <form onSubmit={submit} noValidate>
      <p className="feedback-intro">{t("feedback.intro")}</p>
      <fieldset className="feedback-categories">
        <legend>{t("feedback.categoryLabel")}</legend>
        {FEEDBACK_CATEGORIES.map((value) => <label key={value} data-category={value}>
          {/* The start screen's focus trap runs before this lazy chunk mounts, so the form places focus itself. */}
          <input type="radio" name={`${id}-category`} value={value} checked={category === value} autoFocus={value === "feedback"} onChange={() => setCategory(value)} />
          <span>{t(`feedback.category.${value}` as TranslationKey)}</span>
        </label>)}
      </fieldset>
      <p className="feedback-hint">{t(`feedback.hint.${category}` as TranslationKey)}</p>
      <label className="feedback-field" htmlFor={`${id}-message`}>{t("feedback.message")}</label>
      <textarea id={`${id}-message`} value={message} maxLength={FEEDBACK_MAX_LENGTH} rows={7} required aria-describedby={`${id}-count ${id}-sensitive`}
        placeholder={t(`feedback.placeholder.${category}` as TranslationKey)} onChange={(event) => setMessage(event.target.value)} />
      <div className="feedback-meta"><span id={`${id}-sensitive`}>{t("feedback.sensitive")}</span><span id={`${id}-count`} aria-live="polite" data-full={message.length >= FEEDBACK_MAX_LENGTH || undefined}>{t("feedback.count", { count: message.length, max: FEEDBACK_MAX_LENGTH })}</span></div>
      <label className="feedback-field" htmlFor={`${id}-email`}>{t("feedback.email")}</label>
      <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" maxLength={FEEDBACK_EMAIL_MAX_LENGTH} value={email} aria-describedby={`${id}-email-help`} onChange={(event) => setEmail(event.target.value)} />
      <p id={`${id}-email-help`} className="feedback-help">{t("feedback.emailHelp")}</p>
      {wantsReply && <label className="feedback-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{t("feedback.consent")}</span></label>}
      {/* A new tab keeps the draft. Inside Discord, popups are not reliable, so the page opens in place. */}
      <p className="feedback-help feedback-privacy">{currentPlatform().kind === "discord"
        ? <a href={LEGAL_PATHS.privacy} onClick={followInApp(LEGAL_PATHS.privacy)}>{t("feedback.privacyLink")}</a>
        : <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener">{t("feedback.privacyLink")}</a>}</p>
      {/* Honeypot: off-screen and skipped by keyboard and screen readers. People leave it empty. */}
      <input className="feedback-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(event) => setWebsite(event.target.value)} />
      {error && <p className="feedback-error" role="alert">{t(`feedback.error.${error}` as TranslationKey)}</p>}
      <div className="feedback-actions"><button className="primary" type="submit" disabled={!ready}>{state === "sending" ? t("feedback.sending") : t("feedback.submit")}</button></div>
    </form>}
  </section></div>;
}
