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

// Login is closed for now (HOME-GATE-001): the home page is the gate with four items, whatever the stored account state.
it("shows the four gate items without asking for login, nickname or guest choice", () => {
  for (const html of [renderToStaticMarkup(createElement(StartScreen, { onStart: () => {} })), render(guest), render(incomplete, true), render(signedIn)]) {
    expect(html).toContain('class="start-screen start-gate-screen"');
    const menu = html.slice(html.indexOf('class="start-menu"'));
    expect(menu.match(/<button/g)?.length).toBeGreaterThanOrEqual(4);
    for (const label of ["게임 시작", "게임 설명", "환경 설정", "피드백"]) expect(html).toContain(label);
    expect(html).not.toContain("Google로 로그인");
    expect(html).not.toContain("게스트로 플레이");
    expect(html).not.toContain('id="account-nickname"');
    expect(html).not.toContain("private-user-id");
    expect(html).not.toContain("client_secret");
  }
});

it("offers language buttons above login, nickname setup and the home menu", () => {
  for (const state of [guest, incomplete, signedIn]) {
    const html = render(state);
    expect(html).toContain('class="start-language" role="group"');
    expect(html).toContain('lang="ko" aria-pressed="true"');
    expect(html).toContain('lang="en" aria-pressed="false"');
    expect(html.indexOf('class="start-language"')).toBeLessThan(html.indexOf('class="start-main"'));
    expect(html).not.toContain('class="locale-setting"');
  }
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
