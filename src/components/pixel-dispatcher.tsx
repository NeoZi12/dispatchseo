"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_AGENT, agentById, isSupportedAgent } from "@/lib/agents";

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

// Body colour is the only thing that changes between agents - the desk, the
// headset, the monitor and everything else stays the site's own clay/violet,
// so recolouring the character never reads as a second theme. "clay" (our
// nod to Claude Code's rust) is the default and the only palette every
// existing call site renders, byte-identical to before variants existed.
// Every other agent's body/shade pair comes off its registry entry
// (src/lib/agents/index.ts `mascot`), so a new agent brings its own colour
// without this file changing. Eyes stay the same dark ink for everyone, per
// the character's own design.
export type MascotVariant = string; // an agent id, or "clay" (the default body)

const CLAY: Record<string, string> = {
  c: "#d97757", // clay body
  C: "#b0563a", // clay shade / legs
  e: "#1a1a1e", // eyes
  v: "#8b5cf6", // violet (headset, mug)
  V: "#6d3fd8", // violet shade
  m: "#d4d4d8", // mic tip
};

// Two ways the variant arrives, one resolver:
//   1. An explicit `variant` prop (an agent id) - the per-agent landing hub
//      pages know statically which agent they present, and a non-default
//      agent's registry colour wins.
//   2. A CSS variable (--dispatcher-agent, an agent id) stamped by the
//      dashboard layout from the active project's agent - because the
//      dispatcher also shows on loading screens, which render synchronously
//      with no way to ask which project is active. Read per frame, so a live
//      agent switch retints on the next tick instead of waiting for a
//      remount. The var carries the ID, not colours: the palette always
//      resolves from the registry, so the two paths cannot drift.
// Anywhere neither applies (landing hero, wizard) the clay default renders,
// byte-identical to before variants existed.
function paletteFor(canvas: HTMLCanvasElement, variant: MascotVariant): Record<string, string> {
  let id: string = variant;
  if (id === "clay" || !isSupportedAgent(id)) {
    id = getComputedStyle(canvas).getPropertyValue("--dispatcher-agent").trim();
  }
  if (!isSupportedAgent(id) || id === DEFAULT_AGENT) return CLAY;
  const m = agentById(id).mascot;
  return { ...CLAY, c: m.body, C: m.shade };
}

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

// Looking out of the screen at you (eyes shifted toward the viewer and up a
// row): the hover/tap reaction, and the face it makes while waving.
const BODY_LOOK = [
  ...BODY_OPEN.slice(0, 3),
  ".cccecccecc.",
  ".cccecccecc.",
  ".cccccccccc.",
  ".cccccccccc.",
  ...BODY_OPEN.slice(7),
];

const WALK_A = [...BODY_OPEN, ...LEGS_STRIDE];
const WALK_B = [...BODY_OPEN, ...LEGS_PASS];
const SIT = [...BODY_OPEN, ...LEGS_SIT];
const SIT_BLINK = [...BODY_BLINK, ...LEGS_SIT];
const SIT_LOOK = [...BODY_LOOK, ...LEGS_SIT];

// 3 x 3 sleep "z" for the paused mood.
const ZED = ["zzz", ".z.", "zzz"];

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
  palette: Record<string, string>,
) {
  for (let r = 0; r < grid.length; r++) {
    for (let col = 0; col < grid[r].length; col++) {
      const ch = grid[r][col];
      if (ch === ".") continue;
      fillPx(ctx, ox + col, oy + r, 1, 1, palette[ch]);
    }
  }
}

// ---------------------------------------------------------------------------
// Moods (the hosted Report's dispatcher)
// ---------------------------------------------------------------------------
//
// What the character is doing says what the writer is doing, so the owner
// reads the state off the scene before reading a word:
//   working   - an article is in flight: typing (a hand hopping between keys),
//               the rank chart climbing on the monitor
//   idle      - nothing in flight, autopilot on: blinking, breathing, the odd
//               sip of coffee, the chart sitting finished
//   paused    - eyes shut, headset still on, a "z" drifting up now and then,
//               the monitor dimmed and the coffee gone cold
// On top of any mood, `flag` means it has something to tell the owner: an
// amber "!" stays over its head (the cue to click it), and awake it waves a
// few times when the scene settles, then gets back to work.
// No mood = the original scene, byte-identical, for every older call site.
// Colour discipline holds: the mood bits reuse the body colour and the
// scene's own violet/greys; amber appears only as the "!".
export type DispatcherMood = "working" | "idle" | "paused";

type SceneOpts = {
  mood: DispatcherMood;
  /** Looking up at the owner (hover / tap). */
  look: boolean;
  /** An article went live this week: the coffee steams a little higher. */
  steam: boolean;
  /** Something to say: the "!" (and, awake, a short wave). */
  flag: boolean;
};

const SIP_EVERY = 70; // ticks between sips (~8s)
const WAVE_FROM = 2; // idle ticks after settling before the wave starts
const WAVE_TO = 22; // ...and when it stops (five waves)
const ZED_EVERY = 30; // ticks between z's (~3.6s)

/** Where the mug is during a sip, or null when it's on the desk. */
function sipPhase(idle: number): "lift" | "sip" | null {
  const k = idle % SIP_EVERY;
  if (k === SIP_EVERY - 9 || k === SIP_EVERY - 2) return "lift";
  if (k > SIP_EVERY - 9 && k < SIP_EVERY - 2) return "sip";
  return null;
}

function waving(opts: SceneOpts | undefined, idle: number): boolean {
  return Boolean(opts?.flag) && opts?.mood !== "paused" && idle >= WAVE_FROM && idle < WAVE_TO;
}

// Draw the whole scene at tick t. Same composition + order as the old SVG,
// so later paints (desk, monitor) still sit in front of the character.
function drawScene(ctx: CanvasRenderingContext2D, t: number, palette: Record<string, string>, opts?: SceneOpts) {
  ctx.clearRect(0, 0, VB_W, VB_H);
  const idle = t - DROP_END;
  const mood = opts?.mood;
  const sip = mood === "idle" && idle >= 0 && !opts?.look ? sipPhase(idle) : null;

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
    if (idle >= 0) {
      // Asleep, the breathing slows down.
      charY += (mood === "paused" ? idle % 24 < 12 : idle % 16 < 8) ? 0 : 1;
      grid = idle % 27 < 2 ? SIT_BLINK : SIT;
      if (mood === "paused" || sip === "sip") grid = SIT_BLINK;
      else if (opts?.look || waving(opts, idle)) grid = SIT_LOOK;
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
  drawGrid(ctx, grid, charX, charY, palette);
  if (headsetY !== null) drawGrid(ctx, HEADSET, charX, headsetY, palette);

  // the wave: an arm raised on the far side of the chair, two frames
  if (idle >= 0 && waving(opts, idle)) {
    const arm: Array<[number, number]> =
      Math.floor(idle / 2) % 2 === 0
        ? [[65, 29], [64, 28], [63, 27], [62, 26], [61, 25]]
        : [[65, 29], [64, 28], [64, 27], [64, 26], [64, 25]];
    for (const [x, y] of arm) fillPx(ctx, x, y + (charY - SEAT_Y), 1, 1, palette.c);
  }

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

  // typing: one hand hopping between keys, the arm reaching from the body
  if (idle >= 0 && mood === "working" && !opts?.look) {
    const k = idle % 6;
    const hx = [79, 79, 82, 82, 80, 80][k];
    const hy = k % 2 === 0 ? 29 : 28;
    for (let x = 77; x < hx; x++) fillPx(ctx, x, 29, 1, 1, palette.C);
    fillPx(ctx, hx, hy, 2, 1, palette.c);
  }

  // monitor: bezel, screen, chart, live dot, stand. Without a mood the chart
  // climbs on a loop (the original scene); with one it climbs only while an
  // article is being written, sits finished otherwise, and dims when paused.
  const dim = mood === "paused";
  fillPx(ctx, 88, 19, 13, 9, "#26262c");
  fillPx(ctx, 89, 20, 11, 7, screenOn ? (dim ? "#0d0d11" : "#12121a") : "#0a0a0c");
  if (screenOn) {
    const climbing = !mood || mood === "working";
    const growth = climbing ? Math.floor(((t - DROP_END) % 46) / 2) : 99;
    for (let i = 0; i < CHART_TARGETS.length; i++) {
      const h = Math.min(CHART_TARGETS[i], Math.max(0, growth - i * 3));
      if (h > 0) fillPx(ctx, CHART_X[i], CHART_BASE - h, 2, h, dim ? "#1d3d2b" : "#4ade80");
    }
  }
  if (screenOn && !dim && t % 6 < 3) fillPx(ctx, 98, 21, 1, 1, "#8b5cf6");
  fillPx(ctx, 93, 28, 3, 2, "#26262c");

  // mug + steam: on the desk, or in hand mid-sip (lifted, then at the face
  // with the eyes shut). Paused, the coffee has gone cold - no steam.
  // In hand it sits a pixel clear of the headset cup, tipped up at the sip,
  // so the two violets never merge into one shape.
  if (sip === "lift") {
    fillPx(ctx, 79, 27, 2, 3, "#8b5cf6");
  } else if (sip === "sip") {
    fillPx(ctx, 79, 26, 2, 3, "#8b5cf6");
    fillPx(ctx, 81, 26, 1, 1, "#6d3fd8");
  } else {
    fillPx(ctx, 103, 27, 2, 3, "#8b5cf6");
    fillPx(ctx, 105, 28, 1, 1, "#6d3fd8");
    if (!dim) {
      if (t % 8 < 4) {
        fillPx(ctx, 103, 24, 1, 1, "#4b4b55");
        fillPx(ctx, 104, 22, 1, 1, "#3a3a42");
        if (opts?.steam) fillPx(ctx, 103, 20, 1, 1, "#2e2e35");
      } else {
        fillPx(ctx, 104, 24, 1, 1, "#4b4b55");
        fillPx(ctx, 103, 22, 1, 1, "#3a3a42");
        if (opts?.steam) fillPx(ctx, 104, 20, 1, 1, "#2e2e35");
      }
    }
  }

  if (idle < 0) return;
  // something to say: the amber "!" over the head, for as long as it's true
  if (opts?.flag) {
    fillPx(ctx, 71, 15, 2, 3, "#fbbf24");
    fillPx(ctx, 71, 19, 2, 1, "#fbbf24");
  }
  // paused: a "z" drifts up and to the right, fading as it goes
  if (dim) {
    const f = idle % ZED_EVERY;
    if (f < 14) {
      const zx = 78 + Math.floor(f / 4);
      const zy = 20 - Math.floor(f / 2);
      const tone = f < 5 ? "#a3a3a3" : f < 10 ? "#6b6b75" : "#3a3a42";
      drawGrid(ctx, ZED, zx, zy, { z: tone });
    }
  }
}

// ---------------------------------------------------------------------------
// Desk: the seated scene, cropped in tight
// ---------------------------------------------------------------------------
//
// The full scene is authored 128 units wide because the character walks in
// from the left, and almost all of that width is empty floor once it sits
// down. Rendering the whole thing big enough to see the agent's face would put
// a 500px strip of nothing across the card.
//
// So this crops to the part that has the desk in it: chair, agent, desk,
// keyboard, monitor and mug, from x 42 to x 92 and y 5 to y 30 in the scene's
// own canvas space. Same drawScene, same palette resolver, same idle loop
// (blink, breath, the chart climbing, the steam) - it is a viewport onto the
// existing scene, not a second drawing of it, so the two can never drift.
const DESK_X = 42;
const DESK_Y = 5;
const DESK_W = 50;
const DESK_H = 25;

export function PixelDesk({
  className,
  variant = "clay",
}: {
  className?: string;
  variant?: MascotVariant;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    const paint = (t: number) => {
      // Shift the scene's coordinate space so the crop lands on the canvas.
      ctx.setTransform(1, 0, 0, 1, -DESK_X, -DESK_Y);
      // drawScene clears only its own 128x32 rectangle, which no longer covers
      // the whole canvas once translated - clear the real canvas here or the
      // right edge keeps the previous frame.
      ctx.clearRect(DESK_X, DESK_Y, DESK_W, DESK_H);
      drawScene(ctx, t, paletteFor(canvas, variant));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(DROP_END + 36);
      return;
    }
    // Start seated with the headset already on: this is a card that renders on
    // every visit, and watching the agent walk to its chair on the fiftieth
    // load is charming exactly zero of those times.
    let t = DROP_END;
    paint(t);
    const id = setInterval(() => {
      t += 1;
      paint(t);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      width={DESK_W}
      height={DESK_H}
      role="img"
      aria-label="Pixel art: your SEO agent at its desk, headset on, watching a rank chart climb"
      translate="no"
      className={`block h-auto [image-rendering:pixelated] ${className ?? ""}`}
    />
  );
}

// working: start already seated at the desk (skip the ~5s walk-in) and loop
// the typing/idle animation - the right state for a persistent header or a
// loading spinner, where the agent is "on the job" rather than arriving.
export function PixelDispatcher({
  className,
  working,
  variant = "clay",
}: {
  className?: string;
  working?: boolean;
  variant?: MascotVariant;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    // Reduced motion: paint the settled scene once, no ticking.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawScene(ctx, DROP_END + 36, paletteFor(canvas!, variant));
      return;
    }
    let t = working ? DROP_END : 0;
    drawScene(ctx, t, paletteFor(canvas!, variant));
    const id = setInterval(() => {
      t += 1;
      drawScene(ctx, t, paletteFor(canvas!, variant));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [working, variant]);

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

// ---------------------------------------------------------------------------
// Reporter: the hosted Report's dispatcher, delivering the headline
// ---------------------------------------------------------------------------
//
// A crop between the desk crop and the full scene: wide enough on the left
// for the last stretch of the walk-in to happen on screen, tall enough over
// the head for the mood marks (the "!", the drifting "z"). Scene x 46-111,
// y 14-41, so the seated agent's head sits ~39% across - the speech bubble's
// tail points there.
const REPORT_X = 26; // canvas space (scene x 46)
const REPORT_Y = 2; // canvas space (scene y 14)
const REPORT_W = 66;
const REPORT_H = 28;
// First tick of the walk worth drawing: the agent's leading edge is just
// off the crop's left side here, so it walks straight into frame.
const WALK_ENTER = 22;
const LOOK_TICKS = 9;

const MOOD_LABEL: Record<DispatcherMood, string> = {
  working: "Your dispatcher at the desk, typing an article",
  idle: "Your dispatcher at the desk between articles, coffee in reach",
  paused: "Your dispatcher asleep at the desk while autopilot is paused",
};

// sessionStorage flag: the walk-in has played in this browser session.
const WALKIN_SEEN_KEY = "dispatch-walkin-seen";

/**
 * The walk-in plays once per browser session (a sessionStorage flag, read
 * and set right here); every later render starts seated - watching it walk
 * to its chair on the fiftieth load is charming zero times. Hover or tap and it looks
 * up at you for a second. `label` replaces the canvas's own description
 * when a parent (a button) already names it.
 */
export { MOOD_LABEL as DISPATCHER_MOOD_LABEL };

export function PixelReporter({
  mood,
  steam = false,
  flag = false,
  className,
  variant = "clay",
  decorative = false,
}: {
  mood: DispatcherMood;
  steam?: boolean;
  flag?: boolean;
  className?: string;
  variant?: MascotVariant;
  /** Inside a control that names it: hide the canvas from assistive tech. */
  decorative?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tick = useRef(DROP_END);
  const lookUntil = useRef(-1);
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const paint = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, -REPORT_X, -REPORT_Y);
      ctx.clearRect(REPORT_X, REPORT_Y, REPORT_W, REPORT_H);
      drawScene(ctx, t, paletteFor(canvas, variant), { mood, steam, flag, look: t < lookUntil.current });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // One settled frame that still tells the mood: typing hand, finished
      // chart, a z mid-drift, the "!" - and a look when hovered.
      const still = DROP_END + 36;
      repaint.current = () => {
        tick.current = still;
        paint(still);
      };
      paint(still);
      return () => {
        repaint.current = null;
      };
    }

    let walk = false;
    try {
      walk = !sessionStorage.getItem(WALKIN_SEEN_KEY);
      sessionStorage.setItem(WALKIN_SEEN_KEY, "1");
    } catch {
      // Storage blocked: no way to remember, so it simply starts seated.
    }
    // A mood change mid-visit keeps the clock running (no second walk-in).
    tick.current = walk && tick.current === DROP_END ? WALK_ENTER : Math.max(tick.current, DROP_END);
    paint(tick.current);
    repaint.current = () => paint(tick.current);
    const id = setInterval(() => {
      tick.current += 1;
      paint(tick.current);
    }, TICK_MS);
    return () => {
      clearInterval(id);
      repaint.current = null;
    };
  }, [mood, steam, flag, variant]);

  const lookUp = () => {
    if (tick.current < HOP_END) return; // still walking in
    lookUntil.current = tick.current + LOOK_TICKS;
    repaint.current?.();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No clock ticking to end the look: put the face back by hand.
      window.setTimeout(() => {
        lookUntil.current = -1;
        repaint.current?.();
      }, LOOK_TICKS * TICK_MS);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={REPORT_W}
      height={REPORT_H}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : MOOD_LABEL[mood]}
      aria-hidden={decorative || undefined}
      translate="no"
      onPointerEnter={lookUp}
      onClick={lookUp}
      className={`block h-auto [image-rendering:pixelated] ${className ?? ""}`}
    />
  );
}
