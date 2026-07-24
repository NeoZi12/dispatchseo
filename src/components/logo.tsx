// Pixel-art "dispatch radio" brand mark for DispatchSEO — a walkie-talkie with a
// three-bar speaker grille, background removed to transparent so it sits on any
// surface. Source art lives at public/dispatch-mark.png; CSS (.logo-mark etc.)
// controls the rendered height, width stays auto to preserve the aspect ratio.
export function DispatchMark({ className }: { className?: string }) {
  return (
    // object-contain so fixed-square sizes (h-5 w-5, h-7 w-7) letterbox the
    // taller-than-wide sprite instead of stretching it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/dispatch-mark.png"
      alt=""
      aria-hidden="true"
      className={`object-contain ${className ?? ""}`}
    />
  );
}
