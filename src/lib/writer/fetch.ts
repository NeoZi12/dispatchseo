import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { Agent, fetch as pinnedFetch } from "undici";
import { isPrivateHost } from "@/lib/url-guard";

// Every connection the writer makes goes through this agent, whose DNS
// lookup is the private-address check itself: it resolves the name once,
// refuses the whole page if ANY answer is private, and hands that same
// vetted address to the socket. The check and the connect are one step, so
// a hostile domain cannot answer the check with a public address and the
// connect with 10.0.0.5 (DNS rebinding). Undici's own fetch is used rather
// than the global one so the dispatcher and the fetch are the same build.
function pinnedLookup(hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void): void {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return callback(err, "", 4);
    const list = Array.isArray(addrs) ? addrs : [];
    if (list.length === 0 || list.some((a) => isPrivateIp(a.address))) {
      const refused: NodeJS.ErrnoException = new Error(`refusing ${hostname}: resolves to a private address`);
      refused.code = "EPRIVATE";
      return callback(refused, "", 4);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const pinnedAgent = new Agent({ connect: { lookup: pinnedLookup } });

// Fetching other people's pages for the fact sheet.
//
// Same posture as url-guard.ts: a keyword's SERP results are attacker-shaped
// input (anyone can rank a page), so every hop is checked against the private
// host list AND resolved before connecting, redirects are followed by hand,
// the body is capped, and anything that is not an HTML page is skipped rather
// than parsed.
//
// What the text keeps, and why: a price table turned into one cell per line
// is unquotable, and prices and specs are the most valuable facts an
// e-commerce article can carry. So table rows stay on one line with " | "
// between cells, list items keep a "- " prefix, and headings keep "## " - the
// extractor can quote a row verbatim, and the research stage can read the
// page's heading skeleton straight off the text.

// 1.5 MB: a Next.js page ships its whole RSC payload inline, so the article
// itself often starts past the first half-megabyte (clockedcode.com's own
// posts are ~900 KB with the <article> at byte ~250k). Scripts and styles
// are stripped BEFORE the character cap below for the same reason.
const MAX_BYTES = 1_500_000;
/** The regex passes below are linear, but a 600KB page still costs CPU the
 *  handler cannot interrupt; the readable text we need is in the first part. */
const MAX_PARSE_CHARS = 250_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "DispatchSEO-Writer/1.0 (+https://dispatchseo.com)";

export type FetchedPage = {
  url: string;
  title: string | null;
  text: string;
  headings: string[];
  /** ISO date from article:published_time / datePublished, when the page says. */
  publishedAt: string | null;
  wordCount: number;
};

export async function fetchPageText(url: string, timeoutMs = 8_000): Promise<FetchedPage | null> {
  let target = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    // The lexical check refuses names that LOOK internal. Names that RESOLVE
    // internal (a page ranking for the keyword whose A record is 10.0.0.5)
    // are refused inside pinnedAgent's lookup, on every hop, with the socket
    // pinned to the address that passed - see the agent above.
    if (isPrivateHost(parsed.hostname)) return null;
    let res: Awaited<ReturnType<typeof pinnedFetch>>;
    try {
      res = await pinnedFetch(target, {
        dispatcher: pinnedAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status <= 399) {
      const location = res.headers.get("location");
      if (!location) return null;
      try {
        target = new URL(location, target).toString();
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) return null;
    // The timeout signal covers the body read too, so a page that streams
    // slowly rejects here - and a page is never worth failing the stage over.
    try {
      const html = stripNoise(await readCapped(res, MAX_BYTES)).slice(0, MAX_PARSE_CHARS);
      const title = extractTitle(html);
      const publishedAt = extractDate(html);
      const main = mainContent(html);
      const text = htmlToText(main);
      if (text.length < 300) return null; // a login wall, a JS shell, an error page
      const headings = text.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim()).slice(0, 40);
      return { url: target, title, text, headings, publishedAt, wordCount: countWords(text) };
    } catch {
      return null;
    }
  }
  return null;
}

/** Loopback, RFC1918, link-local, CGNAT, "this" network, and their IPv6
 *  counterparts including IPv4-mapped forms. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (/^f[cd]/.test(v6)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(v6)) return true; // fe80::/10 link-local
  if (v6.startsWith("::ffff:")) return true; // mapped v4 not matched above = odd form, refuse
  // Transition ranges that carry an IPv4 address inside: NAT64 (64:ff9b::/96),
  // 6to4 (2002::/16) and IPv4-compatible (::/96). Refused outright - a public
  // site has no reason to be reached through them, and the embedded address
  // could be anything.
  if (v6.startsWith("64:ff9b:") || v6.startsWith("2002:")) return true;
  if (/^(?:0*:)+(?:\d{1,3}\.){3}\d{1,3}$/.test(v6) || /^(?:0*:)+[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v6)) return true;
  return false;
}

/** Script, style, noscript and template blocks carry no prose and, on a
 *  modern site, most of the bytes; dropping them first keeps the parse cap
 *  for content. The HTML-to-text pass drops them again later - harmless. */
function stripNoise(html: string): string {
  // The linear indexOf scanner, never a backtracking regex: this runs over
  // the whole capped body (up to 1.5 MB) and a page full of unclosed
  // <script openers would make a lazy regex quadratic.
  let out = html;
  for (const tag of ["script", "style", "noscript", "template"]) out = stripBlocks(out, `<${tag}`, `</${tag}>`);
  return out;
}

// Undici types its body as the stream/web ReadableStream, which is the same
// object as the global one at runtime but a different TS declaration; only
// the reader is used here, so that is all the parameter asks for.
async function readCapped(res: { body: { getReader(): ReadableStreamDefaultReader<Uint8Array> } | null }, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** Prefer <main> or <article> when the page marks one: the 14k characters the
 *  extractor reads should be the article, not the header and sidebar. */
function mainContent(html: string): string {
  for (const tag of ["main", "article"]) {
    const open = html.search(new RegExp(`<${tag}[\\s>]`, "i"));
    if (open < 0) continue;
    const close = html.toLowerCase().indexOf(`</${tag}>`, open);
    const slice = close > open ? html.slice(open, close) : html.slice(open);
    if (slice.length > 1_500) return slice;
  }
  return html;
}

/** Remove every open..close span with a linear scan. A lazy regex like
 *  <script\b[\s\S]*?</script> is quadratic on a page full of unclosed
 *  openers, and this runs synchronously where no timer can interrupt it. An
 *  opener with no closer drops the rest of the document, which is the right
 *  call for a page that broken. */
function stripBlocks(html: string, open: string, close: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let pos = 0;
  for (;;) {
    const start = lower.indexOf(open, pos);
    if (start < 0) break;
    // For tags, require the opener to end the tag name (<script vs <scripts).
    const after = lower[start + open.length];
    if (open !== "<!--" && after !== undefined && /[a-z0-9-]/.test(after)) {
      out.push(html.slice(pos, start + open.length));
      pos = start + open.length;
      continue;
    }
    out.push(html.slice(pos, start), " ");
    const end = lower.indexOf(close, start + open.length);
    if (end < 0) return out.join("");
    pos = end + close.length;
  }
  out.push(html.slice(pos));
  return out.join("");
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() || null : null;
}

function extractDate(html: string): string | null {
  const head = html.slice(0, 60_000);
  const meta =
    head.match(/property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ??
    head.match(/content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i) ??
    head.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (!meta) return null;
  const t = Date.parse(meta[1]);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Readable text with structure kept as light markdown: "## " headings,
 *  "- " list items, " | " between table cells, one row per line. Scripts,
 *  styles, nav and footer are dropped: a fact quoted out of a cookie banner
 *  is not a fact. */
export function htmlToText(html: string): string {
  let s = html;
  for (const tag of ["script", "style", "noscript", "svg", "nav", "footer", "header", "aside", "form"]) {
    s = stripBlocks(s, `<${tag}`, `</${tag}>`);
  }
  s = stripBlocks(s, "<!--", "-->");
  s = s.replace(/<h[1-6][^>]*>/gi, "\n## ");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<\/(td|th)>/gi, " | ");
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre|table|ul|ol)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").replace(/\s*\|\s*$/, "").trim())
    .filter((line) => line.length > 0 && line !== "-" && line !== "##")
    .join("\n");
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** fromCodePoint throws past 0x10FFFF, and "&#99999999;" is a real thing on
 *  real pages. */
function codePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)));
}
