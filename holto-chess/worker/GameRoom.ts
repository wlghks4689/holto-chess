import { DurableObject } from "cloudflare:workers";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, migrateRoomSnapshot, resumeSession, type RoomSnapshot } from "../src/game/room";
import { createPlayerView } from "../src/game/playerView";
import { parseClientMessage, type ServerMessage } from "../src/shared/protocol";
import { classifyGameError } from "../src/shared/gameErrorCode";
import { nextDisclosureAt } from "../src/game/disclosure";

type Attachment = { roomId: string; playerId: string | null; joinedAt: number; windowAt?: number; messages?: number };
const SNAPSHOT_KEY = "snapshot:v1";
const EXPIRY_KEY = "expiresAt";
const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
const FINISHED_ROOM_LIFETIME_MS = 15 * 60 * 1000;
const AUTH_TIMEOUT_MS = 15000;
function randomSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]! || 1; }
function token(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""); }
async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
export class GameRoom extends DurableObject<Env> {
  private room: RoomSnapshot | undefined;
  private expiresAt: number | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const storedRoom = await ctx.storage.get<RoomSnapshot>(SNAPSHOT_KEY);
      this.room = storedRoom ? migrateRoomSnapshot(storedRoom) : undefined;
      if (storedRoom && this.room !== storedRoom) await ctx.storage.put(SNAPSHOT_KEY, this.room);
      this.expiresAt = await ctx.storage.get<number>(EXPIRY_KEY);
      if (this.room && !this.expiresAt) {
        this.expiresAt = Date.now() + ROOM_LIFETIME_MS;
        await ctx.storage.put(EXPIRY_KEY, this.expiresAt);
      }
      if (this.room?.finalResultsReleasedAt) {
        const finishedExpiry = this.room.finalResultsReleasedAt + FINISHED_ROOM_LIFETIME_MS;
        if (!this.expiresAt || this.expiresAt > finishedExpiry) {
          this.expiresAt = finishedExpiry;
          await ctx.storage.put(EXPIRY_KEY, finishedExpiry);
        }
      }
      if (this.room && this.room.schema !== 1) throw new Error("Unsupported room snapshot version");
      if (this.room && await ctx.storage.getAlarm() === null) await this.rescheduleAlarm();
    });
  }

  private async commit(next: RoomSnapshot): Promise<void> {
    // Publish only after durable storage succeeds. Failed commands never replace the snapshot.
    try { await this.ctx.storage.put(SNAPSHOT_KEY, next); }
    catch {
      console.error(JSON.stringify({ event: "room_storage_failed", roomId: next.roomId, revision: next.revision }));
      throw new Error("상태를 저장하지 못했습니다. 재접속 후 다시 시도하세요.");
    }
    if (next.finalResultsReleasedAt && !this.room?.finalResultsReleasedAt) {
      // Result computation is not game completion. Start cleanup only after
      // an eligible player opens the final standings following common reveal.
      this.expiresAt = next.finalResultsReleasedAt + FINISHED_ROOM_LIFETIME_MS;
      await this.ctx.storage.put(EXPIRY_KEY, this.expiresAt);
    } else if (next.game.phase !== "GAME_RESULT" && this.room?.game.phase === "GAME_RESULT") {
      this.expiresAt = Date.now() + ROOM_LIFETIME_MS;
      await this.ctx.storage.put(EXPIRY_KEY, this.expiresAt);
    }
    this.room = next;
  }
  /**
   * One alarm slot serves authentication, authorized reveal, phase advancement
   * and room expiry. Always arm the earliest deadline.
   */
  private async rescheduleAlarm(): Promise<void> {
    const deadlines: number[] = [];
    if (this.expiresAt) deadlines.push(this.expiresAt);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !a.playerId) deadlines.push(a.joinedAt + AUTH_TIMEOUT_MS);
    }
    const barrier = this.room ? barrierDeadline(this.room) : undefined;
    if (barrier !== undefined) deadlines.push(barrier);
    const reveal = this.room ? nextDisclosureAt(this.room, Date.now()) : undefined;
    if (reveal !== undefined) deadlines.push(reveal);
    const next = deadlines.length ? Math.min(...deadlines) : null;
    // Avoid a billed write when the scheduled deadline has not changed.
    if (await this.ctx.storage.getAlarm() === next) return;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
  private send(ws: WebSocket, message: ServerMessage): void {
    try { ws.send(JSON.stringify(message)); } catch { /* Closed sockets have no state authority. */ }
  }
  private broadcast(): void {
    if (!this.room) return;
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    const connected = sockets.map((ws) => (ws.deserializeAttachment() as Attachment | null)?.playerId).filter((id): id is string => !!id);
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.playerId && a.roomId === this.room.roomId) this.send(ws, { type: "PLAYER_VIEW", payload: createPlayerView(this.room, a.playerId, connected, now) });
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
        this.expiresAt = Date.now() + ROOM_LIFETIME_MS;
        await this.ctx.storage.put(EXPIRY_KEY, this.expiresAt);
        await this.rescheduleAlarm();
        return Response.json({ roomId, playerId, token: secret }, { status: 201, headers: { "Cache-Control": "no-store" } });
      });
    }
    if (!this.room || this.room.roomId !== roomId) return new Response("Room not found", { status: 404 });
    if (url.pathname === "/internal/session" && request.method === "POST") {
      const secret = request.headers.get("X-Porena-Session");
      if (!secret || !/^[a-f0-9]{64}$/.test(secret)) return new Response("Invalid session", { status: 401 });
      const digest = await hash(secret);
      const session = this.room.sessions.find((entry) => entry.tokenHash === digest);
      if (!session) return new Response("Invalid session", { status: 401 });
      if (session.departed || this.room.finalResultsReleasedAt) return new Response("Room finished", { status: 410 });
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
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
        const rate = ws.deserializeAttachment() as Attachment | null;
        if (!rate) return;
        const now = Date.now();
        if (!rate.windowAt || now - rate.windowAt >= 10_000) { rate.windowAt = now; rate.messages = 0; }
        rate.messages = (rate.messages ?? 0) + 1;
        ws.serializeAttachment(rate);
        if (rate.messages > 100) { ws.close(1008, "Too many messages"); return; }
        if (typeof raw !== "string") throw new Error("텍스트 메시지만 지원합니다.");
        const message = parseClientMessage(raw);
        const attachment = ws.deserializeAttachment() as Attachment | null;
        if (!this.room || !attachment || attachment.roomId !== this.room.roomId) throw new Error("방 연결이 없습니다.");
        if (message.type === "JOIN_ROOM") {
          if (attachment.playerId) throw new Error("이미 인증된 연결입니다.");
          const digest = await hash(message.token);
          const session = this.room.sessions.find((s) => s.tokenHash === digest);
          if (!session) { this.send(ws, { type: "ERROR", code: "SESSION_INVALID", message: "세션을 복원할 수 없습니다." }); ws.close(1008, "Invalid session"); return; }
          if (message.nickname && this.room.status === "LOBBY") {
            const next = structuredClone(this.room);
            next.game.players.find((p) => p.id === session.playerId)!.name = message.nickname;
            next.revision++;
            await this.commit(next);
          }
          // Coming back from a leave (or a dropped connection) takes the seat back from the bot.
          const resumed = resumeSession(this.room, session.playerId, Date.now());
          if (resumed) { await this.commit(resumed); await this.rescheduleAlarm(); }
          for (const old of this.ctx.getWebSockets()) {
            if (old !== ws && (old.deserializeAttachment() as Attachment | null)?.playerId === session.playerId) old.close(4001, "Session connected elsewhere");
          }
          ws.serializeAttachment({ roomId: attachment.roomId, playerId: session.playerId, joinedAt: attachment.joinedAt } satisfies Attachment);
          this.send(ws, { type: "ROOM_JOINED", roomId: this.room.roomId, playerId: session.playerId });
          this.broadcast(); return;
        }
        if (message.type === "SYNC_CLOCK") {
          if (!attachment.playerId) throw new Error("먼저 세션을 연결하세요.");
          this.send(ws, { type: "CLOCK_SYNC", nonce: message.nonce, receivedAt: now, sentAt: Date.now() });
          // Returning tabs receive the current authorized reveal, never an old replay.
          this.send(ws, { type: "PLAYER_VIEW", payload: createPlayerView(this.room, attachment.playerId, this.ctx.getWebSockets().map(socket => (socket.deserializeAttachment() as Attachment | null)?.playerId).filter((id): id is string => !!id)) });
          await this.rescheduleAlarm();
          return;
        }
        requestId = message.requestId;
        if (!attachment.playerId) { this.send(ws, { type: "ERROR", code: "SESSION_REQUIRED", message: "먼저 세션을 연결하세요.", requestId }); ws.close(1008, "Authentication required"); return; }
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
        const legacyMessage = error instanceof SyntaxError ? "JSON 메시지가 필요합니다." : error instanceof Error ? error.message : "명령을 처리하지 못했습니다.";
        this.send(ws, { type: "ERROR", ...classifyGameError(legacyMessage), message: legacyMessage, requestId });
      }
    });
  }
  webSocketClose(ws: WebSocket, code: number): void { ws.close(code === 1005 ? 1000 : code); this.broadcast(); }
  webSocketError(ws: WebSocket): void { ws.close(1011, "Connection error"); }
  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      if (this.expiresAt && now >= this.expiresAt) {
        for (const ws of this.ctx.getWebSockets()) ws.close(1008, "Room expired after 24 hours");
        await this.ctx.storage.delete([SNAPSHOT_KEY, EXPIRY_KEY]);
        this.room = undefined;
        this.expiresAt = undefined;
        await this.ctx.storage.deleteAlarm();
        return;
      }
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment | null;
        if (!a?.playerId && (!a || now - a.joinedAt >= AUTH_TIMEOUT_MS)) ws.close(1008, "Authentication timeout");
      }
      if (this.room) {
        // Bots stand in for whoever the barrier is still waiting on, so one
        // unresponsive player can never strand the rest of the room.
        const forced = forceBarrier(this.room, now);
        if (forced) await this.commit(forced);
        this.broadcast();
      }
      await this.rescheduleAlarm();
    });
  }
}
