import type { ReactNode } from "react";

// The clay agent sitting on the edge of a pricing card, headset on, legs
// dangling over the border. Same character as the hero's pixel dispatcher:
// the BODY_OPEN / HEADSET / LEGS_SIT grids from pixel-dispatcher.tsx, with the
// headset anchored one row above the head exactly as the scene draws it.
//
// No "use client": he sits still; the only life in him is a blink every few
// seconds, pure CSS (landing.css, .card-mascot), so it renders on the server
// and costs no JavaScript. The blink stops under prefers-reduced-motion.

const HEADSET = [
  ".vvvvvvvvvv.",
  "v..........v",
  "v..........v",
  "V..........V",
  "Vv........vV",
  "Vv........vV",
  "VV........VV",
  "..........Vm",
];

// Body without the eyes (they are drawn separately so they can blink).
const BODY = [
  "...cccccc...",
  "..cccccccc..",
  ".cccccccccc.",
  ".cccccccccc.",
  ".cccccccccc.",
  ".cccccccccc.",
  ".cccccccccc.",
  ".cCCCCCCCCc.",
  "..CCCCCCCC..",
];
const EYES_OPEN = [
  "............",
  "............",
  "............",
  "............",
  ".....e...e..",
  ".....e...e..",
];
const EYES_SHUT = [
  "............",
  "............",
  "............",
  "............",
  "............",
  ".....C...C..",
];
// Legs hang still over the edge (owner, 2026-11-08: he sits, no swinging).
const LEGS = ["..CC....CC..", "..CC....CC.."];

const COLORS: Record<string, string> = {
  c: "#d97757", // clay body
  C: "#b0563a", // clay shade / legs
  e: "#1a1a1e", // eyes
  v: "#8b5cf6", // headset
  V: "#6d3fd8", // headset shade
  m: "#d4d4d8", // mic tip
};

function cells(grid: string[], dy: number, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      out.push(<rect key={`${keyPrefix}${r}-${c}`} x={c} y={r + dy} width={1} height={1} fill={COLORS[ch]} />);
    }
  });
  return out;
}

export function CardMascot({ className = "" }: { className?: string }) {
  // Rows: 0 = headset band above the head, 1-9 body, 10-11 legs.
  return (
    <svg
      className={`card-mascot ${className}`}
      viewBox="0 0 12 12"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <g>{cells(LEGS, 10, "l")}</g>
      <g>{cells(BODY, 1, "b")}</g>
      <g className="cm-eyes-open">{cells(EYES_OPEN, 1, "eo")}</g>
      <g className="cm-eyes-shut">{cells(EYES_SHUT, 1, "es")}</g>
      <g>{cells(HEADSET, 0, "h")}</g>
    </svg>
  );
}
