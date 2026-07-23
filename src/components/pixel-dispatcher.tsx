"use client";

import { useEffect, useRef } from "react";

// Pixel-art hero scene: the agent (a clay-colored blob, our nod to Claude
// Code's mascot) walks in from the left, hops onto the chair at the dispatch
// desk, a headset drops onto its head, and it settles in for the shift:
// breathing, blinking, the monitor's rank chart climbing, the coffee steaming.
//
// Rendered on a <canvas>, NOT SVG-in-the-DOM, on purpose: an SVG frame
// animation re-creates dozens of <rect> nodes ~8x/second, and that constant
// DOM churn makes page-scanning tools (Chrome Translate, Grammarly) re-walk
// the whole document on every frame - which stole focus from form fields on
// the onboarding wizard (2026-07-23). A canvas updates its bitmap with zero
// DOM mutation, so nothing downstream can react to it.

const TICK_MS = 120;

// Timeline (in ticks)
const WALK_END = 34; // walking ends, hop begins
const HOP_END = 38; // hop ends, seated
const DROP_START = 40; // headset starts dropping
const DROP_END = 45; // headset on - idle loop from here

// The drawing coordinate space (matches the old SVG viewBox "20 12 128 32"):
// everything is authored in these units, then offset into a 128x32 canvas.
const VB_X = 20;
const VB_Y = 12;
const VB_W = 128;
const VB_H = 32;

const PALETTE: Record<string, string> = {
  c: "#d97757", // clay body
  C: "#b0563a", // clay shade / legs
  e: "#1a1a1e", // eyes
  v: "#8b5cf6", // violet (headset, mug)
  V: "#6d3fd8", // violet shade
  m: "#d4d4d8", // mic tip
};

// 12 x 11 character grids ('.' = transparent)
const BODY_OPEN = [
  "...cccccc...",
  "..cccccccc..",
  ".cccccccccc.",
  ".cccccccccc.",
  ".ccccecccec.",
  ".ccccecccec.",
  ".cccccccccc.",
  ".cCCCCCCCCc.",
  "..CCCCCCCC..",
];
const BODY_BLINK = [
  ...BODY_OPEN.slice(0, 4),
  ".cccccccccc.",
  ".ccccCcccCc.",
  ...BODY_OPEN.slice(6),
];
const LEGS_STRIDE = ["..CC....CC..", ".CC......CC."];
const LEGS_PASS = ["...CC..CC...", "...CC..CC..."];
const LEGS_SIT = ["..CC....CC..", "..CC....CC.."];

const WALK_A = [...BODY_OPEN, ...LEGS_STRIDE];
const WALK_B = [...BODY_OPEN, ...LEGS_PASS];
const SIT = [...BODY_OPEN, ...LEGS_SIT];
const SIT_BLINK = [...BODY_BLINK, ...LEGS_SIT];

// 12 x 9 headset grid, anchored 1 unit above the character's head
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

// Seated character position (right up against the desk, hands over the keys)
const SEAT_X = 66;
const SEAT_Y = 23;
// Hop arc from the end of the walk up onto the chair
const HOP_ARC: Array<[number, number]> = [
  [55, 28],
  [60, 24],
  [63, 21],
  [SEAT_X, SEAT_Y],
];

const CHART_TARGETS = [2, 3, 4, 5];
const CHART_X = [90, 92, 94, 96];
const CHART_BASE = 27; // bars grow upward from here

function fillPx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x - VB_X, y - VB_Y, w, h);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  ox: number,
  oy: number,
) {
  for (let r = 0; r < grid.length; r++) {
    for (let col = 0; col < grid[r].length; col++) {
      const ch = grid[r][col];
      if (ch === ".") continue;
      fillPx(ctx, ox + col, oy + r, 1, 1, PALETTE[ch]);
    }
  }
}

// Draw the whole scene at tick t. Same composition + order as the old SVG,
// so later paints (desk, monitor) still sit in front of the character.
function drawScene(ctx: CanvasRenderingContext2D, t: number) {
  ctx.clearRect(0, 0, VB_W, VB_H);

  // --- character position + frame ---
  let charX: number;
  let charY: number;
  let grid: string[];
  if (t < WALK_END) {
    charX = Math.round(4 + ((50 - 4) * t) / WALK_END);
    charY = 29;
    grid = Math.floor(t / 2) % 2 === 0 ? WALK_A : WALK_B;
  } else if (t < HOP_END) {
    [charX, charY] = HOP_ARC[Math.min(t - WALK_END, HOP_ARC.length - 1)];
    grid = SIT;
  } else {
    charX = SEAT_X;
    charY = SEAT_Y;
    const idle = t - DROP_END;
    if (idle >= 0) {
      charY += idle % 16 < 8 ? 0 : 1;
      grid = idle % 27 < 2 ? SIT_BLINK : SIT;
    } else {
      grid = SIT;
    }
  }

  // --- headset drop offset ---
  let headsetY: number | null = null;
  if (t >= DROP_START) {
    const drops = [-10, -7, -4, -2, -1];
    headsetY = charY + drops[Math.min(t - DROP_START, drops.length - 1)];
  }

  const screenOn = t >= DROP_END;

  // floor
  fillPx(ctx, 24, 40, 120, 1, "#232329");
  fillPx(ctx, 40, 41, 88, 1, "#17171b");

  // chair: backrest, seat, legs
  fillPx(ctx, 64, 26, 2, 6, "#3a3a42");
  fillPx(ctx, 66, 32, 12, 2, "#3a3a42");
  fillPx(ctx, 67, 34, 2, 6, "#2e2e35");
  fillPx(ctx, 74, 34, 2, 6, "#2e2e35");

  // character + headset
  drawGrid(ctx, grid, charX, charY);
  if (headsetY !== null) drawGrid(ctx, HEADSET, charX, headsetY);

  // desk
  fillPx(ctx, 77, 30, 32, 1, "#3a3a42");
  fillPx(ctx, 77, 31, 32, 1, "#2e2e35");
  fillPx(ctx, 78, 32, 2, 8, "#2e2e35");
  fillPx(ctx, 105, 32, 2, 8, "#2e2e35");

  // keyboard
  fillPx(ctx, 79, 29, 7, 1, "#2e2e35");
  fillPx(ctx, 80, 29, 1, 1, "#3a3a42");
  fillPx(ctx, 82, 29, 1, 1, "#3a3a42");
  fillPx(ctx, 84, 29, 1, 1, "#3a3a42");

  // monitor: bezel, screen, chart, live dot, stand
  fillPx(ctx, 88, 19, 13, 9, "#26262c");
  fillPx(ctx, 89, 20, 11, 7, screenOn ? "#12121a" : "#0a0a0c");
  if (screenOn) {
    const growth = Math.floor(((t - DROP_END) % 46) / 2);
    for (let i = 0; i < CHART_TARGETS.length; i++) {
      const h = Math.min(CHART_TARGETS[i], Math.max(0, growth - i * 3));
      if (h > 0) fillPx(ctx, CHART_X[i], CHART_BASE - h, 2, h, "#4ade80");
    }
  }
  if (screenOn && t % 6 < 3) fillPx(ctx, 98, 21, 1, 1, "#8b5cf6");
  fillPx(ctx, 93, 28, 3, 2, "#26262c");

  // mug + steam
  fillPx(ctx, 103, 27, 2, 3, "#8b5cf6");
  fillPx(ctx, 105, 28, 1, 1, "#6d3fd8");
  if (t % 8 < 4) {
    fillPx(ctx, 103, 24, 1, 1, "#4b4b55");
    fillPx(ctx, 104, 22, 1, 1, "#3a3a42");
  } else {
    fillPx(ctx, 104, 24, 1, 1, "#4b4b55");
    fillPx(ctx, 103, 22, 1, 1, "#3a3a42");
  }
}

// working: start already seated at the desk (skip the ~5s walk-in) and loop
// the typing/idle animation - the right state for a persistent header or a
// loading spinner, where the agent is "on the job" rather than arriving.
export function PixelDispatcher({
  className,
  working,
}: {
  className?: string;
  working?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    // Reduced motion: paint the settled scene once, no ticking.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawScene(ctx, DROP_END + 36);
      return;
    }
    let t = working ? DROP_END : 0;
    drawScene(ctx, t);
    const id = setInterval(() => {
      t += 1;
      drawScene(ctx, t);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [working]);

  return (
    <div className={className ?? "pixel-stage"}>
      <canvas
        ref={canvasRef}
        width={VB_W}
        height={VB_H}
        role="img"
        aria-label="Pixel art: a small AI agent at a dispatch desk, headset on, working"
        translate="no"
        className="block h-auto w-full [image-rendering:pixelated]"
      />
    </div>
  );
}
