import type { Round } from "../game/types";

/**
 * R1-R4 showdown stages. Two arena artworks alternate by round; the intensity level (dim, blur,
 * framing) rises each round so the arena builds toward the R5 Final Arena, which stays separate.
 */
const ARENA_1 = { image: "/assets/table/showdown-arena-1.webp", focus: "50% 51%" };
const ARENA_2 = { image: "/assets/table/showdown-arena-2.webp", focus: "50% 54%" };
const STAGES: Record<Exclude<Round, 5>, typeof ARENA_1> = { 1: ARENA_1, 2: ARENA_2, 3: ARENA_1, 4: ARENA_2 };

export type ShowdownStage = { image: string; focus: string; level: 1 | 2 | 3 | 4 };

export function showdownStage(round: Round): ShowdownStage | undefined {
  if (round === 5) return undefined;
  return { ...STAGES[round], level: round };
}

const preloaded = new Set<string>();
/** Fetch the round's arena during its shop so the showdown opens on the finished stage. */
export function preloadShowdownStage(round: Round | undefined): void {
  const stage = round ? showdownStage(round) : undefined;
  if (!stage || preloaded.has(stage.image) || typeof Image === "undefined") return;
  preloaded.add(stage.image);
  const image = new Image();
  image.src = stage.image;
  void image.decode?.().catch(() => { /* the CSS fallback background covers a failed load */ });
}
