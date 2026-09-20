import { describe, expect, it } from "vitest";
import { invitedRoom, roomInviteUrl } from "./roomInvite";

describe("public room invitations", () => {
  it("round-trips a code and discards unrelated query, hash and credentials", () => {
    const url = roomInviteUrl("https://porena.kr/path?token=secret#top", "ABC234");
    expect(url).toBe("https://porena.kr/?room=ABC234");
    expect(invitedRoom(new URL(url).search)).toBe("ABC234");
  });
  it("normalizes lower-case invitations and preserves local development origins", () => {
    expect(invitedRoom("?room=abc234")).toBe("ABC234");
    expect(roomInviteUrl("http://127.0.0.1:5174", "ABC234")).toBe("http://127.0.0.1:5174/?room=ABC234");
  });
  it.each(["", "?room=", "?room=ABC01X", "?room=../../", "?room=ABCDEFG", "?room=%3Cscript%3E"])("ignores invalid invitations: %s", (search) => {
    expect(invitedRoom(search)).toBeNull();
  });
  it("rejects malformed codes when sharing", () => {
    expect(() => roomInviteUrl("https://porena.kr", "bad")).toThrow();
  });
});
