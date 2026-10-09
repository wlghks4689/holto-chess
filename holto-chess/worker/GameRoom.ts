import { DurableObject } from "cloudflare:workers";
import { addSession, applyRoomAction, barrierDeadline, createRoom, forceBarrier, migrateRoomSnapshot, resumeSession, startSolo, turnKey, type RoomSnapshot } from "../src/game/room";
import { collectRankObligations } from "../src/game/rankRoom";
import { settleRankObligation } from "./rank";
import { createPlayerView } from "../src/game/playerView";
import { parseClientMessage, type ServerMessage } from "../src/shared/protocol";
import { classifyGameError } from "../src/shared/gameErrorCode";
import { nextDisclosureAt } from "../src/game/disclosure";
import { FINISHED_ROOM_LIFETIME_MS, LOBBY_IDLE_LIFETIME_MS, ROOM_LIFETIME_MS } from "../src/shared/retention";
import { roomAccountIdentity } from "./roomIdentity";

type Attachment = { roomId: string; playerId: string | null; verifiedPlayerId?: string; joinedAt: number; windowAt?: number; messages?: number };
const SNAPSHOT_KEY = "snapshot:v1";
const EXPIRY_KEY = "expiresAt";
const AUTH_TIMEOUT_MS = 15000;
const TICKET_KEY = "connection-tickets:v1";
const TICKET_LIFETIME_MS = 30_000;
const LEGACY_PENDING_LIMIT = 8;
/** D1 retry backoff for ranked settlement: 5s doubling to 5 minutes, forever. */
const rankRetryDelay = (attempts: number) => Math.min(5000 * 2 ** attempts, 300_000);
/** A room never expires while it still owes the account DB a ranked outcome. */
const RANK_EXPIRY_GRACE_MS = 10 * 60_000;
type Tickets = Record<string, { digest: string; expiresAt: number }>;
/**
 * Multiplayer stall diagnostics: one JSON line per event in Workers Logs (wrangler.jsonc observability).
 * Metadata only. Never tokens, tickets, cards or whole payloads.
 */
function diag(event: string, fields: Record<string, unknown>, level: "log" | "error" = "log"): void {
  console[level](JSON.stringify({ event, ...fields }));
}
function roomFields(room: RoomSnapshot | undefined) {
  return room ? { roomId: room.roomId, revision: room.revision, round: room.game.round, phase: room.status === "LOBBY" ? "LOBBY" : room.game.phase } : {};
}
function randomSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]! || 1; }
function token(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""); }
async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
export class GameRoom extends DurableObject<Env> {
  private room: RoomSnapshot | undefined;
  private expiresAt: number | undefined;
  private tickets: Tickets = {};

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const storedRoom = await ctx.storage.get<RoomSnapshot>(SNAPSHOT_KEY);
      this.room = storedRoom ? migrateRoomSnapshot(storedRoom) : undefined;
      if (this.room && this.room.publicTurnKey?.turn !== turnKey(this.room)) {
        this.room = structuredClone(this.room);
        this.room.publicTurnKey = { turn: turnKey(this.room), key: token() };
      }
      this.tickets = await ctx.storage.get<Tickets>(TICKET_KEY) ?? {};
      if (storedRoom && this.room !== storedRoom) await ctx.storage.put(SNAPSHOT_KEY, this.room);
      this.expiresAt = await ctx.storage.get<number>(EXPIRY_KEY);
      if (this.room && !this.expiresAt) {
        this.expiresAt = Date.now() + ROOM_LIFETIME_MS;
        await ctx.storage.put(EXPIRY_KEY, this.expiresAt);
      }
      // Lobbies created before the 30-minute rule keep at most 30 minutes from this restart.
      if (this.room?.status === "LOBBY" && this.expiresAt && this.expiresAt > Date.now() + LOBBY_IDLE_LIFETIME_MS) {
        this.expiresAt = Date.now() + LOBBY_IDLE_LIFETIME_MS;
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
    if (next.publicTurnKey?.turn !== turnKey(next)) next.publicTurnKey = { turn: turnKey(next), key: token() };
    // The settlement duty is stored with the state change that created it, so a crash cannot lose it.
    // A new duty is flushed at once, unless D1 is already failing: then it joins the running backoff.
    if (collectRankObligations(next)) { next.rankRetryAt ??= Date.now(); next.rankAttempts ??= 0; }
    // Publish only after durable storage succeeds. Failed commands never replace the snapshot.
    try { await this.ctx.storage.put(SNAPSHOT_KEY, next); }
    catch {
      console.error(JSON.stringify({ event: "room_storage_failed", roomId: next.roomId, revision: next.revision }));
      throw new Error("상태를 저장하지 못했습니다. 재접속 후 다시 시도하세요.");
    }
    if (next.status === "LOBBY") {
      this.expiresAt = Date.now() + LOBBY_IDLE_LIFETIME_MS;
      await this.ctx.storage.put(EXPIRY_KEY, this.expiresAt);
    } else if (!this.room || this.room.status === "LOBBY") {
      // The game started (a ranked solo room starts at creation): it gets the normal in-game lifetime from now.
      this.expiresAt = Date.now() + ROOM_LIFETIME_MS;
      await this.ctx.storage.put(EXPIRY_KEY, this.expiresAt);
    } else if (next.finalResultsReleasedAt && !this.room?.finalResultsReleasedAt) {
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
  private async rescheduleAlarm(disclosedAt = Date.now()): Promise<void> {
    // Each deadline keeps its reason so the logs show which one armed the alarm.
    const deadlines: { at: number; reason: string }[] = [];
    if (this.expiresAt) deadlines.push({ at: this.expiresAt, reason: "expiry" });
    deadlines.push(...Object.values(this.tickets).map(ticket => ({ at: ticket.expiresAt, reason: "ticket" })));
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !a.playerId) deadlines.push({ at: a.joinedAt + AUTH_TIMEOUT_MS, reason: "auth" });
    }
    const barrier = this.room ? barrierDeadline(this.room) : undefined;
    if (barrier !== undefined) deadlines.push({ at: barrier, reason: "barrier" });
    if (this.room?.rankPending?.length) deadlines.push({ at: this.room.rankRetryAt ?? Date.now(), reason: "rank" });
    // Serialization can cross a reveal boundary. Schedule from the state we
    // actually published, even if its next boundary is now overdue, so a final
    // prefix cannot wait for the later barrier or a client's clock probe.
    const reveal = this.room ? nextDisclosureAt(this.room, disclosedAt) : undefined;
    if (reveal !== undefined) deadlines.push({ at: reveal, reason: "reveal" });
    const next = deadlines.reduce<{ at: number; reason: string } | null>((best, item) => !best || item.at < best.at ? item : best, null);
    const scheduled = await this.ctx.storage.getAlarm();
    // An overdue broadcast may be queued behind this request. A per-seat clock
    // response must not cancel that reveal for everybody else. In alarm() the
    // runtime returns null for the alarm currently executing.
    if (scheduled === (next?.at ?? null)) return;
    if (scheduled !== null && scheduled <= Date.now()) {
      diag("alarm.keep", { ...roomFields(this.room), scheduledAt: scheduled, overdueMs: Date.now() - scheduled, wantedAt: next?.at, wantedReason: next?.reason });
      return;
    }
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next.at);
    diag("alarm.set", { ...roomFields(this.room), at: next?.at ?? null, inMs: next ? next.at - Date.now() : null, reason: next?.reason ?? "none", replacedAt: scheduled });
  }
  /**
   * Writes queued ranked outcomes to the account DB. D1 replays are no-ops (worker/rank.ts), so a crash between the
   * D1 write and this commit only repeats a harmless write. Failures keep the queue and back off.
   */
  private async flushRank(now: number): Promise<void> {
    const room = this.room;
    if (!room?.rankPending?.length || (room.rankRetryAt ?? 0) > now) return;
    const next = structuredClone(room);
    // Independent accounts settle in parallel, so a full table holds the room for about one D1 round trip.
    const settled = await Promise.allSettled(room.rankPending.map((obligation) => settleRankObligation(this.env.ACCOUNT_DB, obligation, now)));
    next.rankPending = room.rankPending.filter((obligation, i) => {
      const outcome = settled[i]!;
      if (outcome.status === "fulfilled") {
        if (next.rank?.gameId === obligation.gameId) next.rank.results[obligation.playerId] = outcome.value;
        diag("rank.settled", { ...roomFields(room), playerId: obligation.playerId, gameId: obligation.gameId, skipped: "skipped" in outcome.value });
        return false;
      }
      diag("rank.error", { ...roomFields(room), playerId: obligation.playerId, gameId: obligation.gameId, attempts: (room.rankAttempts ?? 0) + 1,
        message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) }, "error");
      return true;
    });
    if (!next.rankPending.length) { delete next.rankPending; delete next.rankRetryAt; delete next.rankAttempts; }
    else { next.rankAttempts = (room.rankAttempts ?? 0) + 1; next.rankRetryAt = now + rankRetryDelay(next.rankAttempts); }
    next.revision++;
    await this.commit(next);
    this.broadcast();
  }
  private send(ws: WebSocket, message: ServerMessage): boolean {
    try { ws.send(JSON.stringify(message)); return true; } catch { return false; /* Closed sockets have no state authority. */ }
  }
  private broadcast(): number | undefined {
    if (!this.room) return;
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    const connected = sockets.map((ws) => (ws.deserializeAttachment() as Attachment | null)?.playerId).filter((id): id is string => !!id);
    // Per seat: matches on screen, authorized reveal frames per match and elapsed time of the first one.
    const views: { p: string; m: number; f: (number | null)[]; e?: number }[] = [];
    let failed = 0;
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a?.playerId || a.roomId !== this.room.roomId) continue;
      const payload = createPlayerView(this.room, a.playerId, connected, now);
      if (!this.send(ws, { type: "PLAYER_VIEW", payload })) failed += 1;
      const shown = payload.matches.find((match) => match.disclosure);
      views.push({ p: a.playerId, m: payload.matches.length, f: payload.matches.map((match) => match.disclosure?.frames.length ?? null),
        ...(shown ? { e: Math.round(shown.disclosure!.elapsedMs) } : {}) });
    }
    const schedule = this.room.presentation;
    diag("broadcast", { ...roomFields(this.room), sockets: sockets.length, sent: views.length - failed, failed, views,
      ...(schedule ? { presentation: { key: schedule.key, startsAt: schedule.startsAt, endsAt: schedule.endsAt, inMs: schedule.startsAt - now } } : {}) });
    return now;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = request.headers.get("X-Room-Id");
    if (!roomId || !/^[A-Z2-9]{6}$/.test(roomId)) return new Response("Bad room", { status: 400 });
    if (url.pathname === "/internal/create" && request.method === "POST") {
      return this.ctx.blockConcurrencyWhile(async () => {
        if (this.room) return new Response("Room exists", { status: 409 });
        const secret = token();
        const identity = roomAccountIdentity(request.headers);
        const solo = request.headers.get("X-Internal-Porena-Solo") === "1";
        if (solo && !identity) return new Response("Ranked solo needs an account", { status: 400 });
        const seated = addSession(createRoom(roomId, randomSeed(), "secure", 2, true), await hash(secret), identity);
        const { playerId } = seated;
        // A ranked solo game starts at once; any other new room is a lobby with the 30-minute idle expiry.
        const room = solo ? startSolo(seated.room) : seated.room;
        await this.commit(room);
        await this.rescheduleAlarm();
        return Response.json({ roomId, playerId, token: secret }, { status: 201, headers: { "Cache-Control": "no-store" } });
      });
    }
    if (!this.room || this.room.roomId !== roomId) return new Response("Room not found", { status: 404 });
    if (url.pathname === "/internal/connection-ticket" && request.method === "POST") {
      return this.ctx.blockConcurrencyWhile(async () => {
        const secret = request.headers.get("X-Porena-Session");
        if (!secret || !/^[a-f0-9]{64}$/.test(secret)) return new Response("Invalid session", { status: 401 });
        const digest = await hash(secret);
        const session = this.room!.sessions.find(session => session.tokenHash === digest);
        if (!session) return new Response("Invalid session", { status: 401 });
        const ticket = token();
        const expiresAt = Date.now() + TICKET_LIFETIME_MS;
        const next = Object.fromEntries(Object.entries(this.tickets).filter(([, entry]) => entry.expiresAt > Date.now()));
        next[session.playerId] = { digest: await hash(ticket), expiresAt };
        await this.ctx.storage.put(TICKET_KEY, next);
        this.tickets = next;
        await this.rescheduleAlarm();
        return Response.json({ ticket, expiresAt }, { status: 201, headers: { "Cache-Control": "no-store" } });
      });
    }
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
        const identity = roomAccountIdentity(request.headers);
        if (identity && this.room!.sessions.some(session => session.accountUserId === identity.accountUserId)) return Response.json({ error: "ACCOUNT_ALREADY_SEATED" }, { status: 409, headers: { "Cache-Control": "no-store" } });
        const secret = token();
        const { room, playerId } = addSession(this.room!, await hash(secret), identity);
        await this.commit(room); this.broadcast();
        return Response.json({ roomId, playerId, token: secret }, { status: 201, headers: { "Cache-Control": "no-store" } });
      });
    }
    if (url.pathname !== "/internal/ws" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Not found", { status: 404 });
    return this.ctx.blockConcurrencyWhile(async () => {
      const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map(value => value.trim());
      const proofs = protocols.filter(value => value.startsWith("porena-ticket-"));
      let verifiedPlayerId: string | undefined;
      if (proofs.length) {
        if (proofs.length !== 1 || !protocols.includes("porena-v1") || !/^porena-ticket-[a-f0-9]{64}$/.test(proofs[0]!)) return new Response("Invalid ticket", { status: 401 });
        const digest = await hash(proofs[0]!.slice("porena-ticket-".length));
        verifiedPlayerId = Object.keys(this.tickets).find(id => this.tickets[id]!.digest === digest && this.tickets[id]!.expiresAt > Date.now());
        if (!verifiedPlayerId) return new Response("Invalid ticket", { status: 401 });
        const next = { ...this.tickets }; delete next[verifiedPlayerId];
        await this.ctx.storage.put(TICKET_KEY, next);
        this.tickets = next; // Consume atomically before accepting; hibernation cannot revive it.
        for (const socket of this.ctx.getWebSockets()) {
          const attachment = socket.deserializeAttachment() as Attachment | null;
          if (!attachment?.playerId && attachment?.verifiedPlayerId === verifiedPlayerId) socket.close(4001, "Pending connection replaced");
        }
        // Rooms hibernated by the previous version may retain 24 unauthenticated
        // sockets. Apply the new pending bound before reserving a proven seat.
        const legacy = this.ctx.getWebSockets().filter(socket => {
          const attachment = socket.deserializeAttachment() as Attachment | null;
          return socket.readyState === WebSocket.OPEN && !attachment?.playerId && !attachment?.verifiedPlayerId;
        }).sort((a, b) => (a.deserializeAttachment() as Attachment).joinedAt - (b.deserializeAttachment() as Attachment).joinedAt);
        for (const socket of legacy.slice(LEGACY_PENDING_LIMIT)) socket.close(4001, "Pending capacity reduced");
      }
      const open = this.ctx.getWebSockets().filter(socket => socket.readyState === WebSocket.OPEN);
      const legacyPending = open.filter(socket => {
        const attachment = socket.deserializeAttachment() as Attachment | null;
        return !attachment?.playerId && !attachment?.verifiedPlayerId;
      });
      if (open.length >= 24 || !verifiedPlayerId && legacyPending.length >= LEGACY_PENDING_LIMIT) return new Response("Too many connections", { status: 429 });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ roomId, playerId: null, ...(verifiedPlayerId ? { verifiedPlayerId } : {}), joinedAt: Date.now() } satisfies Attachment);
      await this.rescheduleAlarm();
      return new Response(null, { status: 101, webSocket: client, ...(verifiedPlayerId ? { headers: { "Sec-WebSocket-Protocol": "porena-v1" } } : {}) });
    });
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      let requestId: string | undefined;
      let type: string | undefined;
      const startedAt = Date.now();
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
        type = message.type;
        const attachment = ws.deserializeAttachment() as Attachment | null;
        if (!this.room || !attachment || attachment.roomId !== this.room.roomId) throw new Error("방 연결이 없습니다.");
        if (message.type === "JOIN_ROOM") {
          if (attachment.playerId) throw new Error("이미 인증된 연결입니다.");
          const digest = await hash(message.token);
          const session = this.room.sessions.find((s) => s.tokenHash === digest);
          if (!session || attachment.verifiedPlayerId && attachment.verifiedPlayerId !== session.playerId) { this.send(ws, { type: "ERROR", code: "SESSION_INVALID", message: "세션을 복원할 수 없습니다." }); ws.close(1008, "Invalid session"); return; }
          if (message.nickname && !session.accountUserId && this.room.status === "LOBBY") {
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
          diag("ws.join", { ...roomFields(this.room), playerId: session.playerId, resumed: !!resumed });
          this.send(ws, { type: "ROOM_JOINED", roomId: this.room.roomId, playerId: session.playerId });
          this.broadcast(); return;
        }
        if (message.type === "SYNC_CLOCK") {
          if (!attachment.playerId) throw new Error("먼저 세션을 연결하세요.");
          this.send(ws, { type: "CLOCK_SYNC", nonce: message.nonce, receivedAt: now, sentAt: Date.now() });
          // Returning tabs receive the current authorized reveal, never an old replay.
          const disclosedAt = Date.now();
          this.send(ws, { type: "PLAYER_VIEW", payload: createPlayerView(this.room, attachment.playerId, this.ctx.getWebSockets().map(socket => (socket.deserializeAttachment() as Attachment | null)?.playerId).filter((id): id is string => !!id), disclosedAt) });
          await this.rescheduleAlarm(disclosedAt);
          return;
        }
        requestId = message.requestId;
        if (!attachment.playerId) { this.send(ws, { type: "ERROR", code: "SESSION_REQUIRED", message: "먼저 세션을 연결하세요.", requestId }); ws.close(1008, "Authentication required"); return; }
        const session = this.room.sessions.find((s) => s.playerId === attachment.playerId)!;
        if (session.requests.includes(requestId)) { this.send(ws, { type: "ACK", requestId, revision: this.room.revision }); this.broadcast(); return; }
        const candidate = structuredClone(this.room);
        // Production draws use Workers crypto; seeded mode is reserved for local simulations/tests.
        candidate.game.randomMode = "secure";
        if (this.room.publicTurnKey && message.turnKey !== this.room.publicTurnKey.key) throw new Error("단계가 변경되었습니다. 최신 화면에서 다시 시도하세요.");
        const next = applyRoomAction(candidate, session.playerId, message, this.room.publicTurnKey ? turnKey(candidate) : message.turnKey, Date.now());
        next.sessions.find((s) => s.playerId === session.playerId)!.requests = [...session.requests, requestId].slice(-64);
        const fromPhase = roomFields(this.room).phase;
        await this.commit(next);
        await this.rescheduleAlarm();
        diag("action", { ...roomFields(next), playerId: session.playerId, type, ok: true, from: fromPhase, ms: Date.now() - startedAt });
        this.send(ws, { type: "ACK", requestId, revision: next.revision });
        this.broadcast();
      } catch (error) {
        const legacyMessage = error instanceof SyntaxError ? "JSON 메시지가 필요합니다." : error instanceof Error ? error.message : "명령을 처리하지 못했습니다.";
        const playerId = (ws.deserializeAttachment() as Attachment | null)?.playerId ?? null;
        diag("action", { ...roomFields(this.room), playerId, type: type ?? "unparsed", ok: false, code: classifyGameError(legacyMessage).code, ms: Date.now() - startedAt });
        this.send(ws, { type: "ERROR", ...classifyGameError(legacyMessage), message: legacyMessage, requestId });
      }
    });
  }
  webSocketClose(ws: WebSocket, code: number): void {
    diag("ws.close", { ...roomFields(this.room), playerId: (ws.deserializeAttachment() as Attachment | null)?.playerId ?? null, code });
    // Peer reports can contain reserved codes such as 1006 that cannot be sent back.
    ws.close(); this.broadcast();
  }
  webSocketError(ws: WebSocket, error: unknown): void {
    diag("ws.error", { ...roomFields(this.room), playerId: (ws.deserializeAttachment() as Attachment | null)?.playerId ?? null,
      error: error instanceof Error ? error.message : String(error) }, "error");
    ws.close(1011, "Connection error");
  }
  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      await this.flushRank(now);
      if (this.expiresAt && now >= this.expiresAt && this.room?.rankPending?.length) {
        // Expiry would erase a ranked outcome D1 has not confirmed yet: keep the room until it lands.
        this.expiresAt = now + RANK_EXPIRY_GRACE_MS;
        await this.ctx.storage.put(EXPIRY_KEY, this.expiresAt);
        diag("room.expiryDeferred", { ...roomFields(this.room), pending: this.room.rankPending.length });
      }
      if (this.expiresAt && now >= this.expiresAt) {
        diag("room.expired", roomFields(this.room));
        for (const ws of this.ctx.getWebSockets()) ws.close(1008, "Room expired");
        await this.ctx.storage.delete([SNAPSHOT_KEY, EXPIRY_KEY, TICKET_KEY]);
        this.tickets = {};
        this.room = undefined;
        this.expiresAt = undefined;
        await this.ctx.storage.deleteAlarm();
        return;
      }
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment | null;
        if (!a?.playerId && (!a || now - a.joinedAt >= AUTH_TIMEOUT_MS)) ws.close(1008, "Authentication timeout");
      }
      const activeTickets = Object.fromEntries(Object.entries(this.tickets).filter(([, ticket]) => ticket.expiresAt > now));
      if (Object.keys(activeTickets).length !== Object.keys(this.tickets).length) {
        await this.ctx.storage.put(TICKET_KEY, activeTickets);
        this.tickets = activeTickets;
      }
      let disclosedAt: number | undefined;
      const from = this.room && { phase: this.room.game.phase, revision: this.room.revision };
      let forced = false;
      try {
        if (this.room) {
          // Bots stand in for whoever the barrier is still waiting on, so one
          // unresponsive player can never strand the rest of the room.
          const next = forceBarrier(this.room, now);
          if (next) { forced = true; await this.commit(next); }
          disclosedAt = this.broadcast();
        }
        await this.rescheduleAlarm(disclosedAt);
      } catch (error) {
        // Rethrown so the runtime still retries. Without this line a handler that keeps throwing stalls the room silently.
        diag("alarm.error", { ...roomFields(this.room), retryCount: info?.retryCount ?? 0, forced, name: error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined }, "error");
        throw error;
      }
      diag("alarm.run", { ...roomFields(this.room), scheduledAt: info?.scheduledTime ?? null, lateMs: info ? now - info.scheduledTime : null,
        retryCount: info?.retryCount ?? 0, forced, from: from?.phase, fromRevision: from?.revision, ms: Date.now() - now });
    });
  }
}
