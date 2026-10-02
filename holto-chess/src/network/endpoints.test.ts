import { describe, expect, it } from "vitest";
import { endpoints, roomSocketUrl } from "./endpoints";

describe("network endpoints", () => {
  it("keeps the exact relative API paths the Worker routes", () => {
    expect(endpoints.createRoom()).toBe("/api/rooms");
    expect(endpoints.joinRoom("ABC234")).toBe("/api/rooms/ABC234/join");
    expect(endpoints.roomSession("ABC234")).toBe("/api/rooms/ABC234/session");
    expect(endpoints.feedback()).toBe("/api/feedback");
  });

  it("builds the room socket on the page host, so Discord's URL mapping carries it", () => {
    expect(roomSocketUrl("ABC234", { protocol: "https:", host: "porena.kr" })).toBe("wss://porena.kr/ws/rooms/ABC234");
    expect(roomSocketUrl("ABC234", { protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/ws/rooms/ABC234");
    expect(roomSocketUrl("ABC234", { protocol: "https:", host: "123456789012345678.discordsays.com" })).toBe("wss://123456789012345678.discordsays.com/ws/rooms/ABC234");
  });
});
