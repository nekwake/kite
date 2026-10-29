// Kite mark and the swaying-kite loader. Outlines come from assets/source/kite-skeleton.svg.

import { KITE_PATHS } from "../lib/kitePaths";

const KITE_W = 600;
const KITE_H = 856;

function KiteShape() {
  return (
    <>
      {KITE_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </>
  );
}

export function KiteMark({ size = 64, color = "var(--accent)" }: { size?: number; color?: string }) {
  return (
    <svg width={(size * KITE_W) / KITE_H} height={size} viewBox={`0 0 ${KITE_W} ${KITE_H}`} fill={color} aria-label="Kite">
      <KiteShape />
    </svg>
  );
}

/** Kite swaying in the wind while streaks blow past, for loading states. */
export function KiteLoader({ size = 32, label }: { size?: number; label?: string }) {
  return (
    <span className="kite-loader" role="status">
      <svg width={size * 1.3} height={size} viewBox="-260 -40 1120 940" aria-hidden>
        <g className="kite-wind" stroke="var(--accent)" strokeLinecap="round" strokeWidth="44">
          <line x1="-220" y1="230" x2="-40" y2="230" />
          <line x1="660" y1="420" x2="840" y2="420" />
          <line x1="-180" y1="560" x2="-20" y2="560" />
        </g>
        <g className="kite-sway" fill="var(--accent)">
          <KiteShape />
        </g>
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}
