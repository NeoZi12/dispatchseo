#!/usr/bin/env node
// Rasterizes the dispatcher into the PNG/GIF art the customer emails use
// (src/lib/email/templates.ts), into public/email/.
//
//   node scripts/render-email-art.mjs
//
// Why files and not markup: email clients strip inline SVG (Gmail) and never
// run a <canvas>, so the pixel character has to arrive as an image. Local
// one-off only: sharp is a dependency but does NOT load on Vercel (libvips is
// missing there), so this never runs in production - its output is committed.
//
// ONE CHARACTER, NOT A COPY. The character grids are read out of the
// component sources at run time (pixel-dispatcher.tsx, card-mascot.tsx), so a
// change to the character on the site is picked up by the next run here. The
// desk, monitor and mug are drawn with drawScene()'s own coordinates and
// colours (pixel-dispatcher.tsx); if those move, move them here too.
//
// Email images are cached forever by Gmail's image proxy: when the art
// changes, bump ART_VERSION so the file names change with it (and the
// templates pick the new names up from EMAIL_ART in templates.ts).

import { readFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ART_VERSION = "v1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "email");
mkdirSync(OUT, { recursive: true });

// --- the character, read from the components --------------------------------

function grid(file, name) {
  const src = readFileSync(join(ROOT, "src", "components", file), "utf8");
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  const rows = [...m[1].matchAll(/"([^"]*)"/g)].map((r) => r[1]);
  if (!rows.length) throw new Error(`${name} in ${file} is not a literal grid`);
  return rows;
}

const BODY_OPEN = grid("pixel-dispatcher.tsx", "BODY_OPEN");
const HEADSET = grid("pixel-dispatcher.tsx", "HEADSET");
const LEGS_SIT = grid("pixel-dispatcher.tsx", "LEGS_SIT");
const ZED = grid("pixel-dispatcher.tsx", "ZED");
// Built exactly the way pixel-dispatcher.tsx builds them from BODY_OPEN.
const BODY_BLINK = [...BODY_OPEN.slice(0, 4), ".cccccccccc.", ".ccccCcccCc.", ...BODY_OPEN.slice(6)];
const BODY_LOOK = [...BODY_OPEN.slice(0, 3), ".cccecccecc.", ".cccecccecc.", ".cccccccccc.", ".cccccccccc.", ...BODY_OPEN.slice(7)];
const SIT = [...BODY_OPEN, ...LEGS_SIT];
const SIT_BLINK = [...BODY_BLINK, ...LEGS_SIT];
const SIT_LOOK = [...BODY_LOOK, ...LEGS_SIT];

// card-mascot.tsx: the sitting agent with the headset, used for the sign-off.
const CARD_HEADSET = grid("card-mascot.tsx", "HEADSET");
const CARD_BODY = grid("card-mascot.tsx", "BODY");
const CARD_EYES = grid("card-mascot.tsx", "EYES_OPEN");
const CARD_LEGS = grid("card-mascot.tsx", "LEGS");

const PAL = {
  c: "#d97757", // clay body
  C: "#b0563a", // clay shade / legs
  e: "#1a1a1e", // eyes
  v: "#8b5cf6", // headset, mug
  V: "#6d3fd8", // violet shade
  m: "#d4d4d8", // mic tip
};

// --- a tiny RGBA pixel canvas, in scene units --------------------------------

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

class Px {
  constructor(w, h, bg = null) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
    if (bg) this.rect(0, 0, w, h, bg);
  }
  set(x, y, color) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hex(color);
    const i = (y * this.w + x) * 4;
    this.d[i] = r;
    this.d[i + 1] = g;
    this.d[i + 2] = b;
    this.d[i + 3] = 255;
  }
  clear(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
  }
  rect(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }
  grid(g, ox, oy, pal = PAL) {
    g.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] !== ".") this.set(ox + c, oy + r, pal[row[c]]);
    });
  }
  // Stepped pixel corners (2 units, then 1), so the panel reads as pixel art
  // rather than a rounded web card, and needs no CSS radius to look finished.
  notchCorners() {
    for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) {
      this.clear(x, y);
      this.clear(this.w - 1 - x, y);
      this.clear(x, this.h - 1 - y);
      this.clear(this.w - 1 - x, this.h - 1 - y);
    }
  }
  // Nearest-neighbour upscale to real pixels: every unit becomes s x s.
  scaled(s) {
    const W = this.w * s;
    const out = Buffer.alloc(W * this.h * s * 4);
    for (let y = 0; y < this.h * s; y++) {
      for (let x = 0; x < W; x++) {
        const si = (Math.floor(y / s) * this.w + Math.floor(x / s)) * 4;
        const di = (y * W + x) * 4;
        out[di] = this.d[si];
        out[di + 1] = this.d[si + 1];
        out[di + 2] = this.d[si + 2];
        out[di + 3] = this.d[si + 3];
      }
    }
    return { data: out, width: W, height: this.h * s };
  }
}

// --- the desk scene ------------------------------------------------------------
//
// A 70 x 28 window onto drawScene's coordinate space, x 47..117, y 14..42:
// chair, agent, desk, keyboard, monitor and mug, with headroom above for the
// wave's sparkles and the sleeping z. Shown at 8 CSS px per unit (560 x 224),
// rendered at 2x for retina.

const SCENE_X = 47;
const SCENE_Y = 14;
const SCENE_W = 70;
const SCENE_H = 28;
const PANEL = "#16131f"; // the night-shift backdrop: the hero's ink, nudged violet
const SEAT_X = 66;
const SEAT_Y = 23;

// Dim stars: the desk works the night shift. Fixed positions, scene units.
const STARS = [[54, 16], [60, 19], [83, 15], [112, 17], [117, 22], [57, 27], [109, 15], [96, 14]];

function scene({ mood, frame }) {
  const p = new Px(SCENE_W, SCENE_H, PANEL);
  const f = (x, y, w, h, color) => p.rect(x - SCENE_X, y - SCENE_Y, w, h, color);
  const g = (gr, x, y, pal) => p.grid(gr, x - SCENE_X, y - SCENE_Y, pal);
  const asleep = mood === "paused";

  for (const [x, y] of STARS) f(x, y, 1, 1, asleep ? "#2a2540" : "#2f2a47");

  // floor (drawScene: 24..144 at y 40, 40..128 at y 41)
  f(24, 40, 120, 1, "#232329");
  f(40, 41, 88, 1, "#17171b");

  // chair
  f(64, 26, 2, 6, "#3a3a42");
  f(66, 32, 12, 2, "#3a3a42");
  f(67, 34, 2, 6, "#2e2e35");
  f(74, 34, 2, 6, "#2e2e35");

  // the agent: breathing bob, blink, the look-at-you face while waving
  let charY = SEAT_Y;
  let body = SIT;
  if (mood === "live") {
    body = frame.blink ? SIT_BLINK : SIT_LOOK;
  } else if (asleep) {
    body = SIT_BLINK;
    charY += frame.breath ? 1 : 0;
  }
  g(body, SEAT_X, charY);
  g(HEADSET, SEAT_X, charY - 1);

  // the wave (drawScene's two arm frames)
  if (mood === "live") {
    const arm = frame.arm === 0
      ? [[65, 29], [64, 28], [63, 27], [62, 26], [61, 25]]
      : [[65, 29], [64, 28], [64, 27], [64, 26], [64, 25]];
    for (const [x, y] of arm) f(x, y, 1, 1, PAL.c);
  }

  // desk
  f(77, 30, 32, 1, "#3a3a42");
  f(77, 31, 32, 1, "#2e2e35");
  f(78, 32, 2, 8, "#2e2e35");
  f(105, 32, 2, 8, "#2e2e35");

  // keyboard
  f(79, 29, 7, 1, "#2e2e35");
  f(80, 29, 1, 1, "#3a3a42");
  f(82, 29, 1, 1, "#3a3a42");
  f(84, 29, 1, 1, "#3a3a42");

  // monitor + the rank chart (finished awake, dimmed asleep)
  f(88, 19, 13, 9, "#26262c");
  f(89, 20, 11, 7, asleep ? "#0d0d11" : "#12121a");
  const bars = [2, 3, 4, 5];
  const xs = [90, 92, 94, 96];
  for (let i = 0; i < 4; i++) f(xs[i], 27 - bars[i], 2, bars[i], asleep ? "#1d3d2b" : "#4ade80");
  if (!asleep && frame.dot) f(98, 21, 1, 1, "#8b5cf6");
  f(93, 28, 3, 2, "#26262c");

  // mug; the steam only while the coffee is hot
  f(103, 27, 2, 3, "#8b5cf6");
  f(105, 28, 1, 1, "#6d3fd8");
  if (!asleep) {
    const a = frame.steam === 0;
    f(a ? 103 : 104, 24, 1, 1, "#4b4b55");
    f(a ? 104 : 103, 22, 1, 1, "#3a3a42");
    f(a ? 103 : 104, 20, 1, 1, "#2e2e35");
  }

  // live: sparkles around the head, twinkling between two sets
  if (mood === "live") {
    const sets = [
      [[60, 18, "#fbbf24"], [81, 17, "#a78bfa"], [57, 23, "#4ade80"]],
      [[61, 16, "#a78bfa"], [83, 20, "#fbbf24"], [58, 21, "#fbbf24"]],
    ];
    for (const [x, y, c] of sets[frame.spark]) {
      f(x, y, 1, 1, c);
      f(x - 1, y, 1, 1, c);
      f(x + 1, y, 1, 1, c);
      f(x, y - 1, 1, 1, c);
      f(x, y + 1, 1, 1, c);
    }
  }

  // asleep: the z drifting up and to the right, fading (drawScene's path)
  if (asleep && frame.z >= 0) {
    const zf = frame.z;
    const zx = 78 + Math.floor(zf / 4);
    const zy = 20 - Math.floor(zf / 2);
    const tone = zf < 5 ? "#a3a3a3" : zf < 10 ? "#6b6b75" : "#3a3a42";
    g(ZED, zx, zy, { z: tone });
  }

  p.notchCorners();
  return p;
}

// --- writers --------------------------------------------------------------------

const SCALE = 16; // 8 CSS px per unit, at 2x

async function png(px, scale, name) {
  const { data, width, height } = px.scaled(scale);
  const file = join(OUT, name);
  await sharp(data, { raw: { width, height, channels: 4 } }).png({ palette: true, compressionLevel: 9 }).toFile(file);
  console.log(`${name}  ${width}x${height}  ${(statSync(file).size / 1024).toFixed(1)} KB`);
}

// Animated GIF. Frame 0 is what Outlook desktop shows forever, so every
// scene's frame 0 is a complete, good still on its own.
async function gif(frames, name) {
  const imgs = frames.map(({ px }) => {
    const { data, width, height } = px.scaled(SCALE);
    return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  });
  const bufs = await Promise.all(imgs);
  const file = join(OUT, name);
  await sharp(bufs, { join: { animated: true } })
    .gif({ delay: frames.map((f) => f.ms), loop: 0, colours: 32, effort: 10, dither: 0, reuse: true })
    .toFile(file);
  console.log(`${name}  ${frames.length} frames  ${(statSync(file).size / 1024).toFixed(1)} KB`);
}

// Live: waves five times, then sits back blinking, sparkles twinkling.
const live = [];
for (let i = 0; i < 10; i++) live.push({ px: scene({ mood: "live", frame: { arm: i % 2, spark: Math.floor(i / 2) % 2, steam: Math.floor(i / 2) % 2, dot: i % 2 === 0 } }), ms: 260 });
live.push({ px: scene({ mood: "live", frame: { arm: 0, spark: 1, steam: 1, dot: true } }), ms: 1800 });
live.push({ px: scene({ mood: "live", frame: { arm: 0, spark: 1, steam: 0, dot: false, blink: true } }), ms: 140 });
live.push({ px: scene({ mood: "live", frame: { arm: 0, spark: 0, steam: 0, dot: true } }), ms: 1600 });

// Paused: asleep at the desk, slow breath, one z drifting up at a time.
const paused = [];
for (let zf = 0; zf < 14; zf += 2) paused.push({ px: scene({ mood: "paused", frame: { z: zf, breath: Math.floor(zf / 6) % 2 === 1 } }), ms: 240 });
paused.push({ px: scene({ mood: "paused", frame: { z: -1, breath: false } }), ms: 900 });
paused.push({ px: scene({ mood: "paused", frame: { z: -1, breath: true } }), ms: 900 });

await gif(live, `desk-live-${ART_VERSION}.gif`);
await gif(paused, `desk-asleep-${ART_VERSION}.gif`);

// The sign-off: card-mascot.tsx's sitting agent, headset on (12 x 12).
const sit = new Px(12, 12);
sit.grid(CARD_LEGS, 0, 10);
sit.grid(CARD_BODY, 0, 1);
sit.grid(CARD_EYES, 0, 1);
sit.grid(CARD_HEADSET, 0, 0);
await png(sit, 8, `dispatcher-${ART_VERSION}.png`); // 96 px: shown at 48
