/**
 * Every server address the game client uses. Paths stay relative to the page origin:
 * on porena.kr they reach the Worker directly; inside a Discord Activity the page origin is
 * <application id>.discordsays.com, whose root URL mapping forwards them to porena.kr unchanged.
 * If a host ever needs a prefix or another mapping, it changes here only.
 */
type SocketLocation = Pick<Location, "protocol" | "host">;

export const endpoints = {
  createRoom: () => "/api/rooms",
  joinRoom: (roomId: string) => `/api/rooms/${roomId}/join`,
  roomSession: (roomId: string) => `/api/rooms/${roomId}/session`,
  feedback: () => "/api/feedback",
};

export function roomSocketUrl(roomId: string, page: SocketLocation = location): string {
  return `${page.protocol === "https:" ? "wss:" : "ws:"}//${page.host}/ws/rooms/${roomId}`;
}
