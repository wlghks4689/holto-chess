import { createContext, useContext } from "react";
import type { AccountSnapshot, AccountUser } from "./accountState";

export type AccountContextValue = AccountSnapshot & {
  guestChosen: boolean;
  canEnter: boolean;
  embedded: boolean;
  busy: boolean;
  error: string;
  chooseGuest: () => void;
  leaveGuest: () => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  saveProfile: (displayName: string) => Promise<boolean>;
  verifyNewRoom: () => Promise<{ kind: "account"; user: AccountUser } | { kind: "guest" }>;
};
export const AccountContext = createContext<AccountContextValue>({
  status: "loading", user: null, guestChosen: false, canEnter: false, embedded: false, busy: false, error: "",
  chooseGuest: () => {}, leaveGuest: () => {}, refresh: async () => {}, logout: async () => {}, saveProfile: async () => false,
  verifyNewRoom: async () => { throw new Error("client.accountUnavailable"); },
});
export const useAccount = () => useContext(AccountContext);
