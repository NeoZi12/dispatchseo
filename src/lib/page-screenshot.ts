import "server-only";
import { unstable_cache } from "next/cache";
import { isPrivateHost } from "@/lib/url-guard";

// A screenshot of a live article - what the owner sees when they open it -
// for the article detail screen's preview (owner, 2026-11-05: "a picture of
// the article itself, the title and a bit of the cover, like a screenshot").
//
// Taken by a real browser somewhere else, never on our server, so a customer
// URL cannot reach anything of ours:
//   1. Cloudflare Browser Rendering's REST screenshot endpoint, when
//      CLOUDFLARE_ACCOUNT_ID and a token with "Browser Rendering - Edit"
//      (CLOUDFLARE_BROWSER_TOKEN, or CLOUDFLARE_API_TOKEN when it carries the
//      permission) are set: ~3 s a page, cents a month at this volume.
//   2. Microlink's screenshot API otherwise: free without a key (a small
//      daily allowance per server IP), or MICROLINK_API_KEY for the paid tier.
// Cached a week per URL in Next's data cache; a failure is thrown inside the
// cached function so it is never cached, and remembered in memory for ten
// minutes so a dead provider does not cost every view a round trip. When both
// fail the preview falls back to the page's own share image.

const WEEK_S = 7 * 86_400;
const FAIL_TTL_MS = 10 * 60_000;
const failedAt = new Map<string, number>();

function creds(): { account: string; token: string } | null {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = (process.env.CLOUDFLARE_BROWSER_TOKEN || process.env.CLOUDFLARE_API_TOKEN)?.trim();
  return account && token ? { account, token } : null;
}

const VIEW = { width: 1280, height: 800 };

/** Cloudflare's headless Chromium, when this deploy has a token for it. */
async function viaCloudflare(url: string, c: { account: string; token: string }): Promise<Buffer> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${c.account}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      // A laptop's view: the site header, the title and the top of the cover.
      viewport: VIEW,
      screenshotOptions: { type: "jpeg", quality: 72 },
      gotoOptions: { waitUntil: "networkidle2", timeout: 20_000 },
    }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
    throw new Error(`Cloudflare screenshot ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Microlink: the same picture, keyless on its free tier. `embed` makes it
 *  answer with the image itself instead of JSON pointing at it. */
async function viaMicrolink(url: string): Promise<Buffer> {
  const key = process.env.MICROLINK_API_KEY?.trim();
  const q = new URLSearchParams({
    url,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    type: "jpeg",
    waitUntil: "networkidle2",
    "viewport.width": String(VIEW.width),
    "viewport.height": String(VIEW.height),
    "viewport.deviceScaleFactor": "1",
  });
  const res = await fetch(`https://${key ? "pro" : "api"}.microlink.io/?${q}`, {
    headers: key ? { "x-api-key": key } : undefined,
    signal: AbortSignal.timeout(40_000),
    cache: "no-store",
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
    throw new Error(`Microlink screenshot ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function capture(url: string): Promise<string> {
  const c = creds();
  let img: Buffer | null = null;
  if (c) {
    try {
      img = await viaCloudflare(url, c);
    } catch (e) {
      console.warn(`[preview] ${e instanceof Error ? e.message : String(e)}; trying Microlink`);
    }
  }
  img ??= await viaMicrolink(url);
  // A blank or error page comes back tiny; a real article never does.
  if (img.length < 8_000) throw new Error(`screenshot of ${url} came back empty (${img.length} bytes)`);
  return img.toString("base64");
}

/** The page as a base64 JPEG (1280x800), or null when it cannot be taken. */
export async function pageScreenshot(url: string): Promise<string | null> {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname;
  } catch {
    return null;
  }
  if (isPrivateHost(host)) return null;
  const failed = failedAt.get(url);
  if (failed && Date.now() - failed < FAIL_TTL_MS) return null;
  try {
    return await unstable_cache(() => capture(url), ["page-screenshot", url], { revalidate: WEEK_S })();
  } catch (e) {
    if (failedAt.size > 200) failedAt.clear();
    failedAt.set(url, Date.now());
    console.warn(`[preview] screenshot of ${url} not taken: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
