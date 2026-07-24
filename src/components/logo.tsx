// Pixel-art "dispatch radio" brand mark for DispatchSEO. Blocky, hard-edged
// (shapeRendering="crispEdges") walkie-talkie with a three-bar speaker grille,
// drawn on a transparent background so it sits on any surface. Palette matches
// the brand violet.
export function DispatchMark({ className }: { className?: string }) {
  const dark = "#1c0f33"; // outline / shadow line
  const face = "#8b6cf0"; // main body face
  const hi = "#ad9bf6"; // highlight (top / left edge)
  const shade = "#5a3fc0"; // right-side body shadow
  const screen = "#0a0a0a"; // display panel
  const bar = "#a78bfa"; // speaker grille bars

  return (
    <svg
      viewBox="0 0 220 280"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* left antenna */}
      <rect x="46" y="8" width="30" height="66" fill={dark} />
      <rect x="52" y="14" width="18" height="54" fill={face} />
      <rect x="56" y="16" width="8" height="30" fill={hi} />

      {/* right nub antenna */}
      <rect x="126" y="42" width="34" height="36" fill={dark} />
      <rect x="132" y="48" width="22" height="26" fill={face} />
      <rect x="136" y="50" width="8" height="12" fill={hi} />

      {/* left side button (PTT) */}
      <rect x="16" y="150" width="22" height="44" fill={dark} />
      <rect x="20" y="154" width="16" height="36" fill={face} />
      <rect x="22" y="156" width="8" height="18" fill={hi} />

      {/* body */}
      <rect x="30" y="70" width="160" height="184" fill={dark} />
      <rect x="40" y="80" width="140" height="164" fill={face} />
      {/* right-side shadow */}
      <rect x="156" y="80" width="24" height="164" fill={shade} />
      {/* left / top highlight */}
      <rect x="40" y="80" width="10" height="164" fill={hi} />
      <rect x="40" y="80" width="140" height="10" fill={hi} />

      {/* display panel */}
      <rect x="58" y="106" width="104" height="70" fill={dark} />
      <rect x="66" y="114" width="88" height="54" fill={screen} />

      {/* three-bar speaker grille */}
      <rect x="74" y="122" width="72" height="10" fill={bar} />
      <rect x="74" y="136" width="72" height="10" fill={bar} />
      <rect x="74" y="150" width="72" height="10" fill={bar} />
    </svg>
  );
}
