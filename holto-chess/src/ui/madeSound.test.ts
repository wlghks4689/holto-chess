/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { HandCategory } from "../core/poker/evaluate";
import { isMadeSoundStart, MADE_SOUND_TRACKS, madeSoundMasterGain, selectMadeSound } from "./madeSound";

const hand = (category: HandCategory, displayName: string = category) => ({ category, displayName });

describe("selectMadeSound", () => {
  it("chooses the highest category in the current showdown, regardless of input order", () => {
    expect(selectMadeSound([hand("STRAIGHT"), hand("FLUSH"), hand("FULL_HOUSE")])).toBe("full-house");
    expect(selectMadeSound([hand("FLUSH"), hand("QUADS"), hand("TRIPS")])).toBe("quads");
  });

  it("returns one category sound for a tied best hand", () => {
    expect(selectMadeSound([hand("FLUSH", "플러시"), hand("FLUSH", "플러시")])).toBe("flush");
  });

  it("selects the dedicated straight-flush sound without also selecting lower hands", () => {
    expect(selectMadeSound([hand("FLUSH"), hand("STRAIGHT_FLUSH")])).toBe("straight-flush");
  });

  it("plays the dedicated royal-flush sound and skips hands below straight", () => {
    expect(selectMadeSound([hand("ROYAL_FLUSH")])).toBe("royal-flush");
    expect(selectMadeSound([hand("HIGH_CARD"), hand("TRIPS")])).toBeNull();
  });

  it("ignores forfeits when choosing a sound", () => {
    expect(selectMadeSound([hand("ROYAL_FLUSH", "몰수패"), hand("STRAIGHT")])).toBe("straight");
    expect(selectMadeSound([hand("ROYAL_FLUSH", "몰수패")])).toBeNull();
  });
});

describe("made sound timing", () => {
  it("starts only when the visible made effect begins, once per board", () => {
    expect(isMadeSoundStart({ scene: "g:m:0", phase: "RIVER_SETTLE" }, { scene: "g:m:0", phase: "BEST5_GLOW" }, false)).toBe(true);
    expect(isMadeSoundStart({ scene: "g:m:0", phase: "BEST5_GLOW" }, { scene: "g:m:0", phase: "BEST5_GLOW" }, false)).toBe(false);
    expect(isMadeSoundStart({ scene: "g:m:0", phase: "RUN_RESULT" }, { scene: "g:m:1", phase: "BEST5_GLOW" }, false)).toBe(true);
  });

  it("does not play on a reconnect mount or when a frame was skipped", () => {
    expect(isMadeSoundStart(null, { scene: "g:m:0", phase: "BEST5_GLOW" }, false)).toBe(false);
    expect(isMadeSoundStart({ scene: "g:m:0", phase: "RIVER_SETTLE" }, { scene: "g:m:0", phase: "BEST5_GLOW" }, true)).toBe(false);
    expect(isMadeSoundStart({ scene: "g:m:0", phase: "RIVER_SETTLE" }, { scene: "g:m:0", phase: "RIVER" }, false)).toBe(false);
  });
});

describe("made sound output level", () => {
  it("raises full-house and quads output by exactly 20%", () => {
    expect(madeSoundMasterGain("full-house", false)).toBeCloseTo(0.55 * 1.2);
    expect(madeSoundMasterGain("quads", false)).toBeCloseTo(0.55 * 1.2);
    expect(madeSoundMasterGain("flush", false)).toBe(0.55);
  });
});

describe("made sound assets", () => {
  it("ships four animation-fitted PCM WAV cues, the supplied straight cue, and both straight-flush layers", () => {
    const fittedTracks = MADE_SOUND_TRACKS.filter((track) => !["straight", "straight-flush"].includes(track.id));
    const expectedDurations: Record<string, number> = { flush: 1.62, "full-house": 1.77, quads: 1.97, "royal-flush": 2.42 };
    expect(fittedTracks).toHaveLength(4);
    expect(MADE_SOUND_TRACKS.find((track) => track.id === "straight-flush")?.files).toHaveLength(2);
    for (const track of fittedTracks) {
      const file = track.files[0]!;
      const bytes = readFileSync(new URL(`../../public/assets/audio/${file}`, import.meta.url));
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
      expect(bytes.readUInt16LE(22)).toBe(1);
      expect(bytes.readUInt32LE(24)).toBe(48_000);
      expect(bytes.readUInt16LE(34)).toBe(16);
      const dataLength = bytes.readUInt32LE(40);
      expect(dataLength).toBeGreaterThan(0);
      expect(dataLength / bytes.readUInt32LE(28)).toBe(expectedDurations[track.id]);
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset + 44, dataLength / 2);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      expect(peak / 32768).toBeLessThan(0.5);
    }
    const straightBytes = readFileSync(new URL("../../public/assets/audio/made_straight.wav", import.meta.url));
    expect(straightBytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(straightBytes.toString("ascii", 8, 12)).toBe("WAVE");
    expect(straightBytes.readUInt16LE(22)).toBe(1);
    expect(straightBytes.readUInt32LE(24)).toBe(48_000);
    expect(straightBytes.readUInt16LE(34)).toBe(16);
    const straightDataLength = straightBytes.readUInt32LE(40);
    expect(straightDataLength / straightBytes.readUInt32LE(28)).toBe(1.2);
    const straightSamples = new Int16Array(straightBytes.buffer, straightBytes.byteOffset + 44, straightDataLength / 2);
    let straightPeak = 0;
    for (const sample of straightSamples) straightPeak = Math.max(straightPeak, Math.abs(sample));
    expect(straightPeak / 32768).toBeLessThan(0.9);
    for (const file of MADE_SOUND_TRACKS.find((track) => track.id === "straight-flush")!.files) {
      const bytes = readFileSync(new URL(`../../public/assets/audio/${file}`, import.meta.url));
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
      expect(bytes.readUInt32LE(24)).toBe(48_000);
      expect(bytes.readUInt16LE(34)).toBe(16);
    }
  });
});
