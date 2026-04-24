/**
 * EventPlaceholder — deterministic generative event card.
 *
 * Each event name produces a unique, consistent visual with two
 * atmospheric gradient orbs, a subtle grid, ZK-circuit corner
 * decorations, and giant watermark initials.
 *
 * Uses djb2 hashing so server and client renders always agree —
 * no hydration flicker.
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
  /** Event name — drives colors and initials. */
  name: string;
  className?: string;
}

export function EventPlaceholder({ name, className = "" }: EventPlaceholderProps) {
  const seed = djb2(name || "midnight-tickets");

  // ── Accent colours ────────────────────────────────────────────────────────
  const hue1 = seed % 360;
  const hue2 = (seed * 137 + 211) % 360;   // golden-angle shift
  const sat  = 55 + (seed % 28);            // 55–83 %

  const c1 = `hsl(${hue1},${sat}%,55%)`;
  const c2 = `hsl(${hue2},${Math.max(40, sat - 12)}%,48%)`;

  // ── Orb positions in SVG user-space (800 × 450) ───────────────────────────
  const ox1 = 40  + (seed % 280);
  const oy1 = 30  + ((seed >> 6)  & 0xff) % 180;
  const ox2 = 480 + ((seed >> 3)  & 0xff) % 250;
  const oy2 = 200 + ((seed >> 9)  & 0xff) % 200;

  // ── Initials: first letter of each word (max 2), else first 2 chars ───────
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? ((words[0]![0] ?? "") + (words[1]![0] ?? "")).toUpperCase()
      : name
      ? name.slice(0, 2).toUpperCase()
      : "MT";

  // ── Unique ID suffix for SVG defs (safe for SSR) ─────────────────────────
  const u = (seed >>> 0).toString(36).padStart(6, "0").slice(0, 8);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: "16/9" }}>
      <svg
        viewBox="0 0 800 450"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        aria-hidden="true"
      >
        <defs>
          {/* Primary atmospheric glow */}
          <radialGradient id={`rg1${u}`} gradientUnits="userSpaceOnUse" cx={ox1} cy={oy1} r="420">
            <stop offset="0%"   stopColor={c1} stopOpacity="0.52" />
            <stop offset="100%" stopColor={c1} stopOpacity="0"    />
          </radialGradient>

          {/* Secondary glow */}
          <radialGradient id={`rg2${u}`} gradientUnits="userSpaceOnUse" cx={ox2} cy={oy2} r="310">
            <stop offset="0%"   stopColor={c2} stopOpacity="0.42" />
            <stop offset="100%" stopColor={c2} stopOpacity="0"    />
          </radialGradient>

          {/* Subtle grid pattern */}
          <pattern id={`gp${u}`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0L0 0 0 40" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.044" />
          </pattern>

          {/* Top-edge shimmer (matches app's border-shimmer motif) */}
          <linearGradient id={`sh${u}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="white" stopOpacity="0"    />
            <stop offset="42%"  stopColor="white" stopOpacity="0.12" />
            <stop offset="50%"  stopColor="white" stopOpacity="0.30" />
            <stop offset="58%"  stopColor="white" stopOpacity="0.12" />
            <stop offset="100%" stopColor="white" stopOpacity="0"    />
          </linearGradient>
        </defs>

        {/* ── Base layers ─────────────────────────────────────────────── */}
        <rect width="800" height="450" fill="#080808" />
        <rect width="800" height="450" fill={`url(#gp${u})`} />
        <rect width="800" height="450" fill={`url(#rg1${u})`} />
        <rect width="800" height="450" fill={`url(#rg2${u})`} />

        {/* Top shimmer line */}
        <rect x="0" y="0" width="800" height="1" fill={`url(#sh${u})`} />

        {/* ── ZK-circuit corner decorations ───────────────────────────── */}
        {/* Top-right */}
        <path
          d="M742 0 L742 26 L800 26"
          fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.1"
        />
        <circle cx="742" cy="26" r="1.8"
          fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.16" />
        {/* dot on corner */}
        <rect x="739" y="23" width="6" height="6" rx="0"
          fill={c1} fillOpacity="0.12" />

        {/* Bottom-left */}
        <path
          d="M0 406 L52 406 L52 450"
          fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.1"
        />
        <circle cx="52" cy="406" r="1.8"
          fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.16" />

        {/* ── Giant watermark initials ─────────────────────────────────── */}
        <text
          x="50%" y="52%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={initials.length <= 1 ? "260" : "196"}
          fontWeight="900"
          fill="white"
          fillOpacity="0.038"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          letterSpacing="-10"
        >
          {initials}
        </text>

        {/* ── Bottom bar ──────────────────────────────────────────────── */}
        <line x1="0" y1="406" x2="800" y2="406" stroke="white" strokeOpacity="0.07" strokeWidth="0.5" />

        {/* Event name */}
        <text
          x="30" y="430"
          fontSize="13" fontWeight="600"
          fill="white" fillOpacity="0.88"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        >
          {(name || "Unnamed Event").slice(0, 54)}
        </text>

        {/* Brand badge */}
        <text
          x="770" y="430"
          textAnchor="end"
          fontSize="7.5" fontWeight="500"
          fill="white" fillOpacity="0.2"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          letterSpacing="2.8"
        >
          MIDNIGHT TICKETS
        </text>

        {/* ── Accent dot + tick ────────────────────────────────────────── */}
        <circle cx="26" cy="24" r="3.5" fill={c1} fillOpacity="0.75" />
        <line x1="35" y1="24" x2="56" y2="24" stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
      </svg>
    </div>
  );
}
