import { isPrivateHost, isProjectUrl, fetchProjectUrl } from "./url-guard";

// WHY THIS EXISTS
//
// DispatchSEO is moving to a model where the customer's own AI (Claude,
// ChatGPT, whatever coding agent they run) does the researching and writing,
// and this server does everything a chat app cannot. A chat app cannot crawl
// 150 pages of a site and it should never try - the measured cost driver in
// our OLD pipeline was exactly this shape of problem: an agent re-reading a
// quarter-million-token context on every run, over and over, just to remind
// itself what the site already says. So the split is: WE crawl (bounded,
// server-side, once), THEIR AI reads a small digest instead of the site. This
// module is the crawl half - discovery, extraction, and the digest builder.
// It also serves an owner whose site was built by someone else and who
// cannot describe its structure to us themselves.
//
// SAFETY: every fetch here targets a URL a customer typed into a signup form.
// `fetchProjectUrl` (url-guard.ts) is the load-bearing guard - it re-checks
// `isPrivateHost` on EVERY redirect hop rather than trusting the first one,
// which is the whole point: a domain that is public today can 302 to
// 169.254.169.254 or an internal hostname tomorrow, and a naive
// `redirect: "follow"` would hand this server to whoever controls that first
// response. Every fetch in this file goes through it. The one exception is
// robots.txt / sitemap URLs discovered on a THIRD-PARTY sitemap host
// (unusual, but real - CDN-hosted sitemaps exist) - those are silently
// skipped rather than fetched, because `fetchProjectUrl` requires the target
// stay on the project's own domain and that restriction is correct here too.
//
// EXTRACTION METHOD: hand-written regular expressions, not a real HTML
// parser. This is a deliberate, commented trade-off, not an oversight -
// `node-html-parser` is available in principle but adding it (or anything
// else) to this module was explicitly out of scope for this pass. If
// extraction quality ever bites in practice (nested/malformed markup regex
// can't see through), swapping the extraction functions below for
// `node-html-parser` is the intended upgrade path; the regexes are isolated
// on purpose so that swap touches only this file.
//
// THIS RUNS DURING SIGNUP AND SETUP. It must never throw. A site that blocks
// us, has no sitemap, times out, or returns garbage comes back as
// `ok: false` with a named, plain-English note - never a crash, and never a
// silent empty result with no explanation (see CLAUDE.md's "no silent
// failures" rule).

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type Heading = { level: 2 | 3; text: string };

export type CrawledPage = {
  url: string;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  canonical: string | null;
  lang: string | null;
  headings: Heading[];
  /** First ~600 characters of body text, markup stripped. Empty string when
   *  the page was never read as HTML (the WordPress fast path skips this on
   *  purpose - see tryWordPressFastPath). */
  bodyText: string;
  /** Rough word count of the FULL stripped body text, not just the sample
   *  above. 0 when the page was never read as HTML. */
  wordCount: number;
  publishedDate: string | null;
  modifiedDate: string | null;
  /** Same-origin links found on this page, normalized. Populated only for
   *  pages we actually read as HTML - the WordPress fast path leaves this
   *  empty because it never sees the markup. */
  internalLinks: string[];
  /** Category names when known (WordPress fast path resolves ids to names).
   *  Always empty for HTML-crawled pages - we don't guess categories from
   *  markup. */
  categories: string[];
  source: "html" | "wp-rest";
};

export type SiteDigest = {
  totalPages: number;
  averageWordCount: number;
  /** ISO timestamps, or null when no page carried a discoverable date. */
  newestDate: string | null;
  oldestDate: string | null;
  /** Top-level URL path segments (the site's apparent sections), most
   *  common first. */
  topSections: { path: string; count: number }[];
  /** Known category names, deduped, alphabetical. */
  categories: string[];
  /** Pages other pages on the site link to most, by internal link count -
   *  a cheap proxy for "what this site itself treats as important". */
  mostLinkedPages: { url: string; title: string | null; inboundLinks: number }[];
  /** A small, deterministically-chosen sample of page titles, spread evenly
   *  across the crawl rather than just "the first N we happened to fetch". */
  sampleTitles: string[];
  /** True if any list above had to be shortened to fit the character budget. */
  truncated: boolean;
  charBudget: number;
  charLength: number;
};

export type CrawlOptions = {
  /** The folder the site lives in on its host ("/tanstack-fetch" for a
   *  GitHub Pages project site; site-root.ts). The crawl starts there and
   *  never leaves it - the rest of the host is somebody else's. */
  basePath?: string;
  /** Total pages to read across the whole crawl. Default 150. */
  maxPages?: number;
  /** Depth cap for the breadth-first fallback only (sitemap and WordPress
   *  paths don't have a "depth"). Default 4. */
  maxDepth?: number;
  /** Concurrent in-flight requests. Default 4 - polite, not a hammer. */
  concurrency?: number;
  /** Per-request timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** Caller already knows the platform (e.g. from detectPlatform in
   *  site-platform.ts). true = try the WordPress fast path FIRST; false =
   *  never try it; undefined = probe once and use it if it answers.
   *  Note that true is a preference, not a restriction: a WordPress site whose
   *  REST API is blocked by a security plugin still falls through to the
   *  sitemap and then the link crawl, because the owner wants their pages
   *  read, not a lecture about which door we came through. */
  isWordPress?: boolean;
};

export type CrawlResult = {
  ok: boolean;
  pages: CrawledPage[];
  digest: SiteDigest;
  stats: {
    fetched: number;
    skipped: number;
    errors: number;
    durationMs: number;
    source: "wp-rest" | "sitemap" | "bfs";
  };
  /** Plain-English observations for the site owner - never silent
   *  truncation. E.g. "your sitemap lists 400 pages, we read the first 150". */
  notes: string[];
};

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const DEFAULT_MAX_PAGES = 150;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 8000;

/** Mirrors MAX_BYTES in site-platform.ts - a page (or a JSON listing, or a
 *  sitemap file) is read up to this many bytes and no further, so a
 *  pathological response can't be read whole into memory. */
const MAX_BODY_BYTES = 400_000;

const BODY_SAMPLE_CHARS = 600;
const MAX_INTERNAL_LINKS_PER_PAGE = 200;
const MAX_SITEMAP_CHILD_SITEMAPS = 50;
/** per_page=100 * this many pages = a hard ceiling on WordPress pagination,
 *  independent of what X-WP-TotalPages claims - a header is just another
 *  response we should not trust blindly. */
const MAX_WP_PAGINATION_PAGES = 10;
/** Target: comfortably under 2000 tokens once JSON.stringify'd. English text
 *  runs roughly 4 characters/token, so 6000 chars leaves real headroom. */
const DIGEST_CHAR_BUDGET = 6000;

const UA = "Mozilla/5.0 (compatible; DispatchSEOBot/1.0; +https://dispatchseo.com/docs/site-check)";
/** The token we look for in a robots.txt User-agent line before falling back
 *  to the "*" group. Lowercase - robots.txt matching is case-insensitive by
 *  convention and we lowercase every agent name we parse. */
const ROBOTS_BOT_TOKEN = "dispatchseobot";

const SKIP_EXT = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".bmp",
  ".zip", ".rar", ".7z", ".gz", ".tar",
  ".mp3", ".mp4", ".mov", ".avi", ".wav", ".ogg",
  ".css", ".js", ".mjs", ".json", ".xml", ".txt", ".csv",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
]);

/** Path shapes that are real URLs but never content: feeds, the REST API and
 *  admin surfaces, archive listings that just re-list content we already
 *  read once at its real URL, and WordPress's own pagination URLs. */
const SKIP_PATH_RE: RegExp[] = [
  /\/feed\/?$/i,
  /\/comments\/feed\/?$/i,
  /\/wp-json(\/|$)/i,
  /\/wp-admin(\/|$)/i,
  /\/wp-login\.php$/i,
  /\/(tag|author)\//i,
  /\/page\/\d+\/?$/i,
];

// --------------------------------------------------------------------------
// Small shared helpers
// --------------------------------------------------------------------------

/** Read at most `maxBytes` of a response body as text. Mirrors readCapped in
 *  site-platform.ts on purpose - same reasoning (a huge page must not be
 *  read into memory whole), reimplemented here because that one is private
 *  to its module and this file needs its own copy either way (JSON bodies
 *  here, HTML there, same cap logic). */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) return await res.text().catch(() => "");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= maxBytes) break;
      }
    }
  } catch {
    // Partial body is still worth using.
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
  const cap = Math.min(total, maxBytes);
  const merged = new Uint8Array(cap);
  let at = 0;
  for (const c of chunks) {
    const room = cap - at;
    if (room <= 0) break;
    merged.set(c.subarray(0, Math.min(c.length, room)), at);
    at += Math.min(c.length, room);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** A handful of named entities plus the full numeric range (decimal and hex)
 *  - WordPress in particular encodes titles as numeric entities
 *  ("&#8217;" for a right single quote) so the numeric branch carries most
 *  of the real work. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  copy: "©", reg: "®", trade: "™",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const isHex = ent[1] === "x" || ent[1] === "X";
      const code = isHex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

/** Strip a URL down to the form we dedupe on: no fragment, no utm_ or
 *  fbclid tracking params, no trailing slash (except the bare root).
 *  Returns null for anything that isn't a well-formed http(s) URL. */
function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  const params = new URLSearchParams(u.search);
  for (const key of Array.from(params.keys())) {
    if (/^utm_/i.test(key) || key.toLowerCase() === "fbclid") params.delete(key);
  }
  const qs = params.toString();
  u.search = qs ? `?${qs}` : "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

function isSkippableUrl(normUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(normUrl);
  } catch {
    return true;
  }
  const path = u.pathname.toLowerCase();
  const last = path.slice(path.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  if (dot > -1 && SKIP_EXT.has(last.slice(dot))) return true;
  return SKIP_PATH_RE.some((re) => re.test(path));
}

function pathAndQuery(normUrl: string): string {
  try {
    const u = new URL(normUrl);
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

/** A bounded-concurrency worker pool with no dependency beyond Promise.all -
 *  every task pulls the next item off a shared cursor rather than being
 *  pre-sliced into batches, so a slow item doesn't stall its whole batch. */
async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// --------------------------------------------------------------------------
// robots.txt
// --------------------------------------------------------------------------

type RobotsRules = { sitemaps: string[]; disallow: string[]; allow: string[] };

/** A deliberately small robots.txt parser: group directives by the
 *  User-agent block(s) they follow, pick the block that names us (or "*" if
 *  none does), and return its Disallow/Allow paths plus every Sitemap: line
 *  in the file (those are global, not scoped to a user-agent block per the
 *  spec). Comments (#...) and blank lines are ignored; anything before the
 *  first User-agent line is ignored too, since a bare directive with no
 *  preceding agent is malformed and we'd rather under-restrict than
 *  mis-attribute it to a group it never named. */
function parseRobots(text: string): RobotsRules {
  const sitemaps: string[] = [];
  type Block = { agents: string[]; rules: { type: "allow" | "disallow"; path: string }[] };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      // Consecutive User-agent lines (no directive between them) share one
      // block, per the standard convention of grouping agents together.
      if (current && current.rules.length === 0) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], rules: [] };
        blocks.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (key === "disallow" || key === "allow") {
      if (key === "disallow" && value === "") continue; // "Disallow:" (empty) means allow everything
      current.rules.push({ type: key, path: value });
    }
  }

  const named = blocks.find((b) => b.agents.some((a) => a.includes(ROBOTS_BOT_TOKEN)));
  const wildcard = blocks.find((b) => b.agents.includes("*"));
  const chosen = named ?? wildcard;
  return {
    sitemaps,
    disallow: chosen ? chosen.rules.filter((r) => r.type === "disallow").map((r) => r.path) : [],
    allow: chosen ? chosen.rules.filter((r) => r.type === "allow").map((r) => r.path) : [],
  };
}

/** robots.txt pattern matching: "*" is a wildcard, a trailing "$" anchors the
 *  end of the path. Everything else is a literal prefix. Standard-compliant
 *  enough for the sites we'll meet without pulling in a robots-parser
 *  dependency for it. */
function robotsRuleMatches(path: string, pattern: string): boolean {
  if (!pattern) return false;
  let p = pattern;
  let anchored = false;
  if (p.endsWith("$")) {
    anchored = true;
    p = p.slice(0, -1);
  }
  const escaped = p.split("*").map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const re = new RegExp("^" + escaped + (anchored ? "$" : ""));
  return re.test(path);
}

/** Longest-matching-rule-wins, the standard robots.txt tie-break: the most
 *  specific Allow/Disallow rule that matches decides, not the first or last
 *  one written. */
function robotsAllows(path: string, disallow: string[], allow: string[]): boolean {
  let bestLen = -1;
  let allowed = true;
  for (const p of disallow) {
    if (p.length > bestLen && robotsRuleMatches(path, p)) {
      bestLen = p.length;
      allowed = false;
    }
  }
  for (const p of allow) {
    if (p.length > bestLen && robotsRuleMatches(path, p)) {
      bestLen = p.length;
      allowed = true;
    }
  }
  return allowed;
}

async function fetchRobots(origin: string, domain: string, timeoutMs: number): Promise<RobotsRules & { found: boolean }> {
  const res = await fetchProjectUrl(`${origin}/robots.txt`, domain, { timeoutMs, userAgent: UA });
  if (!res || !res.ok) return { sitemaps: [], disallow: [], allow: [], found: false };
  const text = await readCapped(res, MAX_BODY_BYTES);
  return { ...parseRobots(text), found: true };
}

// --------------------------------------------------------------------------
// Sitemaps
// --------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const isHex = ent[1] === "x" || ent[1] === "X";
      const code = isHex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

/** <url> and <sitemap> entries share the exact same shape (a <loc>, an
 *  optional <lastmod>), so one regex pass handles both a urlset and a
 *  sitemapindex file. */
function extractSitemapEntries(xml: string): { loc: string; lastmod: string | null }[] {
  const entries: { loc: string; lastmod: string | null }[] = [];
  const blockRe = /<(?:url|sitemap)\b[^>]*>([\s\S]*?)<\/(?:url|sitemap)>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml))) {
    const block = m[1];
    const locM = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(block);
    if (!locM) continue;
    const lastmodM = /<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i.exec(block);
    const loc = decodeXmlText(locM[1].trim());
    if (loc) entries.push({ loc, lastmod: lastmodM ? decodeXmlText(lastmodM[1].trim()) : null });
  }
  return entries;
}

async function fetchSitemapFile(
  url: string,
  domain: string,
  timeoutMs: number,
): Promise<{ isIndex: boolean; locs: { loc: string; lastmod: string | null }[]; childSitemaps: string[] } | null> {
  const res = await fetchProjectUrl(url, domain, { timeoutMs, userAgent: UA });
  if (!res || !res.ok) return null;
  const text = await readCapped(res, MAX_BODY_BYTES);
  if (!/<urlset\b|<sitemapindex\b/i.test(text)) return null; // 404 pages and the like land here
  const isIndex = /<sitemapindex\b/i.test(text);
  const entries = extractSitemapEntries(text);
  return isIndex
    ? { isIndex, locs: [], childSitemaps: entries.map((e) => e.loc).slice(0, MAX_SITEMAP_CHILD_SITEMAPS) }
    : { isIndex, locs: entries, childSitemaps: [] };
}

/** Walks robots-declared sitemaps (or guesses the two conventional paths if
 *  robots named none), recursing exactly ONE level into an index file -
 *  Yoast and RankMath both publish index files that point at per-type child
 *  sitemaps, and one level is exactly as deep as that pattern goes. A
 *  malicious or misconfigured child pointing at ANOTHER index is not
 *  followed further. */
async function discoverSitemapUrls(
  origin: string,
  domain: string,
  robotsSitemaps: string[],
  timeoutMs: number,
  maxPages: number,
): Promise<{ locs: string[]; totalFound: number }> {
  const candidates =
    robotsSitemaps.length > 0
      ? robotsSitemaps
      : // /wp-sitemap.xml is WordPress core's own default (since 5.5) - it
        // matters exactly when a WP site has no robots.txt AND its REST API is
        // blocked, which is the hardened-site shape the fixtures test.
        [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  const seenSitemaps = new Set<string>();
  const locSet = new Set<string>();
  // Enough headroom that filtering (off-site, non-content, robots-disallowed
  // entries) doesn't starve the final list, but bounded so a sitemap with
  // tens of thousands of URLs can't be walked in full.
  const hardCap = Math.max(maxPages * 5, 1000);

  async function visit(rawUrl: string, depth: number): Promise<void> {
    if (locSet.size >= hardCap) return;
    let abs: string;
    try {
      abs = new URL(rawUrl, origin).toString();
    } catch {
      return;
    }
    if (seenSitemaps.has(abs) || !isProjectUrl(abs, domain)) return;
    seenSitemaps.add(abs);
    const result = await fetchSitemapFile(abs, domain, timeoutMs);
    if (!result) return;
    for (const entry of result.locs) {
      if (locSet.size >= hardCap) break;
      locSet.add(entry.loc);
    }
    if (depth === 0) {
      for (const child of result.childSitemaps) {
        if (locSet.size >= hardCap) break;
        await visit(child, depth + 1);
      }
    }
  }

  for (const c of candidates) {
    await visit(c, 0);
    if (locSet.size >= hardCap) break;
  }
  return { locs: Array.from(locSet), totalFound: locSet.size };
}

// --------------------------------------------------------------------------
// Page extraction (HTML crawl path)
// --------------------------------------------------------------------------

function stripBlock(html: string, tag: string): string {
  return html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
}

/** Removes exactly what requirement 3 asks to be removed before body text is
 *  taken: script, style, nav, footer. Header is deliberately left in - a
 *  page's real h1/intro copy commonly lives inside a <header> wrapper, and
 *  stripping it would throw away the most on-topic text on the page. */
function cleanForText(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "nav", "footer"]) out = stripBlock(out, tag);
  return out;
}

function extractHeadings(cleanedHtml: string): Heading[] {
  const headings: Heading[] = [];
  const re = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleanedHtml))) {
    const text = collapseWhitespace(decodeEntities(stripTags(m[2])));
    if (text) headings.push({ level: m[1] === "2" ? 2 : 3, text });
  }
  return headings;
}

function extractTitle(html: string): string | null {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const t = m ? collapseWhitespace(decodeEntities(stripTags(m[1]))) : "";
  return t || null;
}

function extractH1(html: string): string | null {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const t = m ? collapseWhitespace(decodeEntities(stripTags(m[1]))) : "";
  return t || null;
}

/** Attribute order in real-world markup varies (name= before content=, or
 *  the reverse) - same dual-regex approach as metaGenerator() in
 *  site-platform.ts, for the same reason. */
function extractMetaContent(html: string, name: string): string | null {
  const forward = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i");
  const m = forward.exec(html) ?? reverse.exec(html);
  const t = m ? collapseWhitespace(decodeEntities(m[1])) : "";
  return t || null;
}

function extractCanonical(html: string): string | null {
  const forward = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i;
  const reverse = /<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["']/i;
  const m = forward.exec(html) ?? reverse.exec(html);
  const href = m ? m[1].trim() : "";
  return href || null;
}

function extractLang(html: string): string | null {
  const m = /<html[^>]+lang=["']([^"']+)["']/i.exec(html);
  return m ? m[1].trim() || null : null;
}

/** Checks, in order of reliability: OpenGraph article timestamps, a JSON-LD
 *  Article's datePublished/dateModified, then any <time datetime="">. Any
 *  one of these is common; none is universal, hence the fallback chain. */
function extractDates(html: string): { published: string | null; modified: string | null } {
  const published =
    /<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /"datePublished"\s*:\s*"([^"]+)"/i.exec(html)?.[1] ??
    /<time[^>]+datetime=["']([^"']+)["']/i.exec(html)?.[1] ??
    null;
  const modified =
    /<meta[^>]+property=["']article:modified_time["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /"dateModified"\s*:\s*"([^"]+)"/i.exec(html)?.[1] ??
    null;
  return { published, modified };
}

/** Links are pulled from the RAW (unstripped) html on purpose, unlike
 *  headings/body text - main navigation is exactly where a site's real
 *  structure lives, and the breadth-first fallback needs those links to
 *  find pages that have no other path to them. Stripping nav here would
 *  quietly starve the crawl of the one thing that makes it work without a
 *  sitemap. */
function extractInternalLinks(html: string, pageUrl: string, domain: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#][^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (out.size >= MAX_INTERNAL_LINKS_PER_PAGE) break;
    const href = m[1].trim();
    if (!href || /^(mailto|tel|javascript):/i.test(href)) continue;
    let abs: string;
    try {
      abs = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (!isProjectUrl(abs, domain)) continue;
    const norm = normalizeUrl(abs);
    if (!norm || isSkippableUrl(norm)) continue;
    out.add(norm);
  }
  return Array.from(out);
}

function extractPage(url: string, html: string, domain: string): CrawledPage {
  const cleaned = cleanForText(html);
  const fullText = collapseWhitespace(decodeEntities(stripTags(cleaned)));
  const { published, modified } = extractDates(html);
  return {
    url,
    title: extractTitle(html),
    h1: extractH1(html),
    metaDescription: extractMetaContent(html, "description"),
    canonical: extractCanonical(html),
    lang: extractLang(html),
    headings: extractHeadings(cleaned),
    bodyText: fullText.slice(0, BODY_SAMPLE_CHARS),
    wordCount: fullText ? fullText.split(" ").filter(Boolean).length : 0,
    publishedDate: published,
    modifiedDate: modified,
    internalLinks: extractInternalLinks(html, url, domain),
    categories: [],
    source: "html",
  };
}

type FetchOutcome = { kind: "page"; page: CrawledPage } | { kind: "skip" } | { kind: "error" };

async function fetchAndExtract(url: string, domain: string, timeoutMs: number): Promise<FetchOutcome> {
  const res = await fetchProjectUrl(url, domain, { timeoutMs, userAgent: UA });
  if (!res) return { kind: "error" };
  if (!res.ok) return res.status === 404 || res.status === 410 ? { kind: "skip" } : { kind: "error" };
  const ct = res.headers.get("content-type") ?? "";
  if (ct && !/text\/html|application\/xhtml/i.test(ct)) return { kind: "skip" };
  const html = await readCapped(res, MAX_BODY_BYTES);
  if (!html) return { kind: "skip" };
  return { kind: "page", page: extractPage(res.url || url, html, domain) };
}

// --------------------------------------------------------------------------
// Breadth-first fallback
// --------------------------------------------------------------------------

async function bfsCrawl(
  origin: string,
  domain: string,
  maxPages: number,
  maxDepth: number,
  concurrency: number,
  timeoutMs: number,
  robots: { disallow: string[]; allow: string[] },
  /** The folder site's root URL, or "" for a root site (no extra filter). */
  scope = "",
): Promise<{ pages: CrawledPage[]; fetched: number; skipped: number; errors: number; notes: string[] }> {
  const notes: string[] = [];
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  let fetched = 0;
  let skipped = 0;
  let errors = 0;
  let hitPageCap = false;
  let hitDepthCap = false;

  const startUrl = normalizeUrl(`${origin}/`) ?? `${origin}/`;
  visited.add(startUrl);
  let frontier = [startUrl];
  let depth = 0;

  while (frontier.length > 0 && depth <= maxDepth) {
    if (pages.length >= maxPages) break;
    const budget = maxPages - pages.length;
    const batch = frontier.slice(0, budget);
    if (frontier.length > batch.length) hitPageCap = true;

    const nextFrontier = new Set<string>();
    await runPool(batch, concurrency, async (url) => {
      if (!robotsAllows(pathAndQuery(url), robots.disallow, robots.allow)) {
        skipped++;
        return;
      }
      const outcome = await fetchAndExtract(url, domain, timeoutMs);
      if (outcome.kind === "page") {
        fetched++;
        pages.push(outcome.page);
        for (const link of outcome.page.internalLinks) {
          // A site in a folder (scope set): a link out of the folder is
          // another site on the same host. Root sites follow every link
          // isProjectUrl accepted, as before (apex, www, http).
          if (!visited.has(link) && (!scope || link === scope || link.startsWith(`${scope}/`))) {
            visited.add(link);
            nextFrontier.add(link);
          }
        }
      } else if (outcome.kind === "skip") {
        skipped++;
      } else {
        errors++;
      }
    });

    if (pages.length >= maxPages && nextFrontier.size > 0) hitPageCap = true;
    frontier = Array.from(nextFrontier);
    depth++;
    if (depth > maxDepth && frontier.length > 0) hitDepthCap = true;
  }

  if (hitPageCap) {
    notes.push(`We stopped after reading ${pages.length} pages; your site may have more.`);
  } else if (hitDepthCap) {
    notes.push(`We stopped following links after ${maxDepth} levels deep to keep this fast.`);
  }

  return { pages, fetched, skipped, errors, notes };
}

// --------------------------------------------------------------------------
// WordPress fast path
// --------------------------------------------------------------------------

type WpRaw = {
  id?: number;
  link?: string;
  title?: { rendered?: string } | string;
  date?: string;
  /** UTC twin of `date`. Preferred - see the note where these are read. */
  date_gmt?: string;
  modified?: string;
  /** UTC twin of `modified`. */
  modified_gmt?: string;
  categories?: number[];
};

async function fetchWpCollection(
  origin: string,
  domain: string,
  kind: "pages" | "posts",
  timeoutMs: number,
  remainingBudget: number,
): Promise<{ items: WpRaw[]; totalAvailable: number; ok: boolean }> {
  if (remainingBudget <= 0) return { items: [], totalAvailable: 0, ok: true };
  const items: WpRaw[] = [];
  let totalAvailable = 0;
  let totalPages = 1;
  let page = 1;

  while (page <= totalPages && page <= MAX_WP_PAGINATION_PAGES && items.length < remainingBudget) {
    const url =
      `${origin}/wp-json/wp/v2/${kind}?per_page=100&page=${page}` +
      `&_fields=id,link,title,date,date_gmt,modified,modified_gmt,categories&orderby=date&order=desc`;
    const res = await fetchProjectUrl(url, domain, { timeoutMs, userAgent: UA });
    if (!res || !res.ok) {
      if (page === 1) return { items: [], totalAvailable: 0, ok: false };
      break; // a later page failing is a partial read, not a dead endpoint
    }
    if (page === 1) {
      const tp = Number(res.headers.get("x-wp-totalpages") ?? "1");
      totalPages = Number.isFinite(tp) && tp > 0 ? tp : 1;
      const t = Number(res.headers.get("x-wp-total") ?? "0");
      totalAvailable = Number.isFinite(t) ? t : 0;
    }
    const text = await readCapped(res, MAX_BODY_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (page === 1) return { items: [], totalAvailable: 0, ok: false };
      break;
    }
    if (!Array.isArray(parsed)) {
      if (page === 1) return { items: [], totalAvailable: 0, ok: false };
      break;
    }
    for (const it of parsed as WpRaw[]) {
      if (items.length >= remainingBudget) break;
      items.push(it);
    }
    page++;
  }
  return { items, totalAvailable, ok: true };
}

/** One extra request to resolve category ids to names. Non-fatal if it
 *  fails or is incomplete - a missing category name just falls back to its
 *  numeric id in the digest, which is still meaningful signal. */
async function fetchWpCategoryMap(origin: string, domain: string, timeoutMs: number): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const res = await fetchProjectUrl(`${origin}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`, domain, {
    timeoutMs,
    userAgent: UA,
  });
  if (!res || !res.ok) return map;
  const text = await readCapped(res, MAX_BODY_BYTES);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      for (const c of parsed as { id?: number; name?: string }[]) {
        if (typeof c.id === "number" && typeof c.name === "string") map.set(c.id, decodeEntities(c.name));
      }
    }
  } catch {
    // Names are a nice-to-have; leave the map partial/empty on any parse trouble.
  }
  return map;
}

/**
 * The WordPress fast path: read the site's own content list over its REST
 * API instead of crawling HTML. Requirement 2's whole point is "no HTML
 * parsing at all" here, so pages built this way carry real titles/dates/
 * categories but leave h1, meta description, headings, body text and
 * internal links empty (source: "wp-rest") - those fields are what the
 * regex-based HTML extractor produces, and this path deliberately never
 * calls it.
 *
 * Pages are fetched before posts on purpose: a small business site commonly
 * has a handful of pages (About, Services, Contact) that matter far more to
 * "what is this site" than its 400th blog post, so if the page budget is
 * tight, pages win the budget first.
 */
async function tryWordPressFastPath(
  origin: string,
  domain: string,
  maxPages: number,
  timeoutMs: number,
): Promise<{ pages: CrawledPage[]; ok: boolean; notes: string[] }> {
  const pagesResult = await fetchWpCollection(origin, domain, "pages", timeoutMs, maxPages);
  const notes: string[] = [];

  if (!pagesResult.ok) {
    // Pages endpoint failed outright - give posts one try before writing off
    // the fast path entirely (a site can disable one post type in REST
    // while leaving the other on).
    const postsOnly = await fetchWpCollection(origin, domain, "posts", timeoutMs, maxPages);
    if (!postsOnly.ok) {
      return { pages: [], ok: false, notes: [] };
    }
    const categoryMap = await fetchWpCategoryMap(origin, domain, timeoutMs);
    return finishWpFastPath([], postsOnly, categoryMap, notes);
  }

  const remainingForPosts = Math.max(0, maxPages - pagesResult.items.length);
  const postsResult = await fetchWpCollection(origin, domain, "posts", timeoutMs, remainingForPosts);
  if (!postsResult.ok) {
    notes.push("We could not read your blog posts the fast way, so this list only includes your pages.");
  }
  const categoryMap = await fetchWpCategoryMap(origin, domain, timeoutMs);
  return finishWpFastPath(pagesResult.items, postsResult, categoryMap, notes);
}

function finishWpFastPath(
  pageItems: WpRaw[],
  postsResult: { items: WpRaw[]; totalAvailable: number },
  categoryMap: Map<number, string>,
  notes: string[],
): { pages: CrawledPage[]; ok: boolean; notes: string[] } {
  const raw = [...pageItems, ...postsResult.items];
  const pages: CrawledPage[] = raw
    .map((it): CrawledPage | null => {
      const link = it.link ?? "";
      if (!link) return null;
      const titleRaw = typeof it.title === "string" ? it.title : it.title?.rendered ?? "";
      const title = decodeEntities(titleRaw).trim() || null;
      const categories = Array.isArray(it.categories)
        ? it.categories.map((id) => categoryMap.get(id) ?? String(id))
        : [];
      return {
        url: link,
        title,
        h1: null,
        metaDescription: null,
        canonical: link,
        lang: null,
        headings: [],
        bodyText: "",
        wordCount: 0,
        // The _gmt twins, not the bare fields. WordPress returns `date` and
        // `modified` in the SITE'S local timezone with no offset marker, so
        // Date.parse reads them as UTC and every date in the digest silently
        // skews by the site's offset - up to half a day for a site set to
        // Auckland or Honolulu, which is enough to reorder "newest content".
        // Falling back to the local field is better than a null when an older
        // WordPress omits the _gmt variant.
        publishedDate: it.date_gmt ? `${it.date_gmt}Z` : (it.date ?? null),
        modifiedDate: it.modified_gmt ? `${it.modified_gmt}Z` : (it.modified ?? null),
        internalLinks: [],
        categories,
        source: "wp-rest",
      };
    })
    .filter((p): p is CrawledPage => p !== null);

  // Say when we did not read everything. totalAvailable is what WordPress
  // reports it holds; pages.length is what we actually took after the page
  // budget and any mid-pagination failure. Leaving the two silently different
  // is precisely the shape this repo forbids: the owner would see a digest
  // that looks complete, and a "we know your site" claim built on a third of
  // it. The number is theirs to judge, so give them the number.
  const posts = postsResult.items.length;
  const totalKnown = postsResult.totalAvailable;
  if (totalKnown > 0 && posts < totalKnown) {
    notes.push(
      `Your site lists ${totalKnown} posts and we read the newest ${posts}. That is enough to understand the site; ask for a rescan if you need the rest.`,
    );
  }

  return { pages, ok: true, notes };
}

// --------------------------------------------------------------------------
// Digest builder
// --------------------------------------------------------------------------

/**
 * Compresses a crawl into the small object a customer's chat AI reads
 * instead of the site itself. Every list has a generous starting size and a
 * fixed, deterministic shrink order (never random - the same input always
 * produces the same digest) so the final JSON stays comfortably under the
 * character budget regardless of how large the crawl was.
 */
export function buildDigest(pages: CrawledPage[]): SiteDigest {
  const totalPages = pages.length;

  const wordCounts = pages.map((p) => p.wordCount).filter((n) => n > 0);
  const averageWordCount = wordCounts.length ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0;

  const dateStamps: number[] = [];
  for (const p of pages) {
    for (const d of [p.publishedDate, p.modifiedDate]) {
      if (!d) continue;
      const t = Date.parse(d);
      if (Number.isFinite(t)) dateStamps.push(t);
    }
  }
  const newestDate = dateStamps.length ? new Date(Math.max(...dateStamps)).toISOString() : null;
  const oldestDate = dateStamps.length ? new Date(Math.min(...dateStamps)).toISOString() : null;

  const sectionCounts = new Map<string, number>();
  for (const p of pages) {
    let path: string;
    try {
      path = new URL(p.url).pathname;
    } catch {
      continue;
    }
    const seg = path.split("/").filter(Boolean)[0]?.toLowerCase();
    if (seg) sectionCounts.set(seg, (sectionCounts.get(seg) ?? 0) + 1);
  }
  const topSectionsAll = Array.from(sectionCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  const categorySet = new Set<string>();
  for (const p of pages) for (const c of p.categories) categorySet.add(c);
  const categoriesAll = Array.from(categorySet).sort((a, b) => a.localeCompare(b));

  const inbound = new Map<string, number>();
  for (const p of pages) for (const link of p.internalLinks) inbound.set(link, (inbound.get(link) ?? 0) + 1);
  const titleByUrl = new Map<string, string | null>();
  for (const p of pages) titleByUrl.set(p.url, p.title ?? p.h1 ?? null);
  const mostLinkedAll = Array.from(inbound.entries())
    .map(([url, count]) => ({ url, title: titleByUrl.get(url) ?? null, inboundLinks: count }))
    .sort((a, b) => b.inboundLinks - a.inboundLinks || a.url.localeCompare(b.url));

  // Evenly spaced through crawl order, not just "the first N we fetched" -
  // a sitemap or WordPress listing is usually newest-first, so grabbing only
  // the front would bias the sample toward recent content.
  const sampleAll: string[] = [];
  const sampleWant = Math.min(pages.length, 12);
  for (let i = 0; i < sampleWant; i++) {
    const idx = Math.floor((i * pages.length) / sampleWant);
    const p = pages[idx];
    sampleAll.push(p.title ?? p.h1 ?? p.url);
  }

  let sampleTitles = sampleAll.slice();
  let mostLinkedPages = mostLinkedAll.slice(0, 10);
  let topSections = topSectionsAll.slice(0, 12);
  let categories = categoriesAll.slice(0, 20);
  let truncated = false;

  function assemble(): SiteDigest {
    return {
      totalPages,
      averageWordCount,
      newestDate,
      oldestDate,
      topSections: topSections.map((s) => ({ path: truncateStr(s.path, 60), count: s.count })),
      categories: categories.map((c) => truncateStr(c, 60)),
      mostLinkedPages: mostLinkedPages.map((m) => ({
        url: m.url,
        title: m.title ? truncateStr(m.title, 90) : null,
        inboundLinks: m.inboundLinks,
      })),
      sampleTitles: sampleTitles.map((t) => truncateStr(t, 90)),
      truncated,
      charBudget: DIGEST_CHAR_BUDGET,
      charLength: 0,
    };
  }

  let digest = assemble();
  let size = JSON.stringify(digest).length;
  let iterations = 0;
  // Fixed priority order: cut the sample first, then the linked-pages list,
  // then sections, then categories - each is a supporting signal, not the
  // headline count/date fields, which never shrink.
  while (size > DIGEST_CHAR_BUDGET && iterations < 20) {
    iterations++;
    if (sampleTitles.length > 3) {
      sampleTitles = sampleTitles.slice(0, Math.max(3, Math.ceil(sampleTitles.length * 0.6)));
    } else if (mostLinkedPages.length > 3) {
      mostLinkedPages = mostLinkedPages.slice(0, Math.max(3, Math.ceil(mostLinkedPages.length * 0.6)));
    } else if (topSections.length > 3) {
      topSections = topSections.slice(0, Math.max(3, Math.ceil(topSections.length * 0.6)));
    } else if (categories.length > 3) {
      categories = categories.slice(0, Math.max(3, Math.ceil(categories.length * 0.6)));
    } else {
      // Every list is at its floor and the digest is STILL over budget. It has
      // genuinely been cut short, so say so - reporting truncated:false here
      // would tell a caller the digest is complete when it is not.
      truncated = true;
      break;
    }
    truncated = true;
    digest = assemble();
    size = JSON.stringify(digest).length;
  }
  digest.charLength = size;
  return digest;
}

// --------------------------------------------------------------------------
// crawlSite
// --------------------------------------------------------------------------

function emptyResult(source: CrawlResult["stats"]["source"], start: number, notes: string[]): CrawlResult {
  return {
    ok: false,
    pages: [],
    digest: buildDigest([]),
    stats: { fetched: 0, skipped: 0, errors: 0, durationMs: Date.now() - start, source },
    notes,
  };
}

/**
 * Crawl `domain` and return a bounded page inventory plus a compact digest.
 * Discovery order: robots.txt -> sitemap.xml (including one level of index
 * recursion) -> a breadth-first fallback from the homepage. When the caller
 * knows (or we detect) WordPress, the REST API path runs first instead and
 * only falls back to the above if it turns out not to work.
 *
 * Never throws - every internal step already degrades to a named note
 * instead of an exception, and this top-level try/catch is the backstop for
 * anything that slips through, because this runs inside signup and setup
 * where a crash would break onboarding itself.
 */
/**
 * The observations an owner is owed about how complete this crawl actually is.
 * Shared by EVERY return path (WordPress fast path and the general path both),
 * because "we read your site" is a claim, and a claim built on a quarter of the
 * pages - or on a site that served us the same shell every time - has to say so
 * where they will see it. Silence here is the failure mode this repo forbids.
 */
function coverageNotes(pages: CrawledPage[], maxPages: number): string[] {
  const out: string[] = [];

  // Hitting the cap is the commonest way this function quietly under-reports.
  if (pages.length >= maxPages) {
    out.push(
      `We read ${pages.length} pages, which is the most we read in one pass. If your site is larger, the newest and most-linked pages are the ones we kept.`,
    );
  }

  // A site that serves the same shell for every address - most commonly one
  // built as a single-page app - looks like a perfectly successful crawl while
  // telling us nothing. Detect it by titles rather than by framework: several
  // pages sharing one title is the symptom whatever the cause, and the owner
  // needs to know the digest is thin BEFORE their AI writes on top of it.
  const titled = pages.map((p) => (p.title ?? "").trim().toLowerCase()).filter((t) => t.length > 0);
  if (titled.length >= 4 && new Set(titled).size <= Math.max(1, Math.floor(titled.length / 4))) {
    out.push(
      "Most of your pages gave us the same title, which usually means the text is added by the browser after the page loads. We can still work, but tell your AI what the site does so it is not guessing.",
    );
  }

  return out;
}

export async function crawlSite(domain: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const start = Date.now();
  const notes: string[] = [];
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? DEFAULT_MAX_PAGES, 1000));
  const maxDepth = Math.max(1, Math.min(opts.maxDepth ?? DEFAULT_MAX_DEPTH, 10));
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, 10));
  const timeoutMs = Math.max(2000, Math.min(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30000));

  const cleanDomain = domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (!cleanDomain || isPrivateHost(cleanDomain)) {
    return emptyResult("bfs", start, [`"${domain}" is not a public web address we can visit.`]);
  }

  const basePath = (opts.basePath ?? "").replace(/\/+$/, "");
  try {
    let home = await fetchProjectUrl(`https://${cleanDomain}${basePath}/`, cleanDomain, { timeoutMs, userAgent: UA });
    if (!home) home = await fetchProjectUrl(`http://${cleanDomain}${basePath}/`, cleanDomain, { timeoutMs, userAgent: UA });
    if (!home || !home.ok) {
      return emptyResult("bfs", start, [
        `We could not reach ${cleanDomain}. The site might be down, might be blocking automated visits, or the address might be mistyped.`,
      ]);
    }
    let origin: string;
    try {
      origin = new URL(home.url || `https://${cleanDomain}/`).origin;
    } catch {
      origin = `https://${cleanDomain}`;
    }
    // The site's own root: the host's origin plus the folder it lives in.
    // Everything below reads from `base`; robots.txt alone is the host's.
    const base = `${origin}${basePath}`;
    const inside = (url: string) => !basePath || url === base || url.startsWith(`${base}/`);

    // ---- WordPress fast path ---------------------------------------------
    if (opts.isWordPress !== false) {
      const wp = await tryWordPressFastPath(base, cleanDomain, maxPages, timeoutMs);
      if (wp.ok && wp.pages.length > 0) {
        return {
          ok: true,
          pages: wp.pages,
          digest: buildDigest(wp.pages),
          stats: { fetched: wp.pages.length, skipped: 0, errors: 0, durationMs: Date.now() - start, source: "wp-rest" },
          notes: [...wp.notes, ...coverageNotes(wp.pages, maxPages)],
        };
      }
      if (opts.isWordPress === true) {
        notes.push(
          wp.notes[0] ?? "We could not read your WordPress content list the fast way, so we looked at your pages directly instead.",
        );
      }
      // opts.isWordPress === undefined and the probe simply found nothing:
      // that was only a guess, so fall through quietly to the general path.
    }

    // ---- robots.txt + sitemap ---------------------------------------------
    const robots = await fetchRobots(origin, cleanDomain, timeoutMs);
    // On a shared host robots.txt names the HOST's sitemaps; the folder's own
    // sitemap is the one that lists this site.
    const { locs: rawLocs, totalFound } = await discoverSitemapUrls(base, cleanDomain, basePath ? robots.sitemaps.filter(inside) : robots.sitemaps, timeoutMs, maxPages);

    let candidateUrls: string[] = [];
    if (rawLocs.length > 0) {
      const seen = new Set<string>();
      for (const raw of rawLocs) {
        let abs: string;
        try {
          abs = new URL(raw, origin).toString();
        } catch {
          continue;
        }
        if (!isProjectUrl(abs, cleanDomain) || !inside(abs)) continue;
        const norm = normalizeUrl(abs);
        if (!norm || seen.has(norm) || isSkippableUrl(norm)) continue;
        if (!robotsAllows(pathAndQuery(norm), robots.disallow, robots.allow)) continue;
        seen.add(norm);
        candidateUrls.push(norm);
      }
    }

    let source: "sitemap" | "bfs" = candidateUrls.length > 0 ? "sitemap" : "bfs";

    if (source === "bfs") {
      notes.push(
        robots.found
          ? "We could not find a usable sitemap, so we looked for pages by following links from your homepage instead."
          : "Your site has no robots.txt or sitemap we could read, so we looked for pages by following links from your homepage instead.",
      );
    } else if (candidateUrls.length > maxPages) {
      notes.push(`Your sitemap lists ${totalFound} pages; we read the first ${maxPages}.`);
      candidateUrls = candidateUrls.slice(0, maxPages);
    }

    let pages: CrawledPage[] = [];
    let fetched = 0;
    let skipped = 0;
    let errors = 0;

    if (source === "sitemap") {
      const results: (CrawledPage | null)[] = new Array(candidateUrls.length).fill(null);
      await runPool(candidateUrls, concurrency, async (url, idx) => {
        const outcome = await fetchAndExtract(url, cleanDomain, timeoutMs);
        if (outcome.kind === "page") {
          results[idx] = outcome.page;
          fetched++;
        } else if (outcome.kind === "skip") {
          skipped++;
        } else {
          errors++;
        }
      });
      pages = results.filter((p): p is CrawledPage => p !== null);
      // A sitemap that turned out to contain nothing we could actually read
      // (every entry off-site, disallowed, or dead) is functionally the same
      // as having no sitemap - fall back rather than reporting an empty crawl.
      if (pages.length === 0) {
        source = "bfs";
        notes.push("Your sitemap did not lead to any pages we could read, so we looked for pages by following links from your homepage instead.");
      }
    }

    if (source === "bfs" && pages.length === 0) {
      const bfsResult = await bfsCrawl(base, cleanDomain, maxPages, maxDepth, concurrency, timeoutMs, robots, basePath ? base : "");
      pages = bfsResult.pages;
      fetched += bfsResult.fetched;
      skipped += bfsResult.skipped;
      errors += bfsResult.errors;
      notes.push(...bfsResult.notes);
    }

    if (errors > 0) notes.push(`${errors} page${errors === 1 ? "" : "s"} did not load and ${errors === 1 ? "was" : "were"} skipped.`);
    if (pages.length === 0) notes.push("We could not build a page list for this site.");

    notes.push(...coverageNotes(pages, maxPages));

    return {
      ok: pages.length > 0,
      pages,
      digest: buildDigest(pages),
      stats: { fetched, skipped, errors, durationMs: Date.now() - start, source },
      notes,
    };
  } catch (err) {
    return emptyResult("bfs", start, [
      // Deliberately does NOT interpolate err.message: it is raw JS/network
      // wording ("fetch failed", "ETIMEDOUT") that means nothing to a small
      // business owner and reads as a broken product. The specific failure is
      // still available to the caller through stats/errors for support.
      "We could not read your site. That is usually a temporary block or a slow response, not something wrong with your content. Nothing was saved, and you can try the scan again.",
    ]);
  }
}
