import { madeTone } from "./madeTone";

/**
 * Class chain for a showdown seat. The cinematic and the effect preview both
 * build their seats through here, so the preview cannot drift from what players
 * actually see - the drift is what hid a wrong straight-flush glow before.
 */
export function cinemaSeatClass({ tone, placement, made, leading }: {
  tone: string;
  /** "cinema-winner" / "cinema-loser" / "cinema-final-resolved", or "" while hidden. */
  placement?: string;
  /** Made-hand FX only run once the glow step has been reached. */
  made?: boolean;
  /** Undefined on the final table, where nobody is dimmed as a trailer yet. */
  leading?: boolean;
}): string {
  const madeClass = !made ? "" : leading === undefined
    ? "cinema-made-fx"
    : `cinema-made-fx ${leading ? "cinema-leading" : "cinema-trailing"}`;
  return `cinema-seat ${placement ?? ""} made-${tone} ${madeClass}`;
}

/** Every made-hand tone the palette distinguishes, weakest first. */
export const MADE_TONE_SAMPLES = [
  "하이카드", "원페어", "투페어", "트립스",
  "스트레이트", "플러시", "풀하우스", "포카드", "스트레이트 플러시", "로열 스트레이트 플러시",
] as const;

/** Tones that carry a dedicated effect; the rest fall back to the default ring. */
export function hasDedicatedFx(displayName: string): boolean {
  return madeTone(displayName) !== "default";
}
