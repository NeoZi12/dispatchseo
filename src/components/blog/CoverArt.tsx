import type { CSSProperties, ReactNode } from "react";
import type { CoverAccent, CoverMotif } from "@/lib/blog-covers";

// The generated cover plate for /blog index cards (posts have no images).
// One formula for every cover so they read as a designed family rather than
// random decoration: a bright accent-tinted field over the site's own
// neutral-900/950 tones (still reads as the same dark dashboard, just a
// vivid one - not a marketing gradient), a dot-grid texture, and the topic
// glyph rendered TWICE at different scales - a big, faint, corner-cropped
// echo behind a small crisp copy placed off-center. That two-layer,
// asymmetric composition is the plate's signature: it replaces an earlier
// version of this component that used an oversized cropped title monogram,
// which read as a rendering glitch at thumbnail size and got cut for this
// glyph-only composition instead. Pure CSS/SVG, server-rendered, zero JS.
// Decorative only (aria-hidden) - the card's text carries all the meaning.
//
// Accent values are literal Tailwind palette colors (the -300/-400 shades)
// rather than `var(--color-*)` references: Tailwind v4 only emits the CSS
// custom property for a shade actually used by a generated utility class
// elsewhere, so e.g. sky-300 would silently be missing from the compiled
// CSS the moment no other component happens to use that exact class.
// Hardcoding the oklch values sidesteps that - it's still Tailwind's own
// palette, just inlined instead of looked up at runtime.
//
// The caller supplies the aspect ratio / size via className; both glyph
// layers scale with the plate via container-query units (@container).

const ACCENT_COLOR: Record<CoverAccent, { tint: string; glyph: string }> = {
  violet: { tint: "oklch(70.2% 0.183 293.541)", glyph: "oklch(81.1% 0.111 293.571)" }, // violet-400 / violet-300
  sky: { tint: "oklch(74.6% 0.16 232.661)", glyph: "oklch(82.8% 0.111 230.318)" }, // sky-400 / sky-300
  emerald: { tint: "oklch(76.5% 0.177 163.223)", glyph: "oklch(84.5% 0.143 164.978)" }, // emerald-400 / emerald-300
  amber: { tint: "oklch(82.8% 0.189 84.429)", glyph: "oklch(87.9% 0.169 91.605)" }, // amber-400 / amber-300
  rose: { tint: "oklch(71.2% 0.194 13.428)", glyph: "oklch(81% 0.117 11.638)" }, // rose-400 / rose-300
};

const GLYPHS: Record<CoverMotif, ReactNode> = {
  plug: (
    <>
      <path d="M8 3v4M16 3v4" />
      <path d="M6 7h12v4a6 6 0 0 1-12 0V7z" />
      <path d="M12 17v4" />
    </>
  ),
  loop: (
    <>
      <path d="M4 12a8 8 0 0 1 8-8c2.5 0 4.7 1.2 6 3" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-8 8c-2.5 0-4.7-1.2-6-3" />
      <path d="M4 20v-5h5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l3.5-5" />
      <circle cx="12" cy="16" r="1.3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l8 4.5-8 4.5-8-4.5 8-4.5z" />
      <path d="M4 12.5l8 4.5 8-4.5" />
      <path d="M4 16.5l8 4.5 8-4.5" />
    </>
  ),
  brackets: (
    <>
      <path d="M9 4L4 12l5 8" />
      <path d="M15 4l5 8-5 8" />
    </>
  ),
};

export function CoverArt({
  accent,
  motif,
  className = "",
}: {
  accent: CoverAccent;
  motif: CoverMotif;
  className?: string;
}) {
  const glyph = GLYPHS[motif];

  // Frameless by design: the plate carries no border or radius of its own -
  // it sits flush inside a contained card whose overflow-hidden clips it to
  // the card's own corners, so it reads as part of the card, not a photo
  // dropped on top of it.
  return (
    <div
      aria-hidden="true"
      className={`@container relative isolate overflow-hidden shadow-[inset_0_1px_0_rgba(245,245,245,0.06)] ${className}`}
      style={
        {
          "--ca": ACCENT_COLOR[accent].tint,
          "--ca-glyph": ACCENT_COLOR[accent].glyph,
          background:
            "linear-gradient(155deg, color-mix(in oklab, var(--ca) 46%, var(--color-neutral-900)) 0%, color-mix(in oklab, var(--ca) 20%, var(--color-neutral-950)) 100%)",
        } as CSSProperties
      }
    >
      <div
        className="absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(10,10,10,0.4) 1px, transparent 0)",
          backgroundSize: "14px 14px",
        }}
      />
      {/* Big, faint echo of the same glyph, cropped into the corner - the
          plate's oversized element, now built from the topic's own icon
          instead of a title-derived monogram letter. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ca-glyph)"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute -bottom-[20%] -right-[20%] h-[92%] w-[92%] opacity-[0.22]"
      >
        {glyph}
      </svg>
      {/* Small, crisp glyph placed off-center rather than dead-centered, so
          the plate reads as a composition, not an icon dropped in a box. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ca-glyph)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-[14%] top-[18%] h-[36%] w-[36%] drop-shadow-[0_0_10px_rgba(0,0,0,0.35)]"
      >
        {glyph}
      </svg>
    </div>
  );
}
