import type { PlayerView, ServerMessage } from "../shared/protocol";

export const RESPONSE_TIMEOUT_MS = 15_000;
export const PROBE_INTERVAL_MS = 10_000;
const MAX_RETRIES = 5;
type Status = "Connecting" | "Connected" | "Reconnecting" | "Disconnected";
type ViewStamp = Pick<PlayerView, "revision" | "serverNow">;

// Reveals advance serverNow without changing the room revision. Never require a
// revision increment, and never let a delayed prefix replace a newer one.
export function acceptsView(previous: ViewStamp | undefined, next: ViewStamp): boolean {
  return !previous || next.revision > previous.revision
    || next.revision === previous.revision && next.serverNow >= previous.serverNow;
}

type Options = {
  protocols: (signal: AbortSignal) => Promise<string[]>;
  open: (protocols: string[]) => WebSocket;
  join: () => string;
  needsClock: () => boolean;
  visible: () => boolean;
  onStatus: (status: Status) => void;
  onError: (error: string) => void;
  onMessage: (message: ServerMessage) => void;
  onClock: (sent: number, received: number, serverReceived: number, serverSent: number) => void;
  onResume: () => void;
  onExpired: () => void;
  // Only state metadata is emitted. No credentials, cards, names or message bodies.
  diagnostic?: (event: string, detail: Record<string, number | string>) => void;
  monotonicNow?: () => number;
};

/** Bounded transport recovery; it never advances game or disclosure state itself. */
export function createRoomConnection(options: Options) {
  const now = options.monotonicNow ?? (() => performance.now());
  let disposed = false;
  let terminal = false;
  let exhausted = false;
  let generation = 0;
  let retries = 0;
  let ws: WebSocket | undefined;
  let joined = false;
  let connected = false;
  let controller: AbortController | undefined;
  let connectingSince: number | undefined;
  let awaitingViewSince: number | undefined;
  let retryAt: number | undefined;
  let nextProbe = 0;
  let lastTick = now();
  let previousView: ViewStamp | undefined;
  const probes = new Map<string, number>();
  const diagnostic = (event: string, detail: Record<string, number | string> = {}) =>
    options.diagnostic?.(event, { generation, readyState: ws?.readyState ?? -1, ...detail });

  const retire = () => {
    // Invalidate first: queued onmessage/onclose and late ticket completions are inert.
    generation++;
    controller?.abort(); controller = undefined;
    const old = ws; ws = undefined;
    joined = false; connected = false; connectingSince = undefined;
    awaitingViewSince = undefined; probes.clear();
    old?.close(1000, "Transport recovery");
  };
  const retry = (reason: string) => {
    diagnostic("retry", { reason });
    retire();
    if (disposed || terminal) return;
    if (retries >= MAX_RETRIES) {
      exhausted = true; options.onStatus("Disconnected"); options.onError("client.reconnectFailed"); return;
    }
    retryAt = now() + Math.min(1000 * 2 ** retries++, 10_000);
    options.onStatus("Reconnecting");
  };
  const sync = () => {
    if (disposed || terminal || !options.visible() || !joined || ws?.readyState !== WebSocket.OPEN) return;
    const nonce = crypto.randomUUID();
    probes.set(nonce, Date.now());
    if (probes.size > 8) probes.delete(probes.keys().next().value!);
    awaitingViewSince ??= now();
    nextProbe = now() + PROBE_INTERVAL_MS;
    try { ws.send(JSON.stringify({ type: "SYNC_CLOCK", nonce })); }
    catch { retry("probe-send"); }
  };
  const connect = async () => {
    if (disposed || terminal) return;
    retryAt = undefined;
    connectingSince = now();
    options.onStatus("Connecting");
    options.onResume();
    const current = ++generation;
    controller = new AbortController();
    try {
      const protocols = await options.protocols(controller.signal);
      if (disposed || current !== generation) return;
      const socket = options.open(protocols);
      ws = socket;
      const active = () => !disposed && current === generation && socket === ws;
      socket.onopen = () => {
        if (!active()) return;
        try { socket.send(options.join()); } catch { retry("join-send"); }
      };
      socket.onmessage = event => {
        if (!active()) return;
        let message: ServerMessage;
        try { message = JSON.parse(event.data as string) as ServerMessage; }
        catch { retry("invalid-message"); return; }
        if (message.type === "ROOM_JOINED") joined = true;
        if (message.type === "CLOCK_SYNC") {
          const sent = probes.get(message.nonce);
          if (sent !== undefined) options.onClock(sent, Date.now(), message.receivedAt, message.sentAt);
          probes.delete(message.nonce);
          // A pong alone is insufficient: its paired authorized PLAYER_VIEW must arrive.
        }
        if (message.type === "PLAYER_VIEW") {
          if (!joined || !acceptsView(previousView, message.payload)) {
            diagnostic("stale-view", { revision: message.payload.revision, serverNow: message.payload.serverNow }); return;
          }
          previousView = { revision: message.payload.revision, serverNow: message.payload.serverNow };
          connectingSince = undefined; awaitingViewSince = undefined;
          if (!connected) {
            connected = true; retries = 0; nextProbe = now();
            options.onStatus("Connected"); options.onError("");
          }
          diagnostic("view", { ...previousView, phase: message.payload.phase, round: message.payload.round });
        }
        options.onMessage(message);
      };
      socket.onclose = event => {
        if (!active()) return;
        diagnostic("close", { code: event.code });
        if (event.code === 4001 || event.code === 1008) {
          terminal = true; retire(); options.onStatus("Disconnected");
          if (event.code === 1008 && event.reason === "Room expired") options.onExpired();
          else options.onError(event.code === 4001 ? "client.otherTab" : "client.reconnectFailed");
          return;
        }
        retry("socket-close");
      };
      socket.onerror = () => { if (active()) retry("socket-error"); };
    } catch (error) {
      if (disposed || current !== generation) return;
      if (error instanceof Error && (error.cause === 401 || error.cause === 404 || error.cause === 410)) {
        terminal = true; retire(); options.onStatus("Disconnected");
        if (error.cause === 404 || error.cause === 410) options.onExpired();
        else options.onError("client.reconnectFailed");
        return;
      }
      retry("connection-ticket");
    }
  };
  const resume = () => {
    lastTick = now();
    awaitingViewSince = undefined; probes.clear();
    if (disposed || terminal || !options.visible()) return;
    options.onResume();
    // A real visibility/online event may recover an exhausted transient outage.
    // Session replacement/auth rejection remain terminal to avoid stealing seats.
    if (exhausted) { exhausted = false; retries = 0; retryAt = now(); }
    // Browser suspension is not evidence of network failure. Give a fresh probe
    // a full response window before replacing an otherwise-open connection.
    if (connectingSince !== undefined) connectingSince = now();
    if (retryAt !== undefined) retryAt = now();
    sync();
  };
  const timer = setInterval(() => {
    const time = now();
    const suspended = time - lastTick > 5_000;
    lastTick = time;
    if (disposed || terminal || exhausted || !options.visible()) return;
    if (suspended) resume();
    if (retryAt !== undefined && time >= retryAt) { void connect(); return; }
    if (connectingSince !== undefined && time - connectingSince >= RESPONSE_TIMEOUT_MS) { retry("handshake-timeout"); return; }
    if (awaitingViewSince !== undefined && time - awaitingViewSince >= RESPONSE_TIMEOUT_MS) { retry("view-timeout"); return; }
    if (connected && options.needsClock() && time >= nextProbe) sync();
  }, 1000);
  void connect();
  return {
    sync, resume,
    send(raw: string): boolean {
      if (!connected || ws?.readyState !== WebSocket.OPEN) return false;
      try { ws.send(raw); return true; } catch { retry("action-send"); return false; }
    },
    dispose() { disposed = true; clearInterval(timer); retire(); },
  };
}
