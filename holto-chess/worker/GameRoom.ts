import { DurableObject } from "cloudflare:workers";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, type RoomSnapshot } from "../src/game/room";
import { createPlayerView } from "../src/game/playerView";
import { parseClientMessage, type ServerMessage } from "../src/shared/protocol";

type Attachment = { roomId: string; playerId: string | null; joinedAt: number };
const SNAPSHOT_KEY = "snapshot:v1";
const AUTH_TIMEOUT_MS = 15000;
function randomSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]! || 1; }
function token(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""); }
async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
export class GameRoom extends DurableObject<Env> {
  private room: RoomSnapshot | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<RoomSnapshot>(SNAPSHOT_KEY);
      if (this.room && this.room.schema !== 1) throw new Error("Unsupported room snapshot version");
    });
  }

  private async commit(next: RoomSnapshot): Promise<void> {
    // Publish only after durable storage succeeds. Failed commands never replace the snapshot.
    try { await this.ctx.storage.put(SNAPSHOT_KEY, next); }
    catch { throw new Error("상태를 저장하지 못했습니다. 재접속 후 다시 시도하세요."); }
    this.room = next;
  }
  /**
   * One alarm slot serves two deadlines: unauthenticated sockets and the barrier
   * auto-advance. Always arm the nearer of the two.
   */
  private async rescheduleAlarm(): Promise<void> {
    const deadlines: number[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !a.playerId) deadlines.push(a.joinedAt + AUTH_TIMEOUT_MS);
    }
    const barrier = this.room ? barrierDeadline(this.room) : undefined;
    if (barrier !== undefined) deadlines.push(barrier);
    if (!deadlines.length) { await this.ctx.storage.deleteAlarm(); return; }
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }
  private send(ws: WebSocket, message: ServerMessage): void {
    try { ws.send(JSON.stringify(message)); } catch { /* Closed sockets have no state authority. */ }
  }
  private broadcast(): void {
    if (!this.room) return;
    const sockets = this.ctx.getWebSockets();
    const connected = sockets.map((ws) => (ws.deserializeAttachment() as Attachment | null)?.playerId).filter((id): id is string => !!id);
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.playerId && a.roomId === this.room.roomId) this.send(ws, { type: "PLAYER_VIEW", payload: createPlayerView(this.room, a.playerId, connected) });
    }
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = request.headers.get("X-Room-Id");
    if (!roomId || !/^[A-Z2-9]{6}$/.test(roomId)) return new Response("Bad room", { status: 400 });
    if (url.pathname === "/internal/create" && request.method === "POST") {
      return this.ctx.blockConcurrencyWhile(async () => {
        if (this.room) return new Response("Room exists", { status: 409 });
        const secret = token();
        const { room, playerId } = addSession(createRoom(roomId, randomSeed(), "secure"), await hash(secret));
        await this.commit(room);
        return Response.json({ roomId, playerId, token: secret }, { status: 201, headers: { "Cache-Control": "no-store" } });
      });
    }
    if (!this.room || this.room.roomId !== roomId) return new Response("Room not found", { status: 404 });
    if (url.pathname === "/internal/join" && request.method === "POST") {
      return this.ctx.blockConcurrencyWhile(async () => {
        if (this.room!.status !== "LOBBY" || this.room!.sessions.length >= 8) return new Response("Room unavailable", { status: 409 });
        const secret = token();
        const { room, playerId } = addSession(this.room!, await hash(secret));
        await this.commit(room); this.broadcast();
        return Response.json({ roomId, playerId, token: secret }, { status: 201, headers: { "Cache-Control": "no-store" } });
      });
    }
    if (url.pathname !== "/internal/ws" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Not found", { status: 404 });
    if (this.ctx.getWebSockets().length >= 24) return new Response("Too many connections", { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ roomId, playerId: null, joinedAt: Date.now() } satisfies Attachment);
    // Alarms, not JS timers, drive both deadlines without preventing hibernation.
    await this.rescheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      let requestId: string | undefined;
      try {
        if (typeof raw !== "string") throw new Error("텍스트 메시지만 지원합니다.");
        const message = parseClientMessage(raw);
        const attachment = ws.deserializeAttachment() as Attachment | null;
        if (!this.room || !attachment || attachment.roomId !== this.room.roomId) throw new Error("방 연결이 없습니다.");
        if (message.type === "JOIN_ROOM") {
          if (attachment.playerId) throw new Error("이미 인증된 연결입니다.");
          const digest = await hash(message.token);
          const session = this.room.sessions.find((s) => s.tokenHash === digest);
          if (!session) { this.send(ws, { type: "ERROR", code: "UNAUTHORIZED", message: "세션을 복원할 수 없습니다." }); ws.close(1008, "Invalid session"); return; }
          for (const old of this.ctx.getWebSockets()) {
            if (old !== ws && (old.deserializeAttachment() as Attachment | null)?.playerId === session.playerId) old.close(4001, "Session connected elsewhere");
          }
          ws.serializeAttachment({ roomId: attachment.roomId, playerId: session.playerId, joinedAt: attachment.joinedAt } satisfies Attachment);
          this.send(ws, { type: "ROOM_JOINED", roomId: this.room.roomId, playerId: session.playerId });
          this.broadcast(); return;
        }
        requestId = message.requestId;
        if (!attachment.playerId) { this.send(ws, { type: "ERROR", code: "UNAUTHORIZED", message: "먼저 세션을 연결하세요.", requestId }); ws.close(1008, "Authentication required"); return; }
        const session = this.room.sessions.find((s) => s.playerId === attachment.playerId)!;
        if (session.requests.includes(requestId)) { this.send(ws, { type: "ACK", requestId, revision: this.room.revision }); this.broadcast(); return; }
        const candidate = structuredClone(this.room);
        // Production draws use Workers crypto; seeded mode is reserved for local simulations/tests.
        candidate.game.randomMode = "secure";
        const next = applyRoomAction(candidate, session.playerId, message, message.turnKey, Date.now());
        next.sessions.find((s) => s.playerId === session.playerId)!.requests = [...session.requests, requestId].slice(-64);
        await this.commit(next);
        await this.rescheduleAlarm();
        this.send(ws, { type: "ACK", requestId, revision: next.revision });
        this.broadcast();
      } catch (error) {
        this.send(ws, { type: "ERROR", code: "ACTION_REJECTED", message: error instanceof SyntaxError ? "JSON 메시지가 필요합니다." : error instanceof Error ? error.message : "명령을 처리하지 못했습니다.", requestId });
      }
    });
  }
  webSocketClose(ws: WebSocket, code: number): void { ws.close(code === 1005 ? 1000 : code); this.broadcast(); }
  webSocketError(ws: WebSocket): void { ws.close(1011, "Connection error"); }
  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment | null;
        if (!a?.playerId && (!a || now - a.joinedAt >= AUTH_TIMEOUT_MS)) ws.close(1008, "Authentication timeout");
      }
      if (this.room) {
        // Bots stand in for whoever the barrier is still waiting on, so one
        // unresponsive player can never strand the rest of the room.
        const forced = forceBarrier(this.room, now);
        if (forced) { await this.commit(forced); this.broadcast(); }
      }
      await this.rescheduleAlarm();
    });
  }
}
