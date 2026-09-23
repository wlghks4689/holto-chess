import type { CSSProperties } from "react";
import type { SpotlightRect } from "./useSpotlight";

/**
 * Shade drawn as four bands around the target instead of one full-screen layer with a hole, so the
 * page underneath — including the reroll button right next to the highlight — always stays clickable.
 */
export function TutorialSpotlight({ rect }: { rect: SpotlightRect | null }) {
  if (!rect) return null;
  const bands: CSSProperties[] = [
    { top: 0, left: 0, width: "100%", height: Math.max(0, rect.top) },
    { top: Math.max(0, rect.top), left: 0, width: Math.max(0, rect.left), height: rect.height },
    { top: Math.max(0, rect.top), left: rect.left + rect.width, right: 0, height: rect.height },
    { top: rect.top + rect.height, left: 0, width: "100%", bottom: 0 },
  ];
  return <div className="tutorial-spotlight" aria-hidden="true">
    {bands.map((style, index) => <i key={index} style={style} />)}
    <b style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
  </div>;
}
