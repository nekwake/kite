// Kite mark and the swaying-kite loader. Shapes mirror assets/logo.svg.

const KITE_BODY = "M32 4 L52 24 L32 50 L12 24 Z";
const TAIL = "M32 50 C 30 55, 36 57, 34 62";

function KiteShape() {
  return (
    <>
      <defs>
        <linearGradient id="kite-l" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cb2ff" />
          <stop offset="1" stopColor="#3f7cf0" />
        </linearGradient>
        <linearGradient id="kite-r" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9d4ff" />
          <stop offset="1" stopColor="#6a9cf7" />
        </linearGradient>
      </defs>
      <path d="M32 4 L32 50 L12 24 Z" fill="url(#kite-l)" />
      <path d="M32 4 L52 24 L32 50 Z" fill="url(#kite-r)" />
      <path d="M32 4 L32 50 M12 24 L52 24" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />
      <path d={KITE_BODY} fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" strokeLinejoin="round" />
      <path d={TAIL} fill="none" stroke="#7cb2ff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M29.5 54.5 l3 -1 l-1 3 z M34.5 58.5 l3 -1 l-1 3 z" fill="#7cb2ff" />
    </>
  );
}

export function KiteMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Kite">
      <KiteShape />
    </svg>
  );
}

/** Kite swaying in the wind while streaks blow past, for loading states. */
export function KiteLoader({ size = 32, label }: { size?: number; label?: string }) {
  return (
    <span className="kite-loader" role="status">
      <svg width={size * 1.6} height={size} viewBox="-20 0 104 64" aria-hidden>
        <g className="kite-wind" stroke="#7cb2ff" strokeLinecap="round" strokeWidth="2.2">
          <line x1="-16" y1="16" x2="2" y2="16" />
          <line x1="62" y1="30" x2="82" y2="30" />
          <line x1="-12" y1="42" x2="4" y2="42" />
        </g>
        <g className="kite-sway">
          <KiteShape />
        </g>
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}
