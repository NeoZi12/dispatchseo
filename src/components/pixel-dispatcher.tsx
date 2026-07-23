"use client";

import { useEffect, useState } from "react";

// Pixel-art hero scene: the agent (a clay-colored blob, our nod to Claude
// Code's mascot) walks in from the left, hops onto the chair at the dispatch
// desk, a headset drops onto its head, and it settles in for the shift:
// breathing, blinking, the monitor's rank chart climbing, the coffee steaming.
// Everything is drawn as SVG rects from character grids - no image assets,
// crisp at any size.

const TICK_MS = 120;

// Timeline (in ticks)
const WALK_END = 34; // walking ends, hop begins
const HOP_END = 38; // hop ends, seated
const DROP_START = 40; // headset starts dropping
const DROP_END = 45; // headset on - idle loop from here

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

function gridRects(grid: string[], ox: number, oy: number, keyPrefix: string) {
  const rects = [];
  for (let r = 0; r < grid.length; r++) {
    for (let col = 0; col < grid[r].length; col++) {
      const ch = grid[r][col];
      if (ch === ".") continue;
      rects.push(
        <rect key={`${keyPrefix}-${r}-${col}`} x={ox + col} y={oy + r} width={1} height={1} fill={PALETTE[ch]} />
      );
    }
  }
  return rects;
}

function px(x: number, y: number, fill: string, key: string, w = 1, h = 1) {
  return <rect key={key} x={x} y={y} width={w} height={h} fill={fill} />;
}

function Scene({ t }: { t: number }) {
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
    // breathing bob + occasional blink once settled
    if (idle >= 0) {
      charY += idle % 16 < 8 ? 0 : 1;
      grid = idle % 27 < 2 ? SIT_BLINK : SIT;
    } else {
      grid = SIT;
    }
  }

  // --- headset ---
  let headset = null;
  if (t >= DROP_START) {
    const drops = [-10, -7, -4, -2, -1];
    const dy = drops[Math.min(t - DROP_START, drops.length - 1)];
    headset = gridRects(HEADSET, charX, charY + dy, "hp");
  }

  // --- monitor: off until the headset lands, then it boots and the chart
  // bars grow left to right and reset ---
  const screenOn = t >= DROP_END;
  const chart = [];
  if (screenOn) {
    const growth = Math.floor(((t - DROP_END) % 46) / 2);
    for (let i = 0; i < CHART_TARGETS.length; i++) {
      const h = Math.min(CHART_TARGETS[i], Math.max(0, growth - i * 3));
      if (h > 0) chart.push(px(CHART_X[i], CHART_BASE - h, "#4ade80", `bar${i}`, 2, h));
    }
  }

  // --- coffee steam ---
  const steam =
    t % 8 < 4
      ? [px(103, 24, "#4b4b55", "s1"), px(104, 22, "#3a3a42", "s2")]
      : [px(104, 24, "#4b4b55", "s1"), px(103, 22, "#3a3a42", "s2")];

  return (
    <svg
      viewBox="20 12 128 32"
      role="img"
      aria-label="Pixel art: a small AI agent walks to a desk, puts on a headset, and starts typing away"
      shapeRendering="crispEdges"
      className="block h-auto w-full"
    >
      {/* floor */}
      {px(24, 40, "#232329", "floor", 120, 1)}
      {px(40, 41, "#17171b", "floor2", 88, 1)}

      {/* chair: backrest, seat, legs */}
      {px(64, 26, "#3a3a42", "chback", 2, 6)}
      {px(66, 32, "#3a3a42", "chseat", 12, 2)}
      {px(67, 34, "#2e2e35", "chleg1", 2, 6)}
      {px(74, 34, "#2e2e35", "chleg2", 2, 6)}

      {/* character + headset */}
      {gridRects(grid, charX, charY, "ch")}
      {headset}

      {/* desk */}
      {px(77, 30, "#3a3a42", "dtop", 32, 1)}
      {px(77, 31, "#2e2e35", "dtop2", 32, 1)}
      {px(78, 32, "#2e2e35", "dleg1", 2, 8)}
      {px(105, 32, "#2e2e35", "dleg2", 2, 8)}

      {/* keyboard */}
      {px(79, 29, "#2e2e35", "kb", 7, 1)}
      {px(80, 29, "#3a3a42", "kb1")}
      {px(82, 29, "#3a3a42", "kb2")}
      {px(84, 29, "#3a3a42", "kb3")}

      {/* monitor: bezel, screen, chart, live dot, stand */}
      {px(88, 19, "#26262c", "mbez", 13, 9)}
      {px(89, 20, screenOn ? "#12121a" : "#0a0a0c", "mscr", 11, 7)}
      {chart}
      {screenOn && t % 6 < 3 ? px(98, 21, "#8b5cf6", "live", 1, 1) : null}
      {px(93, 28, "#26262c", "mstand", 3, 2)}

      {/* mug + steam */}
      {px(103, 27, "#8b5cf6", "mug", 2, 3)}
      {px(105, 28, "#6d3fd8", "mughandle", 1, 1)}
      {steam}
    </svg>
  );
}

// working: start already seated at the desk (skip the 5s walk-in) and loop
// the typing/idle animation - the right state for a loading spinner, where
// the agent is "on the job" rather than arriving.
export function PixelDispatcher({ className, working }: { className?: string; working?: boolean }) {
  const [t, setT] = useState(working ? DROP_END : 0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      return;
    }
    const id = setInterval(() => setT((v) => v + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Reduced motion: skip straight to the settled scene, no timers.
  // className overrides the landing page's .pixel-stage sizing so other
  // surfaces (the onboarding wizard) can size it with utilities instead of
  // needing landing.css.
  return (
    <div className={className ?? "pixel-stage"}>
      <Scene t={reduced ? DROP_END + 36 : t} />
    </div>
  );
}
