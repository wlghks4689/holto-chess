import { useEffect, useState, type ReactNode } from "react";
import { currentPlatform } from "../platform/runtime";
import { normalizeNickname } from "../shared/nickname";
import { canEnterHome, fetchAccount, parseAccountSnapshot, readGuestChoice, resolveNewRoomIdentity, storeGuestChoice, type AccountSnapshot } from "./accountState";
import { AccountContext } from "./useAccount";
import { clearEntryIntent } from "./entryIntent";

export function AccountProvider({ children }: { children: ReactNode }) {
  const embedded = currentPlatform().kind !== "web" || (typeof window !== "undefined" && window.self !== window.top);
  const [snapshot, setSnapshot] = useState<AccountSnapshot>({ status: embedded ? "anonymous" : "loading", user: null });
  const [guestChosen, setGuestChosen] = useState(readGuestChoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("auth") === "failed" ? "auth.failed" : "");

  useEffect(() => {
    if (embedded) return;
    const controller = new AbortController();
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") === "failed") clearEntryIntent();
    if (url.searchParams.has("auth")) {
      url.searchParams.delete("auth");
      window.history.replaceState(window.history.state, "", url);
    }
    void fetchAccount(controller.signal).then(next => {
      if (!controller.signal.aborted) {
        setSnapshot(next);
        if (next.status !== "authenticated") clearEntryIntent();
        if (next.status === "authenticated") { storeGuestChoice(false); setGuestChosen(false); }
      }
    }).catch(() => {
      if (!controller.signal.aborted) { clearEntryIntent(); setSnapshot({ status: "unavailable", user: null }); setError("auth.unavailable"); }
    });
    return () => controller.abort();
  }, [embedded]);

  async function refresh() {
    setBusy(true); setError("");
    try {
      const next = await fetchAccount(); setSnapshot(next);
      if (next.status === "authenticated") { storeGuestChoice(false); setGuestChosen(false); }
    }
    catch { setSnapshot({ status: "unavailable", user: null }); setError("auth.unavailable"); }
    finally { setBusy(false); }
  }
  function chooseGuest() { storeGuestChoice(true); setGuestChosen(true); setError(""); }
  function leaveGuest() { storeGuestChoice(false); setGuestChosen(false); setError(""); }
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Unavailable");
      setSnapshot({ status: "anonymous", user: null }); leaveGuest();
    } catch { setError("auth.unavailable"); }
    finally { setBusy(false); }
  }
  async function saveProfile(value: string) {
    const displayName = normalizeNickname(value);
    if (!displayName) { setError("profile.invalid"); return false; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
      if (!response.ok) {
        if (response.status === 401) { setSnapshot({ status: "anonymous", user: null }); leaveGuest(); }
        setError(response.status === 401 ? "auth.expired" : response.status === 400 ? "profile.invalid" : response.status === 429 ? "error.tryAgain" : "profile.failed");
        return false;
      }
      const data: { user: unknown } = await response.json();
      setSnapshot(parseAccountSnapshot({ authenticated: true, user: data.user }));
      return true;
    } catch { setError("profile.failed"); return false; }
    finally { setBusy(false); }
  }
  async function verifyNewRoom() {
    const identity = await resolveNewRoomIdentity(snapshot, guestChosen, embedded);
    if (identity.kind === "account") setSnapshot({ status: "authenticated", user: identity.user });
    return identity;
  }
  return <AccountContext.Provider value={{ ...snapshot, guestChosen, canEnter: canEnterHome(snapshot, guestChosen), embedded, busy, error, chooseGuest, leaveGuest, refresh, logout, saveProfile, verifyNewRoom }}>{children}</AccountContext.Provider>;
}
