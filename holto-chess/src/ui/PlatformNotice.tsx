import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "../i18n";
import { platformStatus, subscribePlatformStatus } from "../platform/runtime";
import "./platformNotice.css";

/** Shown only inside a Discord Activity whose SDK handshake failed. Renders nothing on the web. */
export function PlatformNotice() {
  const { t } = useTranslation();
  const status = useSyncExternalStore(subscribePlatformStatus, platformStatus, platformStatus);
  const [dismissed, setDismissed] = useState(false);
  if (status !== "failed" || dismissed) return null;
  return <div className="platform-notice" role="alert">
    <p>{t("platform.discord.sdkFailed")}</p>
    <button type="button" className="secondary" onClick={() => setDismissed(true)}>{t("common.close")}</button>
  </div>;
}
