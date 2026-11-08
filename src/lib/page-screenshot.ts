import "server-only";
import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { isPrivateHost } from "@/lib/url-guard";
import { fetchPage } from "@/lib/writer/fetch";

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
// Taking one costs 3-30 seconds, so it is taken ONCE and kept in
// page_screenshots (0071): when the article publishes (job-handlers), and in
// the background for any live article the dashboard lists without one
// (warmScreenshots, from after()). The article page then shows the stored
// picture through /api/preview and never waits on a browser (owner,
// 2026-11-05: "cache each article's preview when we create it"). A row older
// than 30 days is re-taken in the background; the old one shows until then.
//
// Before 0071 is applied the table read errors, and the preview falls back to
// taking the shot during the page view, cached a week per URL in Next's data
// cache (the original behaviour). A failure is never stored or cached, and is
// remembered in memory for ten minutes so a dead provider does not cost every
// view a round trip. When both providers fail the preview falls back to the
// page's own share image.

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

/** A public http(s) URL a remote browser may be sent to, or null. */
function shootable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

function noteFailure(url: string, e: unknown) {
  if (failedAt.size > 200) failedAt.clear();
  failedAt.set(url, Date.now());
  console.warn(`[preview] screenshot of ${url} not taken: ${e instanceof Error ? e.message : String(e)}`);
}

const recentlyFailed = (url: string) => {
  const failed = failedAt.get(url);
  return failed != null && Date.now() - failed < FAIL_TTL_MS;
};

/** The page as a base64 JPEG (1280x800), or null when it cannot be taken.
 *  Not stored: the fallback for a database without page_screenshots. */
export async function pageScreenshot(url: string): Promise<string | null> {
  if (!shootable(url) || recentlyFailed(url)) return null;
  try {
    return await unstable_cache(() => capture(url), ["page-screenshot", url], { revalidate: WEEK_S })();
  } catch (e) {
    noteFailure(url, e);
    return null;
  }
}

/** A stored screenshot older than this is re-taken in the background. */
const REFRESH_MS = 30 * 86_400_000;

/** When the stored screenshot of `url` was taken: an ISO time, null when
 *  none is stored, undefined when the table isn't there (0071 not applied). */
export async function storedShotAt(projectId: string, url: string): Promise<string | null | undefined> {
  const { data, error } = await db().from("page_screenshots").select("taken_at").eq("project_id", projectId).eq("url", url).maybeSingle();
  if (error) return undefined;
  return (data as { taken_at: string } | null)?.taken_at ?? null;
}

/** The stored screenshot itself, for /api/preview. */
export async function storedShot(projectId: string, url: string): Promise<{ image: string; takenAt: string } | null> {
  const { data, error } = await db().from("page_screenshots").select("image, taken_at").eq("project_id", projectId).eq("url", url).maybeSingle();
  if (error || !data) return null;
  const row = data as { image: string; taken_at: string };
  return { image: row.image, takenAt: row.taken_at };
}

/** Where the article page loads a stored screenshot from. `v` changes when
 *  the shot is re-taken, so the browser may keep each version for good. */
export function previewSrc(projectId: string, url: string, takenAt: string): string {
  return `/api/preview/${projectId}?u=${encodeURIComponent(url)}&v=${Date.parse(takenAt) || 0}`;
}

// One capture per URL at a time on this instance: a page view and a
// background warm-up asking at once share the same browser trip.
const inFlight = new Map<string, Promise<string | null>>();

/** Take the screenshot now and store it. Base64 JPEG, or null when it
 *  could not be taken (never stored, never thrown). A failed write still
 *  returns the picture: the page that asked can show it. */
export function takeAndStore(projectId: string, url: string): Promise<string | null> {
  if (!shootable(url) || recentlyFailed(url)) return Promise.resolve(null);
  const key = `${projectId} ${url}`;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    let image: string;
    try {
      // Kept for a month, so never a picture of "page not found": a page
      // that isn't up yet (a deploy still running) is tried again later.
      // Other refusals (a 403 for our server's address) say nothing about
      // what a browser sees, so they don't stop the shot.
      const probe = await fetchPage(url, { timeoutMs: 10_000 });
      if (!probe.ok && probe.reason === "blocked-status" && (probe.detail === "404" || probe.detail === "410")) {
        throw new Error(`the page answers ${probe.detail}`);
      }
      image = await capture(url);
    } catch (e) {
      noteFailure(url, e);
      return null;
    }
    const { error } = await db()
      .from("page_screenshots")
      .upsert({ project_id: projectId, url, image, taken_at: new Date().toISOString() }, { onConflict: "project_id,url" });
    if (error) console.warn(`[preview] screenshot of ${url} taken but not stored: ${error.message}`);
    return image;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/** Make sure the given live pages have a stored screenshot: takes the
 *  missing (and month-old) ones, newest-listed first, one at a time, at
 *  most `limit` per call. For after() and the publish handlers - it never
 *  throws, and returns how many it took. */
export async function warmScreenshots(projectId: string, urls: string[], limit = 4): Promise<number> {
  try {
    const wanted = [...new Set(urls.filter(shootable))];
    if (!wanted.length) return 0;
    const { data, error } = await db().from("page_screenshots").select("url, taken_at").eq("project_id", projectId).in("url", wanted);
    if (error) return 0; // 0071 not applied: nothing to store into
    const fresh = new Set(
      ((data ?? []) as Array<{ url: string; taken_at: string }>).filter((r) => Date.now() - Date.parse(r.taken_at) < REFRESH_MS).map((r) => r.url),
    );
    // At most `limit` tries, not successes: a provider that's down must not
    // walk the whole list at 30 seconds a URL.
    const todo = wanted.filter((u) => !fresh.has(u) && !recentlyFailed(u)).slice(0, limit);
    let taken = 0;
    for (const url of todo) if (await takeAndStore(projectId, url)) taken++;
    return taken;
  } catch (e) {
    console.warn(`[preview] warm-up stopped: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

/** warmScreenshots after the response is sent (or, outside a request -
 *  a script - right away without waiting). For publish handlers and pages:
 *  never throws, never delays the caller. */
// Home and Articles call this on every view (onView). Once an instance has
// warmed a project from a view it waits this long before looking again: the
// stored-shot read and the provider calls behind it are the same work each
// time. Publish-time callers (the publish and verify job handlers) never
// throttle: a just-published article's first screenshot must not be skipped
// because someone opened Home a minute earlier.
const WARM_EVERY_MS = 10 * 60_000;
const warmedAt = new Map<string, number>();

export function warmScreenshotsLater(projectId: string, urls: string[], limit = 4, opts: { onView?: boolean } = {}): void {
  if (!urls.length) return;
  if (opts.onView) {
    const last = warmedAt.get(projectId);
    if (last && Date.now() - last < WARM_EVERY_MS) return;
    warmedAt.set(projectId, Date.now());
  }
  try {
    after(() => warmScreenshots(projectId, urls, limit));
  } catch {
    void warmScreenshots(projectId, urls, limit);
  }
}
