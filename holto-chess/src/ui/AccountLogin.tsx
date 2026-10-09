import { useState } from "react";
import { useTranslation, type TranslationKey } from "../i18n";
import { normalizeNickname } from "../shared/nickname";
import { useAccount } from "./useAccount";
import { requestEntry } from "./entryIntent";

export function ProfileForm({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void }) {
  const { t } = useTranslation();
  const account = useAccount();
  const [nickname, setNickname] = useState(account.user?.displayName ?? "");
  return <form className="account-profile-form" onSubmit={event => {
    event.preventDefault();
    if (!account.busy) void account.saveProfile(nickname).then(saved => { if (saved) onSaved?.(); });
  }}>
    <label htmlFor="account-nickname">{t("profile.nickname")}</label>
    <input id="account-nickname" autoComplete="nickname" spellCheck={false} required value={nickname} disabled={account.busy} aria-describedby="account-nickname-help" onChange={event => setNickname(event.target.value)} />
    <small id="account-nickname-help">{t("profile.rules")}</small>
    {account.user?.displayName && <p>{t("profile.futureRooms")}</p>}
    {account.error && <p className="account-error" role="alert">{t(account.error as TranslationKey)}</p>}
    <div className="account-profile-actions"><button type="submit" className="account-primary" disabled={account.busy || !normalizeNickname(nickname)}>{t(account.busy ? "profile.saving" : "profile.save")}</button>{onCancel && <button type="button" disabled={account.busy} onClick={onCancel}>{t("common.cancel")}</button>}</div>
  </form>;
}

export function AccountLogin({ onProfile }: { onProfile?: () => void }) {
  const { t } = useTranslation();
  const account = useAccount();
  if (account.canEnter) return <aside className="start-account" aria-label={t("auth.account")} aria-busy={account.busy}>
    <span className="start-account-name">{account.user?.displayName ?? t("auth.guest")}</span>
    {account.user ? <><button type="button" onClick={onProfile}>{t("profile.edit")}</button><button type="button" disabled={account.busy} onClick={() => void account.logout()}>{t("auth.logout")}</button></> : <button type="button" onClick={account.leaveGuest}>{t("auth.switchLogin")}</button>}
    {account.error && <small role="alert">{t(account.error as TranslationKey)}</small>}
  </aside>;
  if (account.status === "authenticated") return <section className="start-login-panel" aria-labelledby="profile-title">
    <p className="account-eyebrow">PORENA PROFILE</p>
    <h2 id="profile-title">{t("profile.setup")}</h2>
    <p className="account-intro">{t("profile.setupHelp")}</p>
    <ProfileForm />
    <button type="button" className="account-back" disabled={account.busy} onClick={() => void account.logout()}>{t("auth.switchLogin")}</button>
  </section>;
  if (account.status === "loading") return <p className="account-intro" role="status">{t("auth.loading")}</p>;
  return <section className="start-login-choices" aria-label={t("auth.choose")} aria-busy={account.busy}>
    <div className="account-login-options">
      {!account.embedded ? <a className="account-primary account-google" href="/api/auth/google/start" onClick={requestEntry}><span className="account-google-mark" aria-hidden="true">G</span>{t("auth.google")}</a> : <p className="account-embedded-note">{t("auth.embedded")}</p>}
      <button type="button" onClick={() => { requestEntry(); account.chooseGuest(); }} disabled={account.busy}>{t("auth.guestLogin")}<span aria-hidden="true">→</span></button>
    </div>
    {account.error && <p className="account-error" role="alert">{t(account.error as TranslationKey)}</p>}
    {account.status === "unavailable" && <button type="button" className="account-back" disabled={account.busy} onClick={() => void account.refresh()}>{t("connection.retry")}</button>}
  </section>;
}
