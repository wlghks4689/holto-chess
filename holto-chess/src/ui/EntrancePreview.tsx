import { useState } from "react";
import { AccountContext, type AccountContextValue } from "./useAccount";
import { StartScreen } from "./StartScreen";
import { clearEntryIntent, requestEntry } from "./entryIntent";

/** Development-only fixture: does not create accounts, cookies, or rooms. */
export function EntrancePreview() {
  const [entered, setEntered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scenario, setScenario] = useState("normal");
  const account: AccountContextValue = {
    status: entered ? "authenticated" : "anonymous", user: entered ? { id: "preview", displayName: "포레나" } : null,
    canEnter: entered, guestChosen: false, embedded: false, busy: false, error: failed ? "auth.failed" : "",
    chooseGuest: () => { setEntered(true); }, leaveGuest: () => { setEntered(false); },
    logout: async () => { setEntered(false); }, refresh: async () => {}, saveProfile: async () => true,
    verifyNewRoom: async () => ({ kind: "guest" }),
  };
  return <AccountContext.Provider value={account}>
    <aside style={{ position: "fixed", top: 4, left: 4, zIndex: 40, display: "flex", gap: 4, fontSize: 11 }}>
      <select aria-label="입장 검증 시나리오" value={scenario} onChange={event => setScenario(event.target.value)}><option value="normal">정상 영상</option><option value="failure">영상 실패</option><option value="reduced">동작 줄이기</option></select>
      <button onClick={() => { requestEntry(); setEntered(true); }}>Google 성공 검증</button>
      <button onClick={() => { clearEntryIntent(); setEntered(false); setFailed(true); }}>로그인 실패 검증</button>
      <button onClick={() => { clearEntryIntent(); setFailed(false); setEntered(false); }}>초기화</button>
    </aside>
    <StartScreen onStart={() => {}} entryPreview={{ failure: scenario === "failure", reduced: scenario === "reduced" }} />
  </AccountContext.Provider>;
}
