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

// The house art direction - every cover reads as one family. The per-post
// --subject slots into the middle; style and palette stay fixed so the blog
// index looks designed, not stock. Mirrors the site theme: near-black field,
// violet/purple accents.
const STYLE_PREFIX =
  "Dark isometric 3D tech illustration, deep charcoal black background, " +
  "glowing violet and purple neon accents, soft cyan rim light, ";
const STYLE_SUFFIX =
  ", floating translucent UI panels, subtle dot grid floor, cinematic " +
  "lighting, sharp focus, high detail digital art";
const NEGATIVE =
  "text, words, letters, typography, watermark, logo, signature, low quality, " +
  "blurry, photo, photograph, human faces";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return fallback;
  return process.argv[i + 1];
}

const slug = arg("slug");
const subject = arg("subject");
const outDir = arg("out", "public/blog/covers");
if (!slug || !subject) {
  console.error(
    'Usage: node scripts/generate-cover.mjs --slug <slug> --subject "<visual subject>"',
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
const prompt = `${STYLE_PREFIX}${subject}${STYLE_SUFFIX}`;

console.log(`Generating cover for "${slug}"...`);
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
