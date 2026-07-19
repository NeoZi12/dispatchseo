// Generate a blog cover image via Cloudflare Workers AI (free tier) and save
// it under public/blog/covers/<slug>.webp. Used by hand and by the build-guide
// agent in CI - one command, one image, deterministic output path.
//
//   node --env-file=.env.local scripts/generate-cover.mjs \
//     --slug how-to-build-an-mcp-server \
//     --subject "a glowing server rack exchanging JSON messages with an AI agent"
//
// Env: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (API token with Workers AI
// permission). Free tier: 10,000 neurons/day - orders of magnitude above the
// pipeline's ~5 images/week.
//
// Model: SDXL base 1.0 (@cf/stabilityai/stable-diffusion-xl-base-1.0), the
// Cloudflare image model that honors width/height, so covers are native 16:9.
// (FLUX-schnell on Workers AI ignores size params and always returns a square.)
// Output is converted to webp via sharp when available; falls back to writing
// the raw PNG with a size warning if sharp is missing.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// The house art direction keeps covers in one family (dark field, neon
// accents, no text) while COMPOSITION and LIGHT HUE rotate per post so
// neighboring covers never read as the same image. The subject comes FIRST
// in the prompt - SDXL weights early tokens hardest, and a style-first
// prompt is exactly what made every cover converge into the same isometric
// purple clutter.
// Art direction: clean 3D PRODUCT ILLUSTRATION (the Postiz-blog look) - one
// clear concept per cover, few elements, readable at card size. Explicitly
// NOT cinematic renders: the earlier "neon factory / creature" direction
// produced generic AI-art clutter.
const COMPOSITIONS = {
  hero: "one large centered object, generous empty space around it, simple composition",
  spread: "a small set of floating elements arranged in a loose grid, evenly spaced",
  flow: "elements flowing left to right in a clear sequence connected by a single line",
  burst: "elements radiating from one central object, symmetrical composition",
};
const HUES = {
  violet: "violet and purple as the dominant accent colors",
  cyan: "teal and cyan as the dominant accent colors",
  magenta: "magenta and pink as the dominant accent colors",
  amber: "warm orange and amber as the dominant accent colors",
};
// Art direction: DARK, MINIMAL, CLEAN. One simple subject, lots of calm
// dark space, subtle glow - premium tech aesthetic that sits naturally on
// the neutral-950 site. No mascots, no characters, no cartoon anything
// (owner's explicit rule), no busy cinematic scenes.
const STYLE =
  "minimal clean 3D render, dark charcoal background, soft studio lighting, " +
  "simple composition with generous empty space, subtle glow, premium tech aesthetic";
// "logo" is deliberately NOT banned: a real, recognizable mark (composited
// via --icon, or a simple glyph the subject names) is what makes a cover
// read as being ABOUT the post.
const NEGATIVE =
  "text, words, letters, typography, watermark, signature, low quality, blurry, " +
  "photo, photograph, human faces, cluttered, busy, cinematic, " +
  "cartoon, cute, mascot, character, creature, animal, octopus, tentacles, toy, " +
  "horror, grunge, machinery clutter, industrial pipes";

// Optional crisp icon composite (--icon github): AI models mangle real
// logos, so recognizable marks are overlaid EXACTLY, centered, after
// generation. Add marks here as needed; paths are the official glyphs.
const ICONS = {
  github: {
    viewBox: "0 0 16 16",
    path: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z",
  },
};

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
const subject = arg("subject");
const outDir = arg("out", "public/blog/covers");
// Composition + hue default from the slug hash (stable, spreads across the
// catalogue) and can be forced with --style / --hue to differ from recent
// covers - the playbook's COVER step tells the agent to check what the last
// two posts used and pick something else.
const styleKey = arg("style", Object.keys(COMPOSITIONS)[hash(slug) % 4]);
const hueKey = arg("hue", Object.keys(HUES)[hash(slug + "hue") % 4]);
const iconKey = arg("icon");
if (iconKey && !ICONS[iconKey]) {
  console.error(`Unknown --icon "${iconKey}". Available: ${Object.keys(ICONS).join(", ")}`);
  process.exit(1);
}
if (!slug || !subject) {
  console.error(
    'Usage: node scripts/generate-cover.mjs --slug <slug> --subject "<visual scene>" ' +
      "[--style hero|diorama|flow|abstract] [--hue violet|cyan|magenta|amber]",
  );
  process.exit(1);
}
if (!COMPOSITIONS[styleKey] || !HUES[hueKey]) {
  console.error(
    `Unknown --style "${styleKey}" or --hue "${hueKey}". Styles: ${Object.keys(COMPOSITIONS).join(", ")}. Hues: ${Object.keys(HUES).join(", ")}.`,
  );
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Bad slug "${slug}" - kebab-case only, it becomes a filename.`);
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !token) {
  console.error(
    "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing. Create a free " +
      "Cloudflare account, then an API token with the Workers AI permission, " +
      "and set both (locally in .env.local, in CI as repo secrets).",
  );
  process.exit(1);
}

const MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const prompt = `${subject}, ${COMPOSITIONS[styleKey]}, ${HUES[hueKey]}, ${STYLE}`;

console.log(`Generating cover for "${slug}" (style: ${styleKey}, hue: ${hueKey})...`);
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      negative_prompt: NEGATIVE,
      width: 1600,
      height: 896, // multiples of 64; displayed in 16:9 frames
      num_steps: 20,
      guidance: 7.5,
    }),
  },
);

if (!res.ok) {
  console.error(`Cloudflare AI returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}

// SDXL streams the image binary; some Workers AI models answer JSON with a
// base64 field instead. Handle both so a model swap doesn't break the script.
const contentType = res.headers.get("content-type") ?? "";
let raw;
if (contentType.includes("application/json")) {
  const body = await res.json();
  const b64 = body?.result?.image;
  if (!b64) {
    console.error(`Unexpected JSON response: ${JSON.stringify(body).slice(0, 300)}`);
    process.exit(1);
  }
  raw = Buffer.from(b64, "base64");
} else {
  raw = Buffer.from(await res.arrayBuffer());
}

mkdirSync(outDir, { recursive: true });

let outPath;
try {
  const sharp = (await import("sharp")).default;
  outPath = join(outDir, `${slug}.webp`);
  let img = sharp(raw).resize(1600, 900, { fit: "cover" });
  if (iconKey) {
    // Center the exact mark, white, at ~46% of cover height.
    const { viewBox, path } = ICONS[iconKey];
    const size = 414;
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}"><path fill="#fff" d="${path}"/></svg>`,
    );
    const icon = await sharp(svg).png().toBuffer();
    img = sharp(await img.toBuffer()).composite([{ input: icon, gravity: "center" }]);
  }
  await img.webp({ quality: 82 }).toFile(outPath);
} catch {
  // sharp unavailable - keep the raw image rather than failing the run, but
  // say so: committed PNGs at this size bloat the repo.
  outPath = join(outDir, `${slug}.png`);
  writeFileSync(outPath, raw);
  console.warn("sharp not installed - wrote raw PNG. `pnpm add -D sharp` for small webp covers.");
}

console.log(`Wrote ${outPath}`);
console.log(`Add to the post frontmatter:\n  cover: /blog/covers/${slug}.${outPath.endsWith(".webp") ? "webp" : "png"}`);
