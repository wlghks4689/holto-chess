export { GameRoom } from "./GameRoom";

function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => alphabet[n % alphabet.length]).join("");
}
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return Response.json({ ok: true, runtime: "cloudflare-workers" });
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/ws/")) return env.ASSETS.fetch(request);
    // Same-origin browser credentials. No token in a query string, cookie or routing header.
    if (request.headers.get("Origin") !== url.origin) return new Response("Origin rejected", { status: 403 });
    const forward = (roomId: string, path: string) => {
      const target = new URL(request.url); target.pathname = path; target.search = "";
      const headers = new Headers(request.headers); headers.set("X-Room-Id", roomId);
      return env.GAME_ROOM.getByName(`room:${roomId}`).fetch(new Request(target, { method: request.method, headers }));
    };
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await forward(code(), "/internal/create");
        if (response.status !== 409) return response;
      }
      return new Response("Please retry", { status: 503 });
    }
    const join = /^\/api\/rooms\/([A-Z2-9]{6})\/join$/.exec(url.pathname);
    if (join && request.method === "POST") return forward(join[1], "/internal/join");
    const socket = /^\/ws\/rooms\/([A-Z2-9]{6})$/.exec(url.pathname);
    if (socket && request.method === "GET" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") return forward(socket[1], "/internal/ws");
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
