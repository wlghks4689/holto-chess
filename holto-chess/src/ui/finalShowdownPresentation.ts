import type { Card } from "../core/poker/cards";
import { evaluatePartial, findBestFive, type HandValue } from "../core/poker/evaluate";
import type { CinematicFrame, CinematicPhase } from "./cinematicTimeline";
import { FINAL_ARENA_HOLD_MS, FINAL_ARENA_ZOOM_MS } from "../shared/presentationTimeline";

/** R5 presentation helper. It only evaluates the cards already visible in the current frame. */
export function visibleFinalHand(cards: readonly Card[], visibleCount: number): HandValue | undefined {
  const visible = cards.slice(0, visibleCount);
  if (visible.some(card => card.hidden)) return undefined;
  if (!visible.length) return undefined;
  return visible.length >= 5 ? findBestFive(visible) : evaluatePartial(visible);
}

/**
 * What the persistent R5 hand panel shows. Reveal phases keep the previous read while cards are
 * still turning, so text only changes after the flip (and, for the last two cards, a settle beat).
 */
export type FinalReadStage = { kind: "pending" } | { kind: "current"; cards: 3 | 5 } | { kind: "final" };

export function finalReadStage(phase: CinematicPhase): FinalReadStage {
  if (["FINAL_FIRST_HAND", "FINAL_SECOND_REVEAL"].includes(phase)) return { kind: "current", cards: 3 };
  if (["FINAL_SECOND_HAND", "FINAL_LAST_REVEAL", "FINAL_SEVEN_SETTLE"].includes(phase)) return { kind: "current", cards: 5 };
  if (["BEST5_GLOW", "MADE_HAND","FINAL_PLACE", "FINAL_WINNER", "REWARD", "COMPLETE"].includes(phase)) return { kind: "final" };
  return { kind: "pending" };
}

/** Which reveal batch (3 / 2 / 2) a card slot belongs to, and its stagger position inside it. */
export function finalRevealSlot(cardIndex: number): { batch: 0 | 1 | 2; offset: number } {
  if (cardIndex < 3) return { batch: 0, offset: cardIndex };
  if (cardIndex < 5) return { batch: 1, offset: cardIndex - 3 };
  return { batch: 2, offset: cardIndex - 5 };
}

/** Stagger between cards of one batch at 1x; the last pair lands slower and heavier. */
export const FINAL_REVEAL_STAGGER_MS = [310, 320, 380] as const;

export type FinalHeading = { kicker: string; title: string };

const RESULT_PHASES: readonly CinematicPhase[] = ["FINAL_PLACE", "FINAL_WINNER", "REWARD", "COMPLETE"];

/**
 * Top heading for R5. The title stays fixed for the whole reveal and switches once when placements
 * start; only the small kicker tracks the stage. Point deltas live inside each player's seat.
 */
export function finalHeadingCopy(frame: Pick<CinematicFrame, "phase">): FinalHeading {
  const { phase } = frame;
  const title = RESULT_PHASES.includes(phase) ? "SHOWDOWN RESULTS" : "FINAL SHOWDOWN";
  if (["FINAL_FIRST_REVEAL", "FINAL_FIRST_HAND"].includes(phase)) return { kicker: "FIRST REVEAL", title };
  if (["FINAL_SECOND_REVEAL", "FINAL_SECOND_HAND"].includes(phase)) return { kicker: "SECOND REVEAL", title };
  if (["FINAL_LAST_REVEAL", "FINAL_SEVEN_SETTLE"].includes(phase)) return { kicker: "LAST REVEAL", title };
  if (["BEST5_GLOW", "MADE_HAND"].includes(phase)) return { kicker: "BEST 5 CONFIRMED", title };
  if (phase === "FINAL_PLACE" || phase === "FINAL_WINNER") return { kicker: "PLACEMENT RESOLUTION", title };
  if (phase === "REWARD" || phase === "COMPLETE") return { kicker: "POINT SETTLEMENT", title };
  return { kicker: "FINAL TABLE", title };
}

/** Slots whose reveal comes next: their backs build anticipation during the read beat before it. */
export function finalNextBatch(phase: CinematicPhase): 1 | 2 | undefined {
  if (phase === "FINAL_FIRST_HAND") return 1;
  if (phase === "FINAL_SECOND_HAND") return 2;
  return undefined;
}

export function ordinalPlace(place: number | undefined): string {
  if (place === 1) return "1ST";
  if (place === 2) return "2ND";
  if (place === 3) return "3RD";
  return place ? `${place}TH` : "—";
}

/** R5 arena artwork, preloaded before the final so the establishing shot never waits on the network. */
export const FINAL_ARENA_IMAGE = "/assets/table/final-table.webp";
let arenaPreload: HTMLImageElement | undefined;
export function preloadFinalArena(): void {
  if (arenaPreload || typeof Image === "undefined") return;
  arenaPreload = new Image();
  arenaPreload.src = FINAL_ARENA_IMAGE;
  void arenaPreload.decode?.().catch(() => { /* the CSS fallback background covers a failed load */ });
}

/**
 * Camera push-in progress (0 → 1) for the R5 arena, derived from the cinematic clock itself so speed,
 * server sync, reconnects and stalls all land on the same framing. Ease-in-out cubic.
 */
export function arenaZoomProgress(elapsedMs: number): number {
  const t = Math.min(1, Math.max(0, (elapsedMs - FINAL_ARENA_HOLD_MS) / FINAL_ARENA_ZOOM_MS));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
