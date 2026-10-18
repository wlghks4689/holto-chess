-- PUBLIC-ROOMS-002: registry and search summary of public rooms (PUBLIC_LOBBY_DB, separate from accounts and feedback).
-- GameRoom stays the authority for seats and the game. This table only answers "which rooms can I look for" and
-- enforces the cap on live public rooms. Nothing here is a card, a ruling or a game snapshot.
CREATE TABLE public_rooms (
  instance_id      TEXT PRIMARY KEY NOT NULL,          -- 128-bit hex, differs for every creation of a room
  room_code        TEXT NOT NULL,
  creator_key      TEXT NOT NULL,                      -- HMAC of the creator identity. Internal: never in a response or log
  request_id       TEXT NOT NULL,                      -- the creator's idempotency key
  network_key      TEXT,                               -- HMAC of the creating IP, for the per-network create limit. Internal
  state            TEXT NOT NULL CHECK (state IN ('PROVISIONING', 'WAITING', 'PLAYING', 'FINISHED', 'CLOSED', 'CANCELLED')),
  slot_held        INTEGER NOT NULL DEFAULT 1 CHECK (slot_held IN (0, 1)),  -- 1 counts against the live-room cap
  confirmed_count  INTEGER NOT NULL DEFAULT 0,
  reserved_count   INTEGER NOT NULL DEFAULT 0,
  capacity         INTEGER NOT NULL DEFAULT 8,
  summary_seq      INTEGER NOT NULL DEFAULT 0,         -- room-issued, increases on every change and lease renewal
  rules_version    INTEGER NOT NULL,
  protocol_version INTEGER NOT NULL,
  language         TEXT,
  region_hint      TEXT,
  created_at       INTEGER NOT NULL,
  observed_at      INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL,                   -- observed_at + 90s as the room saw it. Never extended on receipt
  room_expires_at  INTEGER NOT NULL,
  repair_due_at    INTEGER,                            -- the minute Cron asks the room about itself after this time
  closed_at        INTEGER
);

-- A creator retrying one create finds the same row, even after the room is gone.
CREATE UNIQUE INDEX idx_public_rooms_request ON public_rooms (creator_key, request_id);
-- A code names at most one live room. Closed rows release it.
CREATE UNIQUE INDEX idx_public_rooms_live_code ON public_rooms (room_code) WHERE slot_held = 1;
-- The list reads only rooms that can still take a seat.
CREATE INDEX idx_public_rooms_list ON public_rooms (created_at, instance_id) WHERE state = 'WAITING';
-- One live room per creator, and the recent creations of one network.
CREATE INDEX idx_public_rooms_creator ON public_rooms (creator_key) WHERE slot_held = 1;
CREATE INDEX idx_public_rooms_network ON public_rooms (network_key, created_at);
-- Cron repair reads only live rooms that are due.
CREATE INDEX idx_public_rooms_repair ON public_rooms (repair_due_at) WHERE slot_held = 1;
