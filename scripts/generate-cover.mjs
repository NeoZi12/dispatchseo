// Render a blog cover from a Claude-authored subject SVG and save it under
// public/blog/covers/<slug>.webp. Used by hand and by the build-guide agent
// in CI - one command, one image, deterministic output path.
//
//   node scripts/generate-cover.mjs \
//     --slug how-to-build-an-mcp-server \
//     --svg /tmp/mcp-cover-subject.svg \
//     --hue cyan
//
// No env vars, no network. Earlier versions prompted a diffusion model
// (Cloudflare Workers AI SDXL); every technical topic came back as the same
// generic 3D-render metaphor. The agent building the guide already knows
// exactly what the post is about, so it AUTHORS the cover as vector art
// instead of describing it to a weaker model.
//
// Division of labor:
//   - This script owns the house BASE: 1600x900 dark field (site neutral-950),
//     a soft off-center glow in the chosen hue, a faint dot grid, a vignette.
//     That keeps every cover in one family regardless of who authors the
//     subject.
//   - The --svg file is the SUBJECT LAYER: a full <svg> document with
//     viewBox="0 0 1600 900" and a TRANSPARENT background (no full-canvas
//     rects), containing the topic-specific artwork. It is composited over
//     the base.
//   - --icon composites an EXACT official product mark (from ICONS below)
//     on top, centered - vector-drawn logos by hand are banned because they
//     come out subtly wrong; diffusion-drawn ones are banned because they
//     come out very wrong.
//
// Palette per hue - subject layers should draw from the active hue's colors
// (plus white/neutral strokes) so subject and glow agree:
//   violet:  accent #8b5cf6  bright #a78bfa  deep #6d28d9
//   cyan:    accent #06b6d4  bright #22d3ee  deep #0e7490
//   magenta: accent #d946ef  bright #e879f9  deep #a21caf
//   amber:   accent #f59e0b  bright #fbbf24  deep #b45309

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const HUES = {
  violet: { accent: "#8b5cf6", bright: "#a78bfa", deep: "#6d28d9" },
  cyan: { accent: "#06b6d4", bright: "#22d3ee", deep: "#0e7490" },
  magenta: { accent: "#d946ef", bright: "#e879f9", deep: "#a21caf" },
  amber: { accent: "#f59e0b", bright: "#fbbf24", deep: "#b45309" },
};

// Exact official product marks for --icon compositing. Add marks here as
// needed; paths are the official glyphs.
const ICONS = {
  github: {
    viewBox: "0 0 16 16",
    path: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z",
  },
};

const W = 1600;
const H = 900;

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return fallback;
  return process.argv[i + 1];
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const slug = arg("slug");
const svgPath = arg("svg");
const outDir = arg("out", "public/blog/covers");
const hueKey = arg("hue", Object.keys(HUES)[hash(slug ?? "") % 4]);
const iconKey = arg("icon");

if (!slug || !svgPath) {
  console.error(
    "Usage: node scripts/generate-cover.mjs --slug <slug> --svg <subject.svg> " +
      "[--hue violet|cyan|magenta|amber] [--icon github]",
  );
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Bad slug "${slug}" - kebab-case only, it becomes a filename.`);
  process.exit(1);
}
if (!HUES[hueKey]) {
  console.error(`Unknown --hue "${hueKey}". Hues: ${Object.keys(HUES).join(", ")}.`);
  process.exit(1);
}
if (iconKey && !ICONS[iconKey]) {
  console.error(`Unknown --icon "${iconKey}". Available: ${Object.keys(ICONS).join(", ")}`);
  process.exit(1);
}

let subjectSvg;
try {
  subjectSvg = readFileSync(svgPath, "utf8");
} catch {
  console.error(`Cannot read subject SVG at ${svgPath}`);
  process.exit(1);
}
if (!/<svg[\s>]/.test(subjectSvg)) {
  console.error(`${svgPath} does not look like an SVG document.`);
  process.exit(1);
}
if (!subjectSvg.includes(`viewBox="0 0 ${W} ${H}"`)) {
  console.error(`Subject SVG must declare viewBox="0 0 ${W} ${H}" so it maps 1:1 onto the cover.`);
  process.exit(1);
}

const hue = HUES[hueKey];

// The house base. Glow position varies by slug hash so a shelf of covers
// doesn't share one identical light source, but stays in the upper half
// where card crops keep it visible.
const glowX = 300 + (hash(slug) % 1000);
const glowY = 180 + (hash(slug + "y") % 300);
const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${hue.accent}" stop-opacity="0.34"/>
      <stop offset="45%" stop-color="${hue.deep}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${hue.deep}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.72">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.5"/>
    </radialGradient>
    <pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="#ffffff" fill-opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0a0a"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <ellipse cx="${glowX}" cy="${glowY}" rx="820" ry="560" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${slug}.webp`);

const sharp = (await import("sharp")).default;
console.log(`Rendering cover for "${slug}" (hue: ${hueKey})...`);

const base = await sharp(Buffer.from(baseSvg)).png().toBuffer();
const subject = await sharp(Buffer.from(subjectSvg)).resize(W, H, { fit: "contain" }).png().toBuffer();

const layers = [{ input: subject }];
if (iconKey) {
  const { viewBox, path } = ICONS[iconKey];
  const size = 414;
  const iconSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}"><path fill="#fff" d="${path}"/></svg>`,
  );
  layers.push({ input: await sharp(iconSvg).png().toBuffer(), gravity: "center" });
}

await sharp(base).composite(layers).webp({ quality: 82 }).toFile(outPath);

console.log(`Wrote ${outPath}`);
console.log(`Add to the post frontmatter:\n  cover: /blog/covers/${slug}.webp`);
