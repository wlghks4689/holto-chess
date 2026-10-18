import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applySummary, claimPublicSlot, countLiveRooms, fenceRoomCreation, findByInstance, findByRequest, moveClaimToCode, PUBLIC_ROOMS_MAX, releasePublicSlot, type ClaimInput,
} from "../../worker/publicLobby";

const db = (env as unknown as { PUBLIC_LOBBY_DB: D1Database }).PUBLIC_LOBBY_DB;
const T0 = 1_800_000_000_000;
let sequence = 0;
const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");
/** A distinct creator, request, instance and code per call unless overridden. */
function claim(overrides: Partial<ClaimInput> = {}): ClaimInput {
  const n = ++sequence;
  return { instanceId: hex(n, 32), roomCode: `C${hex(n, 5).toUpperCase()}`.slice(0, 6), creatorKey: `creator-${n}`, requestId: `request-${n}`,
    now: T0, cap: PUBLIC_ROOMS_MAX, rulesVersion: 2, protocolVersion: 1, ...overrides };
}
beforeEach(async () => { await db.prepare("DELETE FROM public_rooms").run(); });

describe("public room registry (PUBLIC-ROOMS-002 2-A)", () => {
  it("creates the schema with the partial indexes the cap and the list rely on", async () => {
    const indexes = (await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'public_rooms' AND sql IS NOT NULL").all<{ name: string; sql: string }>()).results;
    expect(indexes.map(index => index.name).sort()).toEqual(["idx_public_rooms_creator", "idx_public_rooms_list", "idx_public_rooms_live_code",
      "idx_public_rooms_network", "idx_public_rooms_repair", "idx_public_rooms_request"]);
    expect(indexes.find(index => index.name === "idx_public_rooms_live_code")!.sql).toMatch(/WHERE slot_held = 1/);
  });

  it("claims a PROVISIONING slot that expires its provisioning window and lease from the claim time", async () => {
    const input = claim();
    const result = await claimPublicSlot(db, input);
    expect(result.kind).toBe("claimed");
    if (result.kind !== "claimed") return;
    expect(result.row).toMatchObject({ instanceId: input.instanceId, roomCode: input.roomCode, state: "PROVISIONING", slotHeld: true,
      confirmedCount: 0, reservedCount: 0, capacity: 8, summarySeq: 0, createdAt: T0, observedAt: T0 });
    expect(result.row.leaseExpiresAt).toBe(T0 + 90_000);
    expect(result.row.repairDueAt).toBe(T0 + 120_000);
    expect(result.row.roomExpiresAt).toBe(T0 + 60 * 60_000);
  });

  it("lets exactly `cap` of many concurrent creators through and refuses the rest as capacity", async () => {
    const cap = 7;
    const results = await Promise.all(Array.from({ length: 40 }, () => claimPublicSlot(db, claim({ cap }))));
    expect(results.filter(result => result.kind === "claimed")).toHaveLength(cap);
    expect(new Set(results.filter(result => result.kind !== "claimed").map(result => result.kind))).toEqual(new Set(["capacity"]));
    expect(await countLiveRooms(db)).toBe(cap);
  });

  it("enforces the real 100-room cap and frees a slot once a room ends", async () => {
    for (let i = 0; i < PUBLIC_ROOMS_MAX; i++) expect((await claimPublicSlot(db, claim())).kind).toBe("claimed");
    const over = claim();
    expect((await claimPublicSlot(db, over)).kind).toBe("capacity");
    const first = (await db.prepare("SELECT instance_id FROM public_rooms ORDER BY created_at, instance_id LIMIT 1").first<{ instance_id: string }>())!;
    expect(await releasePublicSlot(db, first.instance_id, "CLOSED", T0 + 5)).toBe(true);
    expect(await releasePublicSlot(db, first.instance_id, "CLOSED", T0 + 6)).toBe(false); // repeating is harmless
    expect((await claimPublicSlot(db, over)).kind).toBe("claimed");
    expect(await countLiveRooms(db)).toBe(PUBLIC_ROOMS_MAX);
  });

  it("maps one create request to one row for good, concurrently and after the room has closed", async () => {
    const input = claim();
    const results = await Promise.all(Array.from({ length: 20 }, () => claimPublicSlot(db, input)));
    expect(results.filter(result => result.kind === "claimed")).toHaveLength(1);
    expect(results.every(result => (result.kind === "claimed" || result.kind === "existing") && result.row.instanceId === input.instanceId)).toBe(true);
    await releasePublicSlot(db, input.instanceId, "CLOSED", T0 + 10);
    // A late retry with another derived instance or code still lands on the closed row, never a new room.
    const late = await claimPublicSlot(db, { ...input, instanceId: hex(999_999, 32), roomCode: "ZZZZZZ" });
    expect(late).toMatchObject({ kind: "existing", row: { instanceId: input.instanceId, state: "CLOSED", slotHeld: false } });
    expect(await countLiveRooms(db)).toBe(0);
  });

  it("treats a code held by a live room as taken, and a closed room's code as free again", async () => {
    const holder = claim({ roomCode: "ABC234" });
    await claimPublicSlot(db, holder);
    expect((await claimPublicSlot(db, claim({ roomCode: "ABC234" }))).kind).toBe("code_taken");
    await releasePublicSlot(db, holder.instanceId, "FINISHED", T0 + 1);
    expect((await claimPublicSlot(db, claim({ roomCode: "ABC234" }))).kind).toBe("claimed");
  });

  it("allows one live room per creator, and a new one after it ends (2-C)", async () => {
    const first = claim({ creatorKey: "same-creator" });
    expect((await claimPublicSlot(db, first)).kind).toBe("claimed");
    expect((await claimPublicSlot(db, claim({ creatorKey: "same-creator" }))).kind).toBe("creator_busy");
    await releasePublicSlot(db, first.instanceId, "FINISHED", T0 + 1);
    expect((await claimPublicSlot(db, claim({ creatorKey: "same-creator" }))).kind).toBe("claimed");
  });

  it("lets one network create five rooms per ten minutes, then again once the window passes (2-C)", async () => {
    const networkKey = "e".repeat(64);
    for (let i = 0; i < 5; i++) expect((await claimPublicSlot(db, claim({ networkKey }))).kind).toBe("claimed");
    expect((await claimPublicSlot(db, claim({ networkKey }))).kind).toBe("network_rate");
    expect((await claimPublicSlot(db, claim({ networkKey: "f".repeat(64) }))).kind).toBe("claimed");
    expect((await claimPublicSlot(db, claim({ networkKey, now: T0 + 10 * 60_000 + 1 }))).kind).toBe("claimed");
  });

  it("applies only newer summaries and never revives an ended room (2-D)", async () => {
    const input = claim();
    await claimPublicSlot(db, input);
    const summary = (seq: number, state: "WAITING" | "PLAYING" | "FINISHED" | "CLOSED", confirmed = 1) => ({
      instanceId: input.instanceId, state, confirmedCount: confirmed, reservedCount: 0, seq, observedAt: T0 + seq, leaseExpiresAt: T0 + seq + 90_000,
      roomExpiresAt: T0 + 3600_000, repairDueAt: state === "FINISHED" || state === "CLOSED" ? null : T0 + 120_000 });
    expect(await applySummary(db, summary(2, "WAITING", 3))).toBe("applied");
    expect(await applySummary(db, summary(2, "WAITING", 5))).toBe("ignored"); // a repeat counts as delivered and changes nothing
    expect(await applySummary(db, summary(1, "WAITING", 7))).toBe("ignored"); // an older one arriving late is dropped
    expect((await findByInstance(db, input.instanceId))!.confirmedCount).toBe(3);
    expect(await applySummary(db, summary(3, "PLAYING"))).toBe("applied");
    expect((await findByInstance(db, input.instanceId))!.slotHeld).toBe(true); // a game in progress keeps its slot
    expect(await applySummary(db, summary(4, "FINISHED"))).toBe("applied");
    expect(await applySummary(db, summary(9, "WAITING"))).toBe("ignored"); // never back to recruiting
    expect(await findByInstance(db, input.instanceId)).toMatchObject({ state: "FINISHED", slotHeld: false, summarySeq: 4, closedAt: T0 + 4 });
  });

  it("lets a room come into existence once, only at its claimed code, never after cancellation (review PR2-001/002/003)", async () => {
    const a = claim({ roomCode: "FEN222" });
    await claimPublicSlot(db, a);
    expect(await fenceRoomCreation(db, a.instanceId, "OTHER2")).toBe("moved");
    expect(await fenceRoomCreation(db, a.instanceId, "FEN222")).toBe("won");
    expect(await fenceRoomCreation(db, a.instanceId, "FEN222")).toBe("closed"); // a second copy can never create again
    expect(await moveClaimToCode(db, a.instanceId, "FEN222", "FEN333")).toBe("gone"); // a created room is never moved away
    const b = claim();
    await claimPublicSlot(db, b);
    await releasePublicSlot(db, b.instanceId, "CANCELLED", T0 + 1);
    expect(await fenceRoomCreation(db, b.instanceId, b.roomCode)).toBe("closed");
    expect(await fenceRoomCreation(db, "f".repeat(32), "NOROW2")).toBe("closed");
  });

  it("moves a provisioning claim to another code only while that code is free", async () => {
    const a = claim({ roomCode: "AAA222" }), b = claim({ roomCode: "BBB333" });
    await claimPublicSlot(db, a); await claimPublicSlot(db, b);
    expect(await moveClaimToCode(db, a.instanceId, "AAA222", "BBB333")).toBe("code_taken");
    expect(await moveClaimToCode(db, a.instanceId, "AAA222", "CCC444")).toBe("moved");
    // A second mover that still saw the old code cannot move the claim again.
    expect(await moveClaimToCode(db, a.instanceId, "AAA222", "EEE666")).toBe("gone");
    expect((await findByRequest(db, a.creatorKey, a.requestId))!.roomCode).toBe("CCC444");
    await releasePublicSlot(db, a.instanceId, "CANCELLED", T0 + 2);
    expect(await moveClaimToCode(db, a.instanceId, "CCC444", "DDD555")).toBe("gone");
  });
});
