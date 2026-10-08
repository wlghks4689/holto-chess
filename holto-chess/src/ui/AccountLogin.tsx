import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";
import { currentPlatform } from "../platform/runtime";

export function AccountLogin() {
  const { t } = useTranslation();
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("auth") === "failed");
  // Google login is a first-party web flow, not an embedded platform flow.
  const embedded = currentPlatform().kind !== "web" || (typeof window !== "undefined" && window.self !== window.top);
  useEffect(() => {
    if (embedded) return;
    const controller = new AbortController();
    const url = new URL(window.location.href);
    const oauthFailed = url.searchParams.get("auth") === "failed";
    if (oauthFailed) {
      url.searchParams.delete("auth");
      window.history.replaceState(window.history.state, "", url);
    }
    void fetch("/api/auth/me", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        const data: { authenticated: boolean } = await response.json();
        if (!controller.signal.aborted) setAuthenticated(data.authenticated === true);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [embedded]);
  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Unavailable");
      setAuthenticated(false);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  if (embedded) return null;
  return <aside className="start-account" aria-label={t("auth.account")} aria-busy={busy}>
    {busy ? <span role="status">{t("auth.loading")}</span> : authenticated ?
      <><span>{t("auth.signedIn")}</span><button type="button" onClick={() => void logout()}>{t("auth.logout")}</button></> :
      <a href="/api/auth/google/start">{t("auth.google")}</a>}
    {failed && <small role="alert">{t("auth.failed")}</small>}
  </aside>;
}
