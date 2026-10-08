import { useState } from "react";
import { normalizeNickname } from "../shared/nickname";
import { canEnterHome, type AccountSnapshot } from "./accountState";
import { AccountContext } from "./useAccount";
import { StartScreen } from "./StartScreen";
import { MultiplayerLobby } from "./OnlineLobby";

// Development-only presentation fixtures. They never create a server session or call room APIs.
export function AccountPreview() {
  const fixture = new URLSearchParams(location.search).get("case") ?? "choice";
  const [snapshot, setSnapshot] = useState<AccountSnapshot>(() => fixture === "profile" || fixture === "account" || fixture === "lobby"
    ? { status: "authenticated", user: { id: "local-preview-account", displayName: fixture === "profile" ? null : "포레나플레이어" } }
    : { status: "anonymous", user: null });
  const [guestChosen, setGuestChosen] = useState(fixture === "guest");
  const [showLobby, setShowLobby] = useState(fixture === "lobby");
  const [nickname, setNickname] = useState("게스트");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const reset = () => { setSnapshot({ status: "anonymous", user: null }); setGuestChosen(false); setError(""); };
  return <AccountContext.Provider value={{ ...snapshot, guestChosen, canEnter: canEnterHome(snapshot, guestChosen), embedded: fixture === "embedded", busy: false, error,
    chooseGuest: () => setGuestChosen(true), leaveGuest: reset, refresh: async () => {}, logout: async () => reset(),
    saveProfile: async value => {
      const displayName = normalizeNickname(value);
      if (!displayName) { setError("profile.invalid"); return false; }
      setSnapshot({ status: "authenticated", user: { id: "local-preview-account", displayName } }); setError(""); return true;
    },
    verifyNewRoom: async () => { throw new Error("Presentation fixture only"); },
  }}>
    <span style={{ position: "fixed", top: 4, left: 8, zIndex: 1000, color: "#abd9e5", fontSize: 10, pointerEvents: "none" }}>DEVELOPMENT · ACCOUNT UI PREVIEW</span>
    {showLobby ? <MultiplayerLobby nickname={snapshot.user?.displayName ?? nickname} nicknameReadOnly={!!snapshot.user} onNickname={setNickname} roomCode={roomCode} onRoomCode={setRoomCode} busy={false} error="" sessions={[]} onJoin={() => {}} onResume={() => {}} onHome={() => setShowLobby(false)} /> : <StartScreen onStart={mode => { if (mode === "multi") setShowLobby(true); }} />}
  </AccountContext.Provider>;
}
