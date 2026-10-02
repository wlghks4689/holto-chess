import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "../i18n";
import { platformStatus, subscribePlatformStatus } from "../platform/runtime";
import "./platformNotice.css";

/** The banner sits over the top of the screen, where in-game screens keep the round nav and exit button. */
export const PLATFORM_NOTICE_VISIBLE_MS = 10_000;

/** Shown only inside a Discord Activity whose SDK handshake failed. Renders nothing on the web. */
export function PlatformNotice() {
  const { t } = useTranslation();
  const status = useSyncExternalStore(subscribePlatformStatus, platformStatus, platformStatus);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (status !== "failed") return;
    const timer = setTimeout(() => setDismissed(true), PLATFORM_NOTICE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);
  if (status !== "failed" || dismissed) return null;
  return <div className="platform-notice" role="alert">
    <p>{t("platform.discord.sdkFailed")}</p>
    <button type="button" className="secondary" onClick={() => setDismissed(true)}>{t("common.close")}</button>
  </div>;
}
