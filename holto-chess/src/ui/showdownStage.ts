import type { Round } from "../game/types";

/**
 * Showdown stages before the final. Two arena artworks alternate by round; the intensity level (dim,
 * blur, framing) rises each round so the arena builds toward the Final Arena, which stays separate.
 * The six-round R5 keeps the R4 intensity on the first artwork.
 */
const ARENA_1 = { image: "/assets/table/showdown-arena-1.webp", focus: "50% 51%" };
const ARENA_2 = { image: "/assets/table/showdown-arena-2.webp", focus: "50% 54%" };
const STAGES: Record<1 | 2 | 3 | 4 | 5, typeof ARENA_1> = { 1: ARENA_1, 2: ARENA_2, 3: ARENA_1, 4: ARENA_2, 5: ARENA_1 };

export type ShowdownStage = { image: string; focus: string; level: 1 | 2 | 3 | 4 };

/** `final` defaults to the five-round final; a six-round game passes false for R5. */
export function showdownStage(round: Round, final = round === 5): ShowdownStage | undefined {
  if (final || round === 6) return undefined;
  return { ...STAGES[round], level: Math.min(round, 4) as ShowdownStage["level"] };
}

const preloaded = new Set<string>();
/** Fetch the round's arena during its shop so the showdown opens on the finished stage. */
export function preloadShowdownStage(round: Round | undefined, final?: boolean): void {
  const stage = round ? showdownStage(round, final) : undefined;
  if (!stage || preloaded.has(stage.image) || typeof Image === "undefined") return;
  preloaded.add(stage.image);
  const image = new Image();
  image.src = stage.image;
  void image.decode?.().catch(() => { /* the CSS fallback background covers a failed load */ });
}
