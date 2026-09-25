#!/usr/bin/env python3
"""Trim a supplied mono 48 kHz PCM WAV to a made-effect window with headroom."""
from __future__ import annotations

import argparse
import struct
import wave
from pathlib import Path

RATE = 48_000
MAX_PEAK = 0.45
FADE_SECONDS = 0.10


def fit(source: Path, destination: Path, duration: float) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if source == destination:
        raise ValueError("Input and output must be different files; preserve the supplied original.")
    with wave.open(str(source), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getframerate() != RATE or wav.getsampwidth() != 2:
            raise ValueError(f"Expected mono 48 kHz PCM16 WAV: {source.name}")
        samples = struct.unpack(f"<{wav.getnframes()}h", wav.readframes(wav.getnframes()))

    target_frames = round(duration * RATE)
    if len(samples) < target_frames:
        raise ValueError(f"Source is shorter than the {duration:.2f}s target: {source.name}")
    trimmed = list(samples[:target_frames])
    peak = max((abs(sample) for sample in trimmed), default=0)
    gain = min(1.0, MAX_PEAK * 32767 / peak) if peak else 1.0
    fade_frames = min(round(FADE_SECONDS * RATE), len(trimmed))
    fade_start = len(trimmed) - fade_frames
    for index, sample in enumerate(trimmed):
        fade = 1.0 if index < fade_start else max(0.0, (len(trimmed) - 1 - index) / max(1, fade_frames - 1))
        trimmed[index] = max(-32768, min(32767, round(sample * gain * fade)))

    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(struct.pack(f"<{len(trimmed)}h", *trimmed))
    final_peak = max((abs(sample) for sample in trimmed), default=0) / 32768
    print(f"{source.name} -> {destination.name}: {duration:.3f}s, peak={final_peak:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("duration", type=float, help="Target duration in seconds")
    args = parser.parse_args()
    fit(args.source, args.destination, args.duration)


if __name__ == "__main__":
    main()
