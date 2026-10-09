import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerView, ServerMessage } from "../shared/protocol";
import { acceptsView, createRoomConnection, PROBE_INTERVAL_MS, RESPONSE_TIMEOUT_MS } from "./roomConnection";

class Socket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  send(raw: string) { this.sent.push(raw); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: "" }); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(message: ServerMessage) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
const view = (revision = 3, serverNow = Date.now()): ServerMessage => ({ type: "PLAYER_VIEW", payload: {
  revision, serverNow, phase: "ROUND_RESULT", round: 1,
  presentation: { disclosureMode: "prefix", complete: false },
} as PlayerView });
const disposers: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); vi.stubGlobal("WebSocket", Socket); });
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function setup(overrides: Partial<Parameters<typeof createRoomConnection>[0]> = {}) {
  const sockets: Socket[] = [];
  let visible = true;
  let active = true;
  let suspendedMs = 0;
  const options = {
    protocols: vi.fn(async (_signal: AbortSignal) => ["porena-v1"]),
    open: vi.fn(() => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; }),
    join: () => JSON.stringify({ type: "JOIN_ROOM", token: "TEST-ONLY" }),
    needsClock: () => active,
    visible: () => visible,
    onStatus: vi.fn(), onError: vi.fn(), onMessage: vi.fn(), onClock: vi.fn(), onResume: vi.fn(), onExpired: vi.fn(),
    monotonicNow: () => Date.now() + suspendedMs,
    ...overrides,
  };
  const connection = createRoomConnection(options);
  disposers.push(connection.dispose);
  await Promise.resolve();
  const authenticate = (socket = sockets.at(-1)!) => {
    socket.open(); socket.message({ type: "ROOM_JOINED", roomId: "ABCDEF", playerId: "p1" }); socket.message(view());
  };
  return { connection, sockets, options, authenticate, setVisible: (value: boolean) => { visible = value; },
    setActive: (value: boolean) => { active = value; }, suspend: (ms: number) => { suspendedMs += ms; } };
}

describe("room transport recovery", () => {
  it.each([401, 404, 410])("keeps ticket HTTP %i terminal without retrying on resume", async status => {
    const protocols = vi.fn(async () => { throw new Error("Connection ticket unavailable", { cause: status }); });
    const h = await setup({ protocols });
    h.connection.resume();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(protocols).toHaveBeenCalledTimes(1);
    expect(h.sockets).toHaveLength(0);
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Disconnected");
    if (status === 401) {
      expect(h.options.onExpired).not.toHaveBeenCalled();
      expect(h.options.onError).toHaveBeenLastCalledWith("client.reconnectFailed");
    } else expect(h.options.onExpired).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503])("retries transient ticket HTTP %i", async status => {
    const protocols = vi.fn(async () => { throw new Error("Connection ticket unavailable", { cause: status }); });
    const h = await setup({ protocols });
    await vi.advanceTimersByTimeAsync(1000);
    expect(protocols).toHaveBeenCalledTimes(2);
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Reconnecting");
    expect(h.options.onExpired).not.toHaveBeenCalled();
  });
  it("replaces an OPEN blackholed socket and resumes with an authorized same-revision reveal", async () => {
    const h = await setup(); h.authenticate();
    const old = h.sockets[0]!;
    await vi.advanceTimersByTimeAsync(1000 + RESPONSE_TIMEOUT_MS);
    expect(old.sent.some(raw => JSON.parse(raw).type === "SYNC_CLOCK")).toBe(true);
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Reconnecting");
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets).toHaveLength(2);
    h.authenticate();
    h.sockets[1]!.message(view(3, Date.now() + 1));
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Connected");
    expect(h.options.onMessage).toHaveBeenLastCalledWith(view(3, Date.now() + 1));
    const count = vi.mocked(h.options.onMessage).mock.calls.length;
    old.message(view(99)); old.onclose?.({ code: 4001, reason: "replaced" }); old.onerror?.();
    expect(h.options.onMessage).toHaveBeenCalledTimes(count);
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Connected");
  });

  it("requires a view after a pong, and bounds failures with backoff instead of spinning", async () => {
    const h = await setup(); h.authenticate();
    await vi.advanceTimersByTimeAsync(1000);
    const probe = JSON.parse(h.sockets[0]!.sent.at(-1)!);
    h.sockets[0]!.message({ type: "CLOCK_SYNC", nonce: probe.nonce, receivedAt: Date.now(), sentAt: Date.now() });
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1_000);
    expect(h.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(h.sockets).toHaveLength(6); // initial plus five bounded retries
    expect(h.options.onError).toHaveBeenLastCalledWith("client.reconnectFailed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sockets).toHaveLength(6);
    h.connection.resume(); // explicit foreground/online event starts a new bounded attempt
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets).toHaveLength(7);
  });

  it.each(["upgrade", "join", "view"])("times out a hung %s handshake", async stage => {
    const h = await setup();
    if (stage !== "upgrade") h.sockets[0]!.open();
    if (stage === "view") h.sockets[0]!.message({ type: "ROOM_JOINED", roomId: "ABCDEF", playerId: "p1" });
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);
    expect(h.sockets).toHaveLength(2);
    expect(h.options.onStatus).not.toHaveBeenCalledWith("Connected");
  });

  it("aborts hung ticket requests and ignores their late completion", async () => {
    let resolve!: (value: string[]) => void;
    const protocols = vi.fn((_signal: AbortSignal) => new Promise<string[]>(done => { resolve = done; }));
    const h = await setup({ protocols });
    const first = resolve;
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);
    expect(protocols.mock.calls[0]![0].aborted).toBe(true);
    first(["late"]); await Promise.resolve();
    expect(h.sockets).toHaveLength(0);
    resolve(["current"]); await Promise.resolve();
    expect(h.sockets).toHaveLength(1);
  });

  it("does not poll idle rooms, but explicitly resyncs idle rooms on return or action timeout", async () => {
    const h = await setup(); h.setActive(false); h.authenticate();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sockets[0]!.sent).toHaveLength(1); // JOIN only
    h.connection.resume();
    expect(JSON.parse(h.sockets[0]!.sent.at(-1)!).type).toBe("SYNC_CLOCK");
    h.sockets[0]!.message(view());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.sockets[0]!.sent).toHaveLength(2);
    h.connection.sync();
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 1000);
    expect(h.sockets).toHaveLength(2);
  });

  it("suspends hidden-tab probes/retries and gives returning tabs a fresh response window", async () => {
    const h = await setup(); h.authenticate();
    await vi.advanceTimersByTimeAsync(1000);
    h.setVisible(false); h.connection.resume();
    const sent = h.sockets[0]!.sent.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.sockets).toHaveLength(1); expect(h.sockets[0]!.sent).toHaveLength(sent);
    h.setVisible(true); h.connection.resume();
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS - 1000);
    expect(h.sockets).toHaveLength(1);
    h.sockets[0]!.message(view());
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Connected");
  });

  it("treats long event-loop suspension as a fresh resync, not a missed-heartbeat failure", async () => {
    const h = await setup(); h.authenticate();
    await vi.advanceTimersByTimeAsync(1000);
    h.suspend(120_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets).toHaveLength(1);
    h.sockets[0]!.message(view());
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Connected");
  });

  it("does not turn a device wall-clock jump into a transport timeout", async () => {
    let monotonic = 0;
    const h = await setup({ monotonicNow: () => monotonic }); h.authenticate();
    monotonic = 1000;
    await vi.advanceTimersByTimeAsync(1000);
    vi.setSystemTime(Date.now() + 3_600_000);
    monotonic += 1000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets).toHaveLength(1);
    expect(h.options.onStatus).toHaveBeenLastCalledWith("Connected");
    h.sockets[0]!.message(view());
  });

  it.each([4001, 1008])("keeps close %s terminal across visibility/online events", async code => {
    const h = await setup(); h.authenticate();
    h.sockets[0]!.onclose?.({ code, reason: "" });
    h.connection.resume();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.options.onError).toHaveBeenLastCalledWith(code === 4001 ? "client.otherTab" : "client.reconnectFailed");
  });

  it("reconnects on error without depending on a close event, and disposes queued work", async () => {
    const h = await setup(); h.authenticate();
    h.sockets[0]!.onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.sockets).toHaveLength(2);
    h.connection.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.sockets).toHaveLength(2);
  });

  it("accepts progressing same-revision prefixes and ignores reordered older views", () => {
    const previous = { revision: 3, serverNow: 2000 };
    expect(acceptsView(previous, { revision: 3, serverNow: 2100 })).toBe(true);
    expect(acceptsView(previous, previous)).toBe(true);
    expect(acceptsView(previous, { revision: 3, serverNow: 1999 })).toBe(false);
    expect(acceptsView(previous, { revision: 2, serverNow: 3000 })).toBe(false);
    expect(acceptsView(previous, { revision: 4, serverNow: 1000 })).toBe(true);
  });

  it("keeps live broadcasts healthy even with a slow clock response", async () => {
    const h = await setup(); h.authenticate();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
      h.sockets[0]!.message(view());
    }
    expect(h.sockets).toHaveLength(1);
  });
});
