import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { StartScreen } from "./StartScreen";
import { AccountContext, type AccountContextValue } from "./useAccount";
import { canEnterHome, newRoomIdentity, parseAccountSnapshot, resolveNewRoomIdentity, type AccountSnapshot } from "./accountState";

const guest: AccountSnapshot = { status: "anonymous", user: null };
const signedIn: AccountSnapshot = { status: "authenticated", user: { id: "private-user-id", displayName: "포레나" } };
const incomplete: AccountSnapshot = { status: "authenticated", user: { id: "private-user-id", displayName: null } };
const context = (state: AccountSnapshot, guestChosen = false): AccountContextValue => ({ ...state,
  guestChosen, canEnter: canEnterHome(state, guestChosen), embedded: false, busy: false, error: "", chooseGuest: () => {}, leaveGuest: () => {},
  refresh: async () => {}, logout: async () => {}, saveProfile: async () => true, verifyNewRoom: async () => ({ kind: "guest" }),
});
const render = (state: AccountSnapshot, guestChosen = false) => renderToStaticMarkup(createElement(AccountContext.Provider, { value: context(state, guestChosen) }, createElement(StartScreen, { onStart: () => {} })));

it("shows login choices before any game, tutorial, guide or settings menu", () => {
  const html = renderToStaticMarkup(createElement(StartScreen, { onStart: () => {} }));
  expect(html).toContain('role="status"');
  expect(html).not.toContain("Google로 로그인");
  expect(render(guest)).toContain("게스트로 플레이");
  expect(html).not.toContain('class="start-menu"');
  expect(html).not.toContain("시작하기");
  expect(html).not.toContain("체험 · 길라잡이");
  expect(html).not.toContain("client_secret");
});

it("unlocks the home menu only after explicit guest choice or a complete account profile", () => {
  expect(render(guest)).not.toContain('class="start-menu"');
  expect(render(guest, true)).toContain('class="start-menu"');
  expect(render(signedIn)).toContain('class="start-menu"');
  expect(render(signedIn)).toContain("포레나");
  expect(render(signedIn)).not.toContain("private-user-id");
});

it("requires a blank nickname form before the home menu for a first login", () => {
  const html = render(incomplete, true);
  expect(html).toContain('id="account-nickname"');
  expect(html).toContain('value=""');
  expect(html).not.toContain('class="start-menu"');
  expect(html).not.toContain("private-user-id");
});

it("does not let expired, changed or unavailable account verification become a guest seat", () => {
  expect(() => newRoomIdentity(signedIn, true, guest)).toThrow("client.accountExpired");
  expect(() => newRoomIdentity(signedIn, false, { ...signedIn, user: { id: "other-account", displayName: "다른이름" } })).toThrow("client.accountExpired");
  expect(() => newRoomIdentity(signedIn, false, { status: "unavailable", user: null })).toThrow("client.accountUnavailable");
  expect(() => newRoomIdentity(guest, true, signedIn)).toThrow("client.accountChanged");
  expect(() => newRoomIdentity(signedIn, false, incomplete)).toThrow("client.profileRequired");
  expect(() => newRoomIdentity(guest, false, guest)).toThrow("client.accountExpired");
  expect(newRoomIdentity(guest, true, guest)).toEqual({ kind: "guest" });
  expect(newRoomIdentity(signedIn, false, signedIn)).toEqual({ kind: "account", user: signedIn.user });
});

it("accepts only a well-formed account status and strips unrelated response fields", () => {
  expect(parseAccountSnapshot({ authenticated: false })).toEqual(guest);
  expect(parseAccountSnapshot({ authenticated: true, user: { id: "private-user-id", displayName: null, email: "private@example.com" } })).toEqual(incomplete);
  expect(() => parseAccountSnapshot({ authenticated: true })).toThrow();
  expect(() => parseAccountSnapshot({ authenticated: true, user: { id: "u1" } })).toThrow();
});

it("keeps explicit embedded Guest room entry available without first-party auth endpoints", async () => {
  const rejectedAuth = vi.fn(async (): Promise<AccountSnapshot> => { throw new Error("Forbidden embedded Origin"); });
  await expect(resolveNewRoomIdentity(guest, true, true, rejectedAuth)).resolves.toEqual({ kind: "guest" });
  expect(rejectedAuth).not.toHaveBeenCalled();
  await expect(resolveNewRoomIdentity(guest, false, true, rejectedAuth)).rejects.toThrow("client.accountExpired");
  await expect(resolveNewRoomIdentity(guest, true, false, rejectedAuth)).rejects.toThrow("client.accountUnavailable");
  expect(rejectedAuth).toHaveBeenCalledOnce();
});
