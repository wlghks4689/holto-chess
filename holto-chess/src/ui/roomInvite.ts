export function invitedRoom(search: string): string | null {
  const code = new URLSearchParams(search).get("room")?.trim().toUpperCase();
  return code && /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

/** Share only the public room code, never credentials or the current query. */
export function roomInviteUrl(origin: string, roomId: string): string {
  if (!/^[A-Z2-9]{6}$/.test(roomId)) throw new Error("잘못된 방 코드입니다.");
  const url = new URL("/", origin);
  url.searchParams.set("room", roomId);
  return url.href;
}
