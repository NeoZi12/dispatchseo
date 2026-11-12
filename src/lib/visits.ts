import { createHash } from "node:crypto";
import { isbot } from "isbot";

import { db } from "./db";

// First-party visit log (migration 0073). Two writers:
//   - the proxy, on every page request, with the session's user id when there
//     is one ("server" rows - the only place a crawler shows up);
//   - the browser beacon (/api/t) once a page's script runs ("beacon" rows -
//     the "a real browser rendered this" signal; crawlers never send one).
// Cookieless by construction: nothing is stored on the device, `visitor` is a
// hash salted per UTC day so it cannot be joined across days, and the IP is
// never written. Nothing here may throw - analytics must not be able to fail
// the page it is watching.

/** server: the proxy saw a request. beacon: a browser ran our script on a page.
 *  engaged: that browser then saw a real mouse move, wheel, tap or key press
 *  (one per page load; every reader filters kind, so these never count as views). */
export type VisitKind = "server" | "beacon" | "engaged";
export type VisitArea = "site" | "app" | "hosted" | "file";

export type VisitInput = {
  kind: VisitKind;
  area: VisitArea;
  url: URL;
  headers: Headers;
  userId?: string | null;
  /** Beacon only: document.referrer. Server rows read the Referer header. */
  referrer?: string | null;
  /** Beacon only: navigator.webdriver was true - Puppeteer, Playwright,
   *  Selenium and friends set it. A bot, whatever its user agent says. */
  automated?: boolean;
};

export const AUTOMATED_BROWSER = "Automated browser";

// Crawler files: counted (they say who is reading the sitemap) but kept out
// of the page-view numbers.
const FILE_PATHS = new Set(["/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt", "/install.sh", "/setup.sh"]);
const ASSET_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|txt|xml|json|woff2?|ttf|otf|mp4|webm|pdf)$/i;

// Public surface, by prefix. Anything else a logged-out visitor cannot reach
// is the dashboard. Mirrors the proxy's allowlist loosely - this only labels
// the row (an unlisted public page would read as "app"), so drift here costs
// a mislabel, never a lost request.
const SITE_PREFIXES = [
  "/blog",
  "/docs",
  "/free-tools",
  "/plans",
  "/pricing",
  "/signup",
  "/login",
  "/onboarding",
  "/qualify",
  "/about",
  "/privacy",
  "/terms",
  "/dpa",
  "/subprocessors",
  "/google-data",
  "/changelog",
  "/forgot-password",
  "/reset-password",
  "/auth/",
  "/claude-code",
  "/codex",
  "/cursor",
  "/setup",
];

/** Which bucket a path belongs to; null means "not a page, don't record". */
export function classifyPath(pathname: string): VisitArea | null {
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || pathname.startsWith("/.well-known/")) return null;
  if (pathname === "/monitoring" || pathname === "/favicon.ico") return null;
  if (FILE_PATHS.has(pathname)) return "file";
  if (ASSET_RE.test(pathname)) return null;
  if (pathname === "/hosted" || pathname.startsWith("/hosted/")) return "hosted";
  if (pathname === "/") return "site";
  if (SITE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"))) return "site";
  return "app";
}

// Named crawlers, most-seen first. The fallback below names anything else
// that calls itself a bot; isbot() decides whether it IS one.
const NAMED: Array<[RegExp, string]> = [
  [/Googlebot|Google-InspectionTool|GoogleOther|Google-Extended/i, "Googlebot"],
  [/AdsBot-Google|Mediapartners-Google/i, "Google Ads"],
  [/bingbot|BingPreview/i, "Bingbot"],
  // AI crawlers. The names are what the owner page groups on (owner-ai.ts):
  // "<x> user" = fetched live because a person asked that assistant something,
  // "<x> search" = indexing for an AI search product, the rest = training.
  [/GPTBot/i, "GPTBot (OpenAI)"],
  [/OAI-SearchBot/i, "OpenAI search"],
  [/ChatGPT-User/i, "ChatGPT user"],
  [/ClaudeBot|anthropic-ai/i, "ClaudeBot"],
  [/Claude-User/i, "Claude user"],
  [/Claude-SearchBot/i, "Claude search"],
  [/PerplexityBot/i, "Perplexity search"],
  [/Perplexity-User/i, "Perplexity user"],
  [/MistralAI-User/i, "Mistral user"],
  [/Meta-ExternalFetcher/i, "Meta AI user"],
  [/YouBot/i, "You.com search"],
  [/ExaBot|ExaSearchBot/i, "Exa search"],
  [/cohere-ai|cohere-training/i, "Cohere"],
  [/Google-CloudVertexBot/i, "Google Vertex AI"],
  [/Applebot/i, "Applebot"],
  [/DuckDuckBot|DuckAssistBot/i, "DuckDuckGo"],
  [/YandexBot|YandexImages/i, "Yandex"],
  [/Baiduspider/i, "Baidu"],
  [/AhrefsBot|AhrefsSiteAudit/i, "Ahrefs"],
  [/SemrushBot/i, "Semrush"],
  [/DataForSeoBot/i, "DataForSEO"],
  [/MJ12bot/i, "Majestic"],
  [/DotBot/i, "Moz"],
  [/PetalBot/i, "PetalBot"],
  [/Bytespider|TikTokSpider/i, "Bytespider (TikTok)"],
  [/Amazonbot/i, "Amazonbot"],
  [/meta-externalagent/i, "Meta AI"],
  [/facebookexternalhit|FacebookBot/i, "Facebook"],
  [/Twitterbot/i, "X / Twitter"],
  [/LinkedInBot/i, "LinkedIn"],
  [/Slackbot|Slack-ImgProxy/i, "Slack"],
  [/Discordbot/i, "Discord"],
  [/TelegramBot/i, "Telegram"],
  [/WhatsApp/i, "WhatsApp"],
  [/CCBot/i, "Common Crawl"],
  [/Diffbot/i, "Diffbot"],
  [/vercel-screenshot|vercel-favicon/i, "Vercel"],
  [/Lighthouse|Chrome-Lighthouse|PageSpeed/i, "Lighthouse"],
  [/HeadlessChrome/i, "Headless Chrome"],
  [/UptimeRobot|Pingdom|StatusCake|BetterUptime|Better Uptime|Uptime-Kuma/i, "Uptime monitor"],
  [/curl\//i, "curl"],
  [/Wget\//i, "wget"],
  [/python-requests|python-httpx|aiohttp|Python-urllib/i, "Python script"],
  [/Go-http-client/i, "Go script"],
  [/node-fetch|undici|axios/i, "Node script"],
  [/okhttp/i, "okhttp"],
];

export function botName(ua: string): string {
  for (const [re, name] of NAMED) if (re.test(ua)) return name;
  const token = /([A-Za-z0-9_.-]*(?:bot|crawler|spider|scraper|fetch|agent|monitor)[A-Za-z0-9_.-]*)/i.exec(ua);
  if (token) return token[1].slice(0, 40);
  const product = /^([A-Za-z][A-Za-z0-9_.-]{1,30})\//.exec(ua);
  return product ? product[1] : "unknown";
}

export function deviceOf(ua: string, bot: boolean): string {
  if (bot) return "bot";
  if (!ua) return "unknown";
  if (/iPad|Tablet|Silk\//i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "";
}

// The server secret every visit hash is salted with: VISITOR_SALT, else
// CRON_SECRET. A blank VISITOR_SALT counts as unset (it falls through to
// CRON_SECRET), never as an empty salt, and with neither set there is no
// secret at all, so recordVisit records nothing rather than hash IPs with a
// value anyone could guess.
function visitSalt(): string | null {
  return process.env.VISITOR_SALT || process.env.CRON_SECRET || null;
}

// A per-day visitor id: the same browser counts once a day, and yesterday's
// id cannot be linked to today's. Salted with a server secret so the hash
// is not a lookup table of IPs.
function visitorHash(h: Headers, ua: string, salt: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${salt}|${day}|${clientIp(h)}|${ua}`).digest("hex").slice(0, 20);
}

// The same, without the user agent: one network on one day, every browser on
// it (migration 0077). Only used to leave the operator's own visits out of
// /owner - their test browser or phone on the same wifi.
function netHash(h: Headers, salt: string): string | null {
  const ip = clientIp(h);
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`net|${salt}|${day}|${ip}`).digest("hex").slice(0, 20);
}

// The referring site, host only (a referrer's path can carry a search term
// or a private URL). Our own host is navigation, not a referral.
function referrerHost(raw: string | null | undefined, ownHost: string): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === ownHost.replace(/^www\./, "")) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** The free plan's "Made with DispatchSEO" credit links here with
 *  `?ref=<site>` or `?ref=<site>/<article id>` (hosted-blog.ts creditHref).
 *  Stored in the utm columns - source = the site, medium = "badge",
 *  campaign = the article id - so it needs no migration and every reader of
 *  those columns already carries it; /owner (owner-visitors.ts) reads the
 *  medium back as its own channel. A real utm_source on the same link wins. */
export const BADGE_MEDIUM = "badge";
const ARTICLE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function badgeRef(raw: string | null | undefined): { site: string; articleId: string | null } | null {
  const ref = raw?.trim();
  if (!ref) return null;
  const cut = ref.lastIndexOf("/");
  const tail = cut >= 0 ? ref.slice(cut + 1) : "";
  const articleId = ARTICLE_ID_RE.test(tail) ? tail.toLowerCase() : null;
  const site = (articleId ? ref.slice(0, cut) : ref).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  if (!site || site.length > 80 || !/^[a-z0-9.-]+(?::\d+)?(\/[^\s?#]*)?$/.test(site)) return null;
  return { site, articleId };
}

/** Ad platforms add a click id to the landing URL. Stored like the badge, in
 *  the utm columns under this medium, so a visit with no referrer and no tag
 *  still says it was an ad (or a Facebook link). A real utm_source wins. */
export const CLICK_ID_MEDIUM = "click-id";
const CLICK_IDS: Array<[string, string]> = [
  ["gclid", "Google Ads"],
  ["gbraid", "Google Ads"],
  ["wbraid", "Google Ads"],
  ["msclkid", "Microsoft Ads"],
  ["fbclid", "facebook.com"],
];
function clickIdSource(p: URLSearchParams): string | null {
  for (const [key, source] of CLICK_IDS) if (p.get(key)) return source;
  return null;
}

function hostedKey(pathname: string): string | null {
  const m = /^\/hosted\/([^/]+)/.exec(pathname);
  return m ? m[1].slice(0, 80) : null;
}

// Local `pnpm dev` talks to the production database, so a developer's own
// page loads would land in the live visit count. Record only where real
// visitors are: a production build (Vercel, the docker stack) - or a dev run
// that asks for it (VISITS_RECORD=1).
export function visitsEnabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VISITS_RECORD === "1";
}

export async function recordVisit(input: VisitInput): Promise<void> {
  if (!visitsEnabled()) return;
  const salt = visitSalt();
  if (!salt) return;
  try {
    const h = input.headers;
    const ua = (h.get("user-agent") ?? "").slice(0, 256);
    // A beacon came from a script that ran; crawlers executing JS are rare
    // enough that the UA still decides, so an automated headless browser
    // that announces itself stays a bot in both kinds.
    const bot = input.automated ? true : ua ? isbot(ua) : input.kind === "server";
    const p = input.url.searchParams;
    const ownHost = h.get("host") ?? input.url.host;
    // Our own pages only (a hosted customer page never carries our ref), and
    // never over a real tag on the same link.
    const badge = input.area === "site" && !p.get("utm_source") ? badgeRef(p.get("ref")) : null;
    const clicked = input.area === "site" && !p.get("utm_source") && !badge ? clickIdSource(p) : null;
    const row = {
      kind: input.kind,
      area: input.area,
      path: input.url.pathname.slice(0, 512),
      referrer: referrerHost(input.kind === "server" ? h.get("referer") : input.referrer, ownHost),
      ua: ua || null,
      bot,
      bot_name: input.automated ? AUTOMATED_BROWSER : bot ? botName(ua) : null,
      device: deviceOf(ua, bot),
      country: (h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null)?.toUpperCase().slice(0, 2) ?? null,
      visitor: visitorHash(h, ua, salt),
      net: netHash(h, salt),
      user_id: input.userId ?? null,
      hosted_key: input.area === "hosted" ? hostedKey(input.url.pathname) : null,
      utm_source: p.get("utm_source")?.slice(0, 80) || badge?.site || clicked || null,
      utm_medium: badge ? BADGE_MEDIUM : clicked ? CLICK_ID_MEDIUM : p.get("utm_medium")?.slice(0, 80) || null,
      utm_campaign: p.get("utm_campaign")?.slice(0, 120) || badge?.articleId || null,
    };
    const { error } = await db().from("web_visits").insert(row);
    // Before 0077 is applied the column does not exist: keep the visit.
    if (error && /\bnet\b/.test(error.message)) {
      const { net: _net, ...rest } = row;
      await db().from("web_visits").insert(rest);
    }
  } catch {
    // Never. See the header comment.
  }
}
