#!/usr/bin/env python3
"""Offline, deterministic synthesis of PORENA's five made-hand cues (stdlib only)."""
from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

RATE = 48_000
ROOT = Path(__file__).resolve().parents[2] / "public" / "assets" / "audio"


def env(t: float, duration: float, attack: float, release: float) -> float:
    if t < 0 or t >= duration:
        return 0.0
    return min(1.0, t / max(attack, 0.001)) * min(1.0, (duration - t) / max(release, 0.001))


def tone(t: float, freq: float, amp: float, duration: float, *, attack: float = 0.012,
         release: float = 0.2, sweep: float = 0.0, partials: tuple[tuple[float, float], ...] = ()) -> float:
    level = amp * env(t, duration, attack, release)
    phase = 2 * math.pi * (freq * t + sweep * t * t / (2 * duration))
    value = math.sin(phase)
    for multiple, weight in partials:
        value += weight * math.sin(phase * multiple + 0.07 * multiple)
    return level * value


def hiss(t: float, seed: int, amp: float, duration: float, *, attack: float, release: float,
         brightness: float = 0.72) -> float:
    # A deterministic, softly band-limited noise grain. Differencing removes the harsh DC/low end.
    index = max(0, int(t * RATE))
    rng = random.Random(seed + index)
    current = rng.uniform(-1.0, 1.0)
    previous = random.Random(seed + index - 1).uniform(-1.0, 1.0) if index else 0.0
    filtered = (current - previous) * brightness + current * (1.0 - brightness) * 0.32
    return amp * env(t, duration, attack, release) * filtered


def make(name: str, duration: float, voices: list[tuple], noises: list[tuple], *, reverb: tuple[float, ...], peak: float = 0.43) -> None:
    count = round(duration * RATE)
    dry = [0.0] * count
    for start, length, freq, amp, sweep, release, partials in voices:
        first, last = round(start * RATE), min(count, round((start + length) * RATE))
        for i in range(first, last):
            t = i / RATE - start
            dry[i] += tone(t, freq, amp, length, release=release, sweep=sweep, partials=partials)
    for start, length, seed, amp, attack, release, brightness in noises:
        first, last = round(start * RATE), min(count, round((start + length) * RATE))
        rng = random.Random(seed)
        previous = 0.0
        for i in range(first, last):
            current = rng.uniform(-1.0, 1.0)
            t = (i - first) / RATE
            filtered = (current - previous) * brightness + current * (1.0 - brightness) * 0.32
            dry[i] += amp * env(t, length, attack, release) * filtered
            previous = current
    # Quiet, short early-reflection taps add space without smearing the next player's cue.
    for tap, level in enumerate(reverb, 1):
        delay = round((0.031 + tap * 0.019) * RATE)
        for i in range(delay, count):
            dry[i] += dry[i - delay] * level
    peak_found = max((abs(sample) for sample in dry), default=0.0)
    scale = min(peak / peak_found, 1.0) if peak_found else 1.0
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / name
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        frames = bytearray()
        for sample in dry:
            frames.extend(struct.pack("<h", max(-32768, min(32767, round(sample * scale * 32767)))))
        out.writeframes(frames)
    print(f"{path.name}: {duration:.3f}s, peak={peak_found * scale:.3f}, {path.stat().st_size} bytes")


def main() -> None:
    # Card flicks: five separate, feather-light filtered-paper snaps with a clean terminal tap.
    # Keep the synthetic draft separate: the live straight cue is user-provided.
    make("made_straight_generated.wav", 0.56,
         [(0.38, 0.16, 1130, 0.15, -180, 0.09, ((2, .16),))],
         [(0.015, .16, 101, .22, .006, .11, .82), (.09, .16, 102, .2, .006, .11, .82),
          (.165, .17, 103, .18, .006, .12, .82), (.24, .16, 104, .17, .006, .12, .82),
          (.31, .17, 105, .15, .006, .13, .82)], reverb=(.12, .045), peak=.34)

    # Flush: airy blue arc, bright crystal shimmer and a restrained three-note energy bloom.
    make("made_flush.wav", 0.78,
         [(.02, .42, 520, .12, 500, .27, ((2.01, .2),)),
          (.10, .57, 880, .12, 230, .38, ((2.72, .12),)),
          (.17, .52, 1320, .075, -160, .37, ((3.11, .1),)),
          (.31, .42, 1760, .055, -430, .34, ((2.4, .12),))],
         [(.0, .32, 202, .17, .012, .24, .52), (.12, .48, 203, .09, .03, .39, .7)],
         reverb=(.18, .1, .045), peak=.36)

    # Full house: weighty low impact, a dark chord that blooms and settles into a soft shimmer.
    make("made_full_house.wav", 1.05,
         [(.015, .48, 86, .32, -25, .32, ((1.48, .22), (2.18, .1))),
          (.08, .73, 174, .16, -22, .52, ((1.5, .24), (2.01, .08))),
          (.11, .72, 261, .085, -12, .51, ((1.26, .18),)),
          (.21, .65, 392, .048, -20, .52, ((2.03, .15),))],
         [(.0, .18, 303, .12, .004, .16, .28)], reverb=(.22, .14, .08, .035), peak=.39)

    # Quads: red threat surge; sub impact plus a short, dissonant metallic rasp, never a scream.
    make("made_quads.wav", 1.18,
         [(.0, .48, 58, .3, -20, .36, ((1.5, .22), (2.5, .08))),
          (.06, .69, 147, .13, 88, .5, ((1.91, .22), (2.67, .12))),
          (.1, .62, 221, .09, -54, .43, ((2.04, .2),)),
          (.19, .64, 311, .058, -110, .48, ((1.49, .17),))],
         [(.0, .22, 404, .15, .002, .19, .45), (.07, .7, 405, .13, .08, .51, .63)],
         reverb=(.12, .065, .025), peak=.38)

    # Royal: broad low foundation, rising silver/plate harmonics and a resolved, dignified chord.
    make("made_royal_flush.wav", 1.82,
         [(.0, 1.35, 65.4, .16, 0, .95, ((2, .22), (3, .08))),
          (.02, 1.52, 130.8, .12, 0, 1.1, ((2, .24), (3, .09))),
          (.0, 1.65, 392, .07, 0, 1.28, ((2.76, .16),)),
          (.08, 1.55, 523.25, .09, 65, 1.16, ((2, .18), (3, .07))),
          (.16, 1.45, 659.25, .07, 48, 1.04, ((2.4, .15),)),
          (.24, 1.35, 783.99, .055, 0, .96, ((3.01, .1),)),
          (.3, 1.28, 1046.5, .038, 0, .91, ((2.02, .12),))],
         [(.0, .35, 505, .075, .035, .25, .58), (.16, .53, 506, .055, .06, .42, .72)],
         reverb=(.16, .11, .075, .05, .025), peak=.38)


if __name__ == "__main__":
    main()
