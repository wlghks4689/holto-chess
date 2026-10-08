import { useId, type CSSProperties } from "react";

/** Ribbon colours per podium place; anything below third reuses bronze. */
const TIERS = {
  1: { ribbon: ["#c42c44", "#6a1020"], tail: "#4f0c18", metal: ["#fff6d2", "#f4d77f", "#b9821f"] },
  2: { ribbon: ["#33507a", "#14233a"], tail: "#0f1b2d", metal: ["#ffffff", "#dfe7ee", "#8d9cad"] },
  3: { ribbon: ["#6e3a1c", "#2c1408"], tail: "#241005", metal: ["#ffe0c2", "#df9d62", "#9b5524"] },
} as const;

/** R6 podium: a ribbon carrying the place, set on the top edge of the finalist's seat (in the seat's grid column). */
export function FinalPlaceBanner({ place, label, split, column }: { place: number; label: string; split?: string; column?: number }) {
  const id = useId().replace(/:/g, "");
  const tier = (place >= 1 && place <= 3 ? place : 3) as 1 | 2 | 3;
  const look = TIERS[tier];
  const metal = `url(#${id}-metal)`;
  return <div className={`cinema-place-banner place-${tier}`} role="img" aria-label={split ? `${split} ${label}` : label} style={column ? { gridColumn: column } as CSSProperties : undefined}>
    <svg viewBox="0 0 200 40" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
          {look.metal.map((color, index) => <stop key={index} offset={index / (look.metal.length - 1)} stopColor={color} />)}
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={look.ribbon[0]} /><stop offset="1" stopColor={look.ribbon[1]} />
        </linearGradient>
      </defs>
      {/* Folded tails behind the band. */}
      {[false, true].map((mirror) => <path key={String(mirror)} transform={mirror ? "matrix(-1 0 0 1 200 0)" : undefined}
        d="M34 9H4L14 22L4 35H34Z" fill={look.tail} stroke={metal} strokeWidth="1.2" strokeLinejoin="round" />)}
      <path d="M26 4H174V32H26Z" fill={`url(#${id}-ribbon)`} stroke={metal} strokeWidth="1.6" />
      <text x="100" y="24.5" textAnchor="middle" className="cinema-place-banner-label" fill={metal}>{label}</text>
    </svg>
    {split && <span className="cinema-place-banner-split">{split}</span>}
  </div>;
}
