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
const COMPOSITIONS = {
  hero: "one large focal object centered, generous empty dark space around it, dramatic rim light, shallow depth of field",
  diorama: "isometric miniature diorama scene viewed from a high angle, tiny detailed machinery",
  flow: "wide horizontal composition with strong left-to-right motion, side elevation view",
  abstract: "abstract floating geometric structures, strong silhouettes, deep perspective",
};
const HUES = {
  violet: "glowing violet and purple neon accents",
  cyan: "glowing teal and cyan neon accents",
  magenta: "glowing magenta and hot pink neon accents",
  amber: "glowing amber and orange neon accents against cool shadows",
};
const STYLE =
  "deep charcoal black background, cinematic lighting, sharp focus, high detail 3D digital art";
// "logo" is deliberately NOT banned: topical marks (a git branch glyph, an
// octocat silhouette, a plug icon) are what make a cover read as being ABOUT
// the post - the subject should name them explicitly.
const NEGATIVE =
  "text, words, letters, typography, watermark, signature, low quality, " +
  "blurry, photo, photograph, human faces";

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
  await sharp(raw).resize(1600, 900, { fit: "cover" }).webp({ quality: 82 }).toFile(outPath);
} catch {
  // sharp unavailable - keep the raw image rather than failing the run, but
  // say so: committed PNGs at this size bloat the repo.
  outPath = join(outDir, `${slug}.png`);
  writeFileSync(outPath, raw);
  console.warn("sharp not installed - wrote raw PNG. `pnpm add -D sharp` for small webp covers.");
}

console.log(`Wrote ${outPath}`);
console.log(`Add to the post frontmatter:\n  cover: /blog/covers/${slug}.${outPath.endsWith(".webp") ? "webp" : "png"}`);
