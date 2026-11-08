import { cx } from "@/components/ui/styles";

// A real screenshot of the exact screen the person is about to see, with
// the one thing to click picked out (owner, 2026-11-05: real screenshots beat
// drawings). The image stays clean - names, emails and avatars were covered
// with flat shapes once at capture time (public/setup/*) - and the pointing is
// CSS, so a moved button is a percentage to nudge, not an image to redo:
//   spot  - the part of the screen kept at full brightness; everything else
//           is dimmed, which is what makes the eye land without anything
//           drawn over the control itself.
//   ring  - a thin accent outline a few pixels OUTSIDE the control, so the
//           control's own pixels (text, avatar, button) are never covered.
// No cursor, no glow: both sat on top of the thing being pointed at.
// Coordinates are percentages of the image, so the overlay follows any size.

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius in px, or "pill" for Google's fully round buttons. */
  round?: number | "pill";
};

export type ShotProps = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Kept bright; the rest of the picture is dimmed. Omit to dim nothing. */
  spot?: Rect;
  /** The control(s) to click, outlined just outside their edges. */
  rings: Rect[];
  className?: string;
};

const RING_GAP = 5; // px between the control's edge and the ring

function radius(r: Rect["round"], extra = 0): string {
  if (r === "pill") return "999px";
  return `${(r ?? 8) + extra}px`;
}

export function Shot({ src, width, height, alt, spot, rings, className }: ShotProps) {
  return (
    <div className={cx("relative overflow-hidden", className)} style={{ aspectRatio: `${width} / ${height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, sized by its box */}
      <img src={src} alt={alt} width={width} height={height} className="block h-full w-full object-cover" draggable={false} />
      {spot ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            width: `${spot.w}%`,
            height: `${spot.h}%`,
            borderRadius: radius(spot.round, 4),
            boxShadow: "0 0 0 200vmax rgba(6, 6, 10, 0.48)",
          }}
        />
      ) : null}
      {rings.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute border-2 border-accent"
          style={{
            left: `calc(${r.x}% - ${RING_GAP}px)`,
            top: `calc(${r.y}% - ${RING_GAP}px)`,
            width: `calc(${r.w}% + ${RING_GAP * 2}px)`,
            height: `calc(${r.h}% + ${RING_GAP * 2}px)`,
            borderRadius: radius(r.round, RING_GAP),
            // A hairline of dark on both sides of the ring keeps it crisp on
            // light screens (Search Console) and dark ones (GitHub, Google).
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.35)",
          }}
        />
      ))}
    </div>
  );
}

/** A Shot bound to one image, usable as a `Frame` in the strip. */
export function shot(props: Omit<ShotProps, "className">): { Frame: (p: { className?: string }) => React.ReactElement } {
  return { Frame: ({ className }) => <Shot {...props} className={className} /> };
}

// The captured screens (public/setup/*.webp): real, taken at 1.3-1.6x zoom so
// the text reads, cropped to the control, personal details covered with flat
// shapes at capture time. Rects are percentages of each picture, measured on
// the control's own edges (the ring adds its own gap).
export const SHOTS = {
  googleAccounts: shot({
    src: "/setup/google-accounts.webp",
    width: 977,
    height: 410,
    alt: "Google's Choose an account screen, with the first account picked out",
    spot: { x: 53.2, y: 34.4, w: 42.1, h: 22, round: 10 },
    rings: [{ x: 53.2, y: 34.4, w: 42.1, h: 22, round: 10 }],
  }),
  googleConsent: shot({
    src: "/setup/google-consent.webp",
    width: 1001,
    height: 705,
    alt: "Google's consent screen for DispatchSEO, with the Continue button picked out",
    spot: { x: 75, y: 86.7, w: 20.6, h: 7.1, round: "pill" },
    rings: [{ x: 75, y: 86.7, w: 20.6, h: 7.1, round: "pill" }],
  }),
  gscPropertyType: shot({
    src: "/setup/gsc-property-type.webp",
    width: 437,
    height: 435,
    alt: "Search Console's URL prefix card with an address typed in, and its Continue button picked out",
    spot: { x: 4, y: 42, w: 92, h: 49, round: 8 },
    rings: [{ x: 36.6, y: 77.9, w: 26.8, h: 10.6, round: 4 }],
  }),
  gscVerify: shot({
    src: "/setup/gsc-verify.webp",
    width: 842,
    height: 590,
    alt: "Search Console's Verify ownership sheet, HTML file method, with the Verify button picked out",
    spot: { x: 3.8, y: 33.5, w: 90.7, h: 66, round: 8 },
    rings: [{ x: 77.2, y: 87.3, w: 13.7, h: 7.8, round: 4 }],
  }),
  githubWhere: shot({
    src: "/setup/github-where.webp",
    width: 820,
    height: 470,
    alt: "GitHub's Where do you want to install DispatchSEO screen, listing a personal account and an organization, with the first row picked out",
    spot: { x: 3.5, y: 59.6, w: 92.6, h: 17.2, round: 8 },
    rings: [{ x: 3.5, y: 59.6, w: 92.6, h: 17.2, round: 8 }],
  }),
  githubPickRepo: shot({
    src: "/setup/github-pick-repo.webp",
    width: 660,
    height: 575,
    alt: "GitHub's Install & Authorize page: Only select repositories is chosen and the repository list is open, with one repository picked out",
    spot: { x: 2, y: 33, w: 96, h: 66, round: 10 },
    rings: [
      { x: 4.5, y: 48.8, w: 38.5, h: 4.8, round: 6 },
      { x: 9.8, y: 80, w: 85.3, h: 16, round: 8 },
    ],
  }),
  githubInstall: shot({
    src: "/setup/github-install.webp",
    width: 660,
    height: 438,
    alt: "The bottom of GitHub's Install & Authorize page, with the green Install & Authorize button picked out",
    spot: { x: 2, y: 64, w: 96, h: 16, round: 10 },
    rings: [{ x: 4.85, y: 68.3, w: 33.5, h: 9.4, round: 6 }],
  }),
};
