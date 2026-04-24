/**
 * EventPlaceholder — premium generative event poster.
 *
 * Three atmospheric gradient orbs in a triangular composition, grain
 * texture, per-corner ZK-circuit traces, geometric ring accent, small
 * particle dots, vignette, and a polished bottom bar — all derived
 * deterministically from the event name via djb2.
 *
 * SSR-safe: no Math.random(), no window references.
 */

/** djb2 hash → unsigned 32-bit int. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export interface EventPlaceholderProps {
  /** Event name — drives colours, geometry, and initials. */
  name: string;
  className?: string;
}

export function EventPlaceholder({ name, className = "" }: EventPlaceholderProps) {
  const seed = djb2(name || "midnight-tickets");

  // ── Three-colour palette (golden-angle shifts for harmony) ────────────────
  const hue1 = seed % 360;
  const hue2 = (seed * 137 + 211) % 360;
  const hue3 = (seed * 97  + 67 ) % 360;
  const sat1 = 62 + (seed % 22);
  const sat2 = Math.max(48, sat1 - 14);
  const sat3 = Math.max(40, sat1 - 24);

  const c1 = `hsl(${hue1},${sat1}%,62%)`;
  const c2 = `hsl(${hue2},${sat2}%,52%)`;
  const c3 = `hsl(${hue3},${sat3}%,44%)`;

  // ── Orb positions in 800×450 user-space ──────────────────────────────────
  // Orb 1: upper-left quadrant influence
  const ox1 = 40  + (seed % 260);
  const oy1 = 10  + ((seed >> 5)  & 0xff) % 170;
  // Orb 2: lower-right quadrant
  const ox2 = 520 + ((seed >> 3)  & 0xff) % 220;
  const oy2 = 220 + ((seed >> 9)  & 0xff) % 190;
  // Orb 3: centre influence, smaller
  const ox3 = 180 + ((seed >> 12) & 0x1ff) % 440;
  const oy3 = 60  + ((seed >> 15) & 0xff) % 250;

  // ── Geometric ring accent ─────────────────────────────────────────────────
  const ringX = 100 + ((seed >> 8)  & 0x1ff) % 600;
  const ringY = 40  + ((seed >> 11) & 0xff)  % 290;
  const ringR = 28  + ((seed >> 6)  & 0x3f)  % 52;   // 28–79px

  // ── Three small particle dots ─────────────────────────────────────────────
  const p1x = 50  + (seed & 0x2ff)                  % 700;
  const p1y = 30  + ((seed >> 4)  & 0x1ff)          % 380;
  const p2x = 40  + ((seed >> 7)  & 0x2ff)          % 720;
  const p2y = 40  + ((seed >> 10) & 0x1ff)          % 380;
  const p3x = 60  + ((seed >> 14) & 0x2ff)          % 680;
  const p3y = 30  + ((seed >> 18) & 0x1ff)          % 390;

  // ── Diagonal-stripe angle (seed-derived, 30–60°) ──────────────────────────
  const stripeAngle = 30 + (seed % 31);

  // ── Initials (up to 2 words, else first 2 chars) ──────────────────────────
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? ((words[0]![0] ?? "") + (words[1]![0] ?? "")).toUpperCase()
      : name
      ? name.slice(0, 2).toUpperCase()
      : "MT";

  // ── Unique ID suffix for SVG defs (SSR-safe) ─────────────────────────────
  const u = (seed >>> 0).toString(36).padStart(8, "0").slice(0, 8);

  // ── Short display name (bottom bar) ──────────────────────────────────────
  const displayName = (name || "Unnamed Event").slice(0, 52);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: "16/9" }}>
      <svg
        viewBox="0 0 800 450"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        aria-hidden="true"
      >
        <defs>
          {/* ── Orb radial gradients ──────────────────────────────── */}
          <radialGradient id={`o1${u}`} gradientUnits="userSpaceOnUse" cx={ox1} cy={oy1} r="400">
            <stop offset="0%"   stopColor={c1} stopOpacity="0.70" />
            <stop offset="55%"  stopColor={c1} stopOpacity="0.18" />
            <stop offset="100%" stopColor={c1} stopOpacity="0"    />
          </radialGradient>
          <radialGradient id={`o2${u}`} gradientUnits="userSpaceOnUse" cx={ox2} cy={oy2} r="320">
            <stop offset="0%"   stopColor={c2} stopOpacity="0.60" />
            <stop offset="55%"  stopColor={c2} stopOpacity="0.14" />
            <stop offset="100%" stopColor={c2} stopOpacity="0"    />
          </radialGradient>
          <radialGradient id={`o3${u}`} gradientUnits="userSpaceOnUse" cx={ox3} cy={oy3} r="230">
            <stop offset="0%"   stopColor={c3} stopOpacity="0.48" />
            <stop offset="100%" stopColor={c3} stopOpacity="0"    />
          </radialGradient>

          {/* ── Grid (40px cells) ─────────────────────────────────── */}
          <pattern id={`gr${u}`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0L0 0 0 40" fill="none" stroke="white"
              strokeWidth="0.35" strokeOpacity="0.042" />
          </pattern>

          {/* ── Diagonal stripe pattern ───────────────────────────── */}
          <pattern id={`dp${u}`} width="70" height="70" patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${stripeAngle})`}>
            <line x1="0" y1="0" x2="0" y2="70" stroke="white"
              strokeWidth="0.4" strokeOpacity="0.022" />
          </pattern>

          {/* ── Top-edge shimmer ──────────────────────────────────── */}
          <linearGradient id={`sh${u}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="white" stopOpacity="0"    />
            <stop offset="33%"  stopColor="white" stopOpacity="0.08" />
            <stop offset="50%"  stopColor="white" stopOpacity="0.26" />
            <stop offset="67%"  stopColor="white" stopOpacity="0.08" />
            <stop offset="100%" stopColor="white" stopOpacity="0"    />
          </linearGradient>

          {/* ── Bottom gradient fade (text legibility) ────────────── */}
          <linearGradient id={`bf${u}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="black" stopOpacity="0"    />
            <stop offset="100%" stopColor="black" stopOpacity="0.92" />
          </linearGradient>

          {/* ── Vignette (dark edges, lighter centre) ─────────────── */}
          <radialGradient id={`vg${u}`} gradientUnits="userSpaceOnUse" cx="400" cy="225" r="480">
            <stop offset="40%"  stopColor="black" stopOpacity="0"    />
            <stop offset="100%" stopColor="black" stopOpacity="0.62" />
          </radialGradient>

          {/* ── Noise / grain filter ──────────────────────────────── */}
          <filter id={`nz${u}`} x="0" y="0" width="100%" height="100%"
            colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.70 0.70"
              numOctaves="4" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>

        {/* ── Base layer ──────────────────────────────────────────────── */}
        <rect width="800" height="450" fill="#080808" />

        {/* ── Texture patterns ────────────────────────────────────────── */}
        <rect width="800" height="450" fill={`url(#gr${u})`} />
        <rect width="800" height="450" fill={`url(#dp${u})`} />

        {/* ── Atmospheric orbs ────────────────────────────────────────── */}
        <rect width="800" height="450" fill={`url(#o1${u})`} />
        <rect width="800" height="450" fill={`url(#o2${u})`} />
        <rect width="800" height="450" fill={`url(#o3${u})`} />

        {/* ── Grain overlay ────────────────────────────────────────────── */}
        <rect width="800" height="450" fill="white" fillOpacity="0.028"
          filter={`url(#nz${u})`} />

        {/* ── Vignette ────────────────────────────────────────────────── */}
        <rect width="800" height="450" fill={`url(#vg${u})`} />

        {/* ── Geometric ring accent ────────────────────────────────────── */}
        <circle cx={ringX} cy={ringY} r={ringR}
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.10" />
        <circle cx={ringX} cy={ringY} r={ringR * 0.72}
          fill="none" stroke={c1} strokeWidth="0.4" strokeOpacity="0.22" />
        {/* Ring dot marks at cardinal points */}
        <circle cx={ringX + ringR} cy={ringY} r="1.2" fill="white" fillOpacity="0.18" />
        <circle cx={ringX - ringR} cy={ringY} r="1.2" fill="white" fillOpacity="0.18" />
        <circle cx={ringX} cy={ringY + ringR} r="1.2" fill="white" fillOpacity="0.18" />
        <circle cx={ringX} cy={ringY - ringR} r="1.2" fill="white" fillOpacity="0.18" />

        {/* ── Particle dots ─────────────────────────────────────────────── */}
        <circle cx={p1x} cy={p1y} r="1.8" fill={c1} fillOpacity="0.60" />
        <circle cx={p2x} cy={p2y} r="1.2" fill={c2} fillOpacity="0.48" />
        <circle cx={p3x} cy={p3y} r="2.2" fill={c3} fillOpacity="0.38" />

        {/* ── Per-corner ZK-circuit traces ─────────────────────────────── */}
        {/* Top-left */}
        <path d="M0 32 L32 32 L32 0"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.13" />
        <circle cx="32" cy="32" r="2.2"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.20" />
        <circle cx="32" cy="32" r="0.9" fill={c1} fillOpacity="0.80" />
        {/* Second trace arm */}
        <path d="M0 48 L14 48"
          fill="none" stroke="white" strokeWidth="0.35" strokeOpacity="0.07" />

        {/* Top-right */}
        <path d="M800 32 L768 32 L768 0"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.13" />
        <circle cx="768" cy="32" r="2.2"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.20" />
        <circle cx="768" cy="32" r="0.9" fill={c2} fillOpacity="0.70" />
        <path d="M800 48 L786 48"
          fill="none" stroke="white" strokeWidth="0.35" strokeOpacity="0.07" />

        {/* Bottom-left */}
        <path d="M0 418 L32 418 L32 450"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.13" />
        <circle cx="32" cy="418" r="2.2"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.20" />
        <circle cx="32" cy="418" r="0.9" fill={c3} fillOpacity="0.60" />
        <path d="M0 402 L14 402"
          fill="none" stroke="white" strokeWidth="0.35" strokeOpacity="0.07" />

        {/* Bottom-right */}
        <path d="M800 418 L768 418 L768 450"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.13" />
        <circle cx="768" cy="418" r="2.2"
          fill="none" stroke="white" strokeWidth="0.55" strokeOpacity="0.20" />
        <circle cx="768" cy="418" r="0.9" fill={c1} fillOpacity="0.50" />
        <path d="M800 402 L786 402"
          fill="none" stroke="white" strokeWidth="0.35" strokeOpacity="0.07" />

        {/* ── Watermark initials ─────────────────────────────────────────── */}
        <text
          x="50%" y="49%"
          textAnchor="middle" dominantBaseline="middle"
          fontSize={initials.length <= 1 ? "256" : "192"}
          fontWeight="900"
          fill="white" fillOpacity="0.044"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          letterSpacing="-8"
        >
          {initials}
        </text>

        {/* ── Top shimmer ───────────────────────────────────────────────── */}
        <rect x="0" y="0" width="800" height="1.2" fill={`url(#sh${u})`} />

        {/* ── Bottom text area ──────────────────────────────────────────── */}
        {/* Gradient fade behind text */}
        <rect x="0" y="330" width="800" height="120" fill={`url(#bf${u})`} />
        {/* Divider line */}
        <line x1="0" y1="406" x2="800" y2="406"
          stroke="white" strokeOpacity="0.07" strokeWidth="0.5" />
        {/* Colour bar at left edge */}
        <rect x="0" y="406" width="3" height="44" fill={c1} fillOpacity="0.75" />
        {/* Small accent rectangle */}
        <rect x="8" y="413" width="1.5" height="30" fill={c2} fillOpacity="0.45" />

        {/* Event name */}
        <text
          x="20" y="427"
          fontSize="14.5" fontWeight="700"
          fill="white" fillOpacity="0.94"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          letterSpacing="-0.2"
        >
          {displayName}
        </text>
        {/* Sub-label row */}
        <text
          x="20" y="443"
          fontSize="8" fontWeight="500"
          fill="white" fillOpacity="0.22"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          letterSpacing="2.4"
        >
          MIDNIGHT TICKETS
        </text>

        {/* ZK badge (top-right corner of bottom bar) */}
        <rect x="764" y="410" width="28" height="14"
          fill="white" fillOpacity="0.04"
          stroke="white" strokeWidth="0.4" strokeOpacity="0.10" />
        <text
          x="778" y="420"
          textAnchor="middle" dominantBaseline="middle"
          fontSize="6" fontWeight="700"
          fill="white" fillOpacity="0.28"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          letterSpacing="1.5"
        >
          ZK
        </text>

        {/* ── Top-left accent dot ───────────────────────────────────────── */}
        <circle cx="13" cy="13" r="3" fill={c1} fillOpacity="0.82" />
      </svg>
    </div>
  );
}
