import { fetchProjectUrl, isPrivateHost, isProjectUrl } from "@/lib/url-guard";
import type { Project } from "@/lib/projects";

// The hosted blog's colours and logo, read from the site itself.
//
// One fetch of the homepage when the hosted route is switched on (and again
// on demand from Settings). What a homepage reliably says about itself:
//   <meta name="theme-color">                the brand colour, when set
//   <meta name="color-scheme"> / theme-color  light or dark
//   <link rel="icon"/"apple-touch-icon">      a logo-ish mark
//   <meta property="og:image">                a wide brand image (fallback)
// FIRST CHOICE: LOOK AT THE PAGE. The homepage is loaded in Cloudflare's
// headless browser (the same Browser Run account page-screenshot.ts uses) and
// a small script reads the colours a visitor actually sees: button fills,
// link colours, coloured bars by area, and the background behind the
// paragraphs. Website builders ship stylesheets full of template colours the
// site never shows, so reading the rendered page is the only reading that is
// right for a Squarespace plumber as often as for a hand-built site
// (measured 2026-11-08 on five sites: all five right, against two of five
// for the CSS count below). It costs 2-5 browser-seconds per site, once, at
// the first crawl: about $0.0001 at $0.09 a browser-hour, and nothing inside
// the plan's included hours.
//
// FALLBACK: READ THE CSS. Without a Browser Run token (self-host) or when the
// browser cannot load the page, the site's CSS is read instead: inline <style> blocks and up
// to three of its stylesheets - its own host's first, then the site-specific
// sheet a builder serves from its CDN (Squarespace's sitecss), never a
// shared library (fonts, Bootstrap, a builder's component kit). The accent is the saturated colour the site leans on
// hardest - weighted toward buttons, links, the header and any custom
// property named primary/accent/brand - and the mode comes from the body's
// background. An accent colour on a neutral page is what makes a blog (and
// its covers, lib/cover-art.ts) read as the site's own; nothing more of the
// look is guessed at. The owner can override every field on Settings.

export type HostedTheme = {
  /** Brand colour used for links, the active ToC item and the CTA button. */
  accent: string;
  /** "light" | "dark" - the page background family. */
  mode: "light" | "dark";
  /** Absolute URL of a square-ish mark, or null. */
  logo: string | null;
  /** Where it came from, for the settings screen. */
  source: "site" | "owner" | "default";
};

export const DEFAULT_THEME: HostedTheme = { accent: "#2563eb", mode: "light", logo: null, source: "default" };

export function normalizeTheme(raw: unknown): HostedTheme {
  const o = (raw ?? {}) as Record<string, unknown>;
  const accent = typeof o.accent === "string" && isHex(o.accent) ? expandHex(o.accent) : DEFAULT_THEME.accent;
  const mode = o.mode === "dark" ? "dark" : "light";
  const logo = typeof o.logo === "string" && /^https?:\/\//.test(o.logo) ? o.logo : null;
  const source = o.source === "site" || o.source === "owner" ? o.source : "default";
  return { accent, mode, logo, source };
}

/** #abc -> #aabbcc: <input type="color"> and CSS both want six digits. */
export function expandHex(s: string): string {
  const h = s.toLowerCase();
  return h.length === 4 ? "#" + h.slice(1).split("").map((c) => c + c).join("") : h;
}

export function isHex(s: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
}

/** Relative luminance of a hex colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** An accent that is readable as link text on the page background. A near-
 *  white brand colour on a light page (or near-black on dark) gets the
 *  default instead - the brand still shows in the logo and the CTA fill. */
export function readableAccent(accent: string, mode: "light" | "dark"): string {
  const l = luminance(accent);
  if (mode === "light" && l > 0.55) return DEFAULT_THEME.accent;
  if (mode === "dark" && l < 0.12) return "#8ab4ff";
  return accent;
}

// --- reading colours out of CSS ------------------------------------------------

/** A CSS colour value -> #rrggbb, or null (keywords other than white/black,
 *  var(), oklch and anything translucent are skipped: none of them is a
 *  brand colour we can use as-is). */
export function cssColorToHex(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v === "white") return "#ffffff";
  if (v === "black") return "#000000";
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 8) return parseInt(h.slice(6), 16) / 255 < 0.5 ? null : "#" + h.slice(0, 6);
    return expandHex("#" + h);
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined && (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])) < 0.5) return null;
    return toHex([+m[1], +m[2], +m[3]]);
  }
  m = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined && (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])) < 0.5) return null;
    return toHex(hslToRgb(+m[1], +m[2] / 100, +m[3] / 100));
  }
  return null;
}

function toHex(rgb: number[]): string | null {
  if (rgb.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return null;
  return "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

function hslToRgb(h: number, s: number, l: number): number[] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Saturation and lightness (0-1) of a #rrggbb colour. */
export function satLight(hex: string): { s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** A colour that can carry a brand: clearly saturated, neither near-black
 *  nor near-white. Greys, off-whites and text colours never qualify. */
function isBrandish(hex: string): boolean {
  const { s, l } = satLight(hex);
  return s >= 0.3 && l >= 0.18 && l <= 0.82;
}

const COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black)\b/gi;

/**
 * The site's accent and page mode, read from its CSS. Every declaration
 * votes for the colours in it; where it sits decides how much the vote
 * counts. Exported for the theme tests and the settings re-read.
 */
export function themeFromCss(css: string): { accent: string | null; dark: boolean | null; ink: string | null } {
  const votes = new Map<string, number>();
  const inks = new Map<string, number>();
  const hits = new Map<string, number>();
  let dark: boolean | null = null;
  for (const [rawSelector, body] of cssRules(css.slice(0, MAX_CSS_CHARS))) {
    const selector = rawSelector.trim().toLowerCase();
    for (const decl of body.split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1);
      if (!/color|background|border|fill|stroke|^--/.test(prop)) continue;
      const colors = (value.match(COLOR_RE) ?? []).map(cssColorToHex).filter((c): c is string => !!c);
      if (!colors.length) continue;
      // The page background: the one place the mode is stated.
      if (/(^|,)\s*(html|body|:root)\s*($|,)/.test(selector) && /^background(-color)?$/.test(prop)) dark = luminance(colors[0]) < 0.2;
      let w = 1;
      if (prop.startsWith("--")) w = /primary|accent|brand|main|theme/.test(prop) ? 6 : 0.5;
      else if (/background/.test(prop) && /button|btn|cta|primary|nav|menu|header|banner|hero|badge/.test(selector)) w = 4;
      else if (prop === "color" && /(^|[\s,>+~])a([\s:.,[]|$)|link|button|btn/.test(selector)) w = 3;
      else if (/border/.test(prop)) w = 0.5;
      for (const c of colors) {
        if (isBrandish(c)) {
          votes.set(c, (votes.get(c) ?? 0) + w);
          hits.set(c, (hits.get(c) ?? 0) + 1);
        }
        else if (prop === "color" && satLight(c).l < 0.35) inks.set(c, (inks.get(c) ?? 0) + 1);
      }
    }
  }
  let accent: string | null = null;
  let best = 0;
  for (const [c, n] of votes) if (n > best && (hits.get(c) ?? 0) >= 2) [accent, best] = [c, n];
  // A colour that turns up in one rule is a stray (a cart's remove button,
  // an error message), not a brand: a black-and-white site must come out
  // black and white, not wearing the red of its form-validation style.
  if (best < 3) accent = null;
  // The text colour such a site leans on, for a monochrome theme.
  let ink: string | null = null;
  let inkBest = 0;
  for (const [c, n] of inks) if (n > inkBest) [ink, inkBest] = [c, n];
  return { accent, dark, ink };
}

/** The most CSS read per site: the homepage's inline styles plus three
 *  stylesheets. A brand colour shows up long before this. */
const MAX_CSS_CHARS = 1_500_000;

/** Innermost CSS rules as [selector, body] pairs, in one linear pass.
 *  A scanner rather than a regex: the input is a third party's file, and a
 *  backtracking pattern over a long run without braces goes quadratic.
 *  Comments are skipped; at-rule wrappers (@media) simply nest, and only the
 *  rules that hold declarations are returned. */
export function cssRules(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let start = 0; // where the current selector began
  let open = -1; // index of the "{" of the innermost open block
  for (let i = 0; i < css.length; i++) {
    const ch = css.charCodeAt(i);
    if (ch === 47 /* / */ && css.charCodeAt(i + 1) === 42 /* * */) {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (ch === 123 /* { */) {
      // A block inside a block (@media { .a { ... } }): the inner selector
      // starts after the outer brace, not at the @media.
      if (open >= 0) start = open + 1;
      open = i;
    } else if (ch === 125 /* } */) {
      if (open >= 0) out.push([css.slice(start, open), css.slice(open + 1, i)]);
      open = -1;
      start = i + 1;
    } else if (ch === 59 /* ; */ && open < 0) {
      start = i + 1; // a bare @import/@charset line is not part of the next selector
    }
  }
  return out;
}

/** A response body as text, never more than `max` bytes read off the wire:
 *  the stream is cancelled at the cap instead of buffering the whole file. */
export async function readCapped(res: Response, max: number): Promise<string> {
  const len = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(len) && len > max * 4) {
    await res.body?.cancel().catch(() => undefined);
    return "";
  }
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (bytes < max) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text.slice(0, max);
}

// --- reading colours off the rendered page -----------------------------------

/** Runs inside the page (Browser Run addScriptTag) and leaves what it saw on
 *  <html data-dsc-colors>, which the content endpoint hands back with the
 *  rendered HTML. Our constant, never built from input. */
const PALETTE_PROBE_JS = "(function(){\n  function hex(s){var m=s&&s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);if(p.length>3&&p[3]<0.5)return null;return \"#\"+p.slice(0,3).map(function(c){return (\"0\"+Math.round(c).toString(16)).slice(-2)}).join(\"\")}\n  var bg={},btn={},link={},vw=innerWidth,vh=Math.max(innerHeight,800);\n  var els=document.querySelectorAll(\"body *\");\n  for(var i=0;i<els.length&&i<5000;i++){\n    var e=els[i],r=e.getBoundingClientRect();\n    if(r.width<4||r.height<4||r.bottom<0||r.top>vh*2)continue;\n    var cs=getComputedStyle(e);\n    if(cs.visibility===\"hidden\"||cs.display===\"none\"||+cs.opacity<0.5)continue;\n    var area=Math.round(Math.min(r.width,vw)*Math.min(r.height,vh));\n    var b=hex(cs.backgroundColor);\n    if(b&&cs.backgroundImage===\"none\")bg[b]=(bg[b]||0)+area;\n    var cls=typeof e.className===\"string\"?e.className:\"\";\n    var clickable=e.tagName===\"BUTTON\"||e.tagName===\"A\"||/btn|button|cta/i.test(cls);\n    if(clickable&&b&&r.width<600&&r.height<120)btn[b]=(btn[b]||0)+1;\n    if(e.tagName===\"A\"){var c=hex(cs.color);if(c)link[c]=(link[c]||0)+1}\n  }\n  var text={},ps=document.querySelectorAll(\"p,li,td,blockquote\");\n  for(var k=0;k<ps.length&&k<800;k++){var p=ps[k],len=(p.textContent||\"\").trim().length;if(len<40)continue;var pr=p.getBoundingClientRect();if(pr.width<4||pr.height<4)continue;var n=p,eb=null;while(n&&n.nodeType===1){var bcs=getComputedStyle(n);if(bcs.backgroundImage!==\"none\"){eb=\"img\";break}eb=hex(bcs.backgroundColor);if(eb)break;n=n.parentElement}if(eb&&eb!==\"img\")text[eb]=(text[eb]||0)+len}\n  var page=hex(getComputedStyle(document.body).backgroundColor)||hex(getComputedStyle(document.documentElement).backgroundColor);\n  document.documentElement.setAttribute(\"data-dsc-colors\",JSON.stringify({page:page,bg:bg,btn:btn,link:link,text:text}));\n})();";

type RenderedColors = { page: string | null; bg: Record<string, number>; btn: Record<string, number>; link: Record<string, number>; text: Record<string, number> };

/** The page as a visitor sees it, read by PALETTE_PROBE_JS. Null without a
 *  Browser Run token or on any failure: the caller falls back to the CSS. */
export async function readRenderedColors(url: string): Promise<RenderedColors | null> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = (process.env.CLOUDFLARE_BROWSER_TOKEN || process.env.CLOUDFLARE_API_TOKEN)?.trim();
  if (!account || !token) return null;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/content`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        viewport: { width: 1280, height: 800 },
        gotoOptions: { waitUntil: "load", timeout: 20_000 },
        addScriptTag: [{ content: PALETTE_PROBE_JS }],
        rejectResourceTypes: ["media", "font"],
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = await readCapped(res, 4_000_000);
    const json = JSON.parse(body) as { success?: boolean; result?: string };
    const m = typeof json.result === "string" ? json.result.match(/data-dsc-colors="([^"]{2,20000})"/) : null;
    if (!m) return null;
    const raw = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")) as Partial<RenderedColors>;
    const clean = (o: unknown): Record<string, number> => {
      const out: Record<string, number> = {};
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (isHex(k) && typeof v === "number" && Number.isFinite(v)) out[expandHex(k)] = v;
      return out;
    };
    return { page: typeof raw.page === "string" && isHex(raw.page) ? raw.page : null, bg: clean(raw.bg), btn: clean(raw.btn), link: clean(raw.link), text: clean(raw.text) };
  } catch {
    return null;
  }
}

/** Accent and mode from what the page showed. In order of trust: a
 *  saturated button fill, a saturated link colour seen twice, a saturated
 *  bar or block by area; a site with none of those is black and white and
 *  keeps its own link colour. The mode is the surface the paragraphs sit
 *  on (a dark <body> hidden behind a white wrapper is common), else the
 *  body's own background. */
export function themeFromRendered(c: RenderedColors): { accent: string | null; mode: "light" | "dark" } {
  const ranked = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const surface = ranked(c.text)[0]?.[0] ?? c.page ?? "#ffffff";
  const mode: "light" | "dark" = luminance(surface) < 0.2 ? "dark" : "light";
  const pick =
    ranked(c.btn).find(([h]) => isBrandish(h))?.[0] ??
    ranked(c.link).find(([h, n]) => n >= 2 && isBrandish(h))?.[0] ??
    ranked(c.bg).find(([h, a]) => a >= 4_000 && isBrandish(h))?.[0] ??
    null;
  if (pick) return { accent: pick, mode };
  const ink = ranked(c.link).find(([h]) => (mode === "light" ? luminance(h) < 0.1 : luminance(h) > 0.6))?.[0] ?? null;
  return { accent: ink, mode };
}

/** The CSS a page carries inline: <style> blocks and style="" attributes. */
function inlineCss(html: string): string {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const attrs = [...html.matchAll(/\sstyle=["']([^"']{3,400})["']/gi)].map((m) => `x{${m[1]}}`);
  return blocks.join("\n") + "\n" + attrs.join("\n");
}

/** Shared stylesheets that describe a library or a builder's component
 *  kit, never one site's brand. */
const GENERIC_CSS_HOST = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|use\.fontawesome\.com|use\.typekit\.net|definitions\.sqspcdn\.com|code\.jquery\.com)$/;
const GENERIC_CSS_PATH = /font|icon|fancybox|social|normalize|reset\.css|bootstrap|animate|swiper|slick|lightbox|\/css\/sites\.css|\/css\/old\//i;

/** Up to three of the page's stylesheets that can say something about this
 *  site's look: its own host's first, in page order, then other public
 *  hosts last-listed first (a builder links its shared kit before the
 *  site's own sheet). Library and builder-kit sheets are skipped. */
export function siteStylesheets(html: string, pageUrl: string): string[] {
  let host: string;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }
  const own: string[] = [];
  const other: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const u = new URL(href.replace(/&amp;/g, "&"), pageUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (GENERIC_CSS_PATH.test(u.pathname) || GENERIC_CSS_HOST.test(u.hostname)) continue;
      (u.hostname.replace(/^www\./, "") === host ? own : other).push(u.toString());
    } catch {
      // unreadable href
    }
  }
  return [...own, ...other.reverse()].slice(0, 3);
}

/** A stylesheet on another public host (a builder's CDN). Each redirect hop
 *  is re-checked, and private, internal and literal-IP hosts are refused,
 *  the same rule fetchProjectUrl applies to the site itself. */
async function fetchPublicCss(url: string): Promise<Response | null> {
  let target = url;
  for (let hop = 0; hop <= 3; hop++) {
    let u: URL;
    try {
      u = new URL(target);
    } catch {
      return null;
    }
    if ((u.protocol !== "https:" && u.protocol !== "http:") || isPrivateHost(u.hostname)) return null;
    let res: Response;
    try {
      res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(5_000), headers: { "user-agent": "DispatchSEO-Theme/1.0 (+https://dispatchseo.com)" } });
    } catch {
      return null;
    }
    if (res.status < 300 || res.status > 399) return res;
    const loc = res.headers.get("location");
    await res.body?.cancel().catch(() => undefined);
    if (!loc) return null;
    target = new URL(loc, target).toString();
  }
  return null;
}

export function extractThemeFromHtml(html: string, pageUrl: string, css = ""): HostedTheme {
  const head = html.slice(0, 120_000);
  const meta = (name: string, attr = "name") => {
    const m =
      head.match(new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']+)["']`, "i")) ??
      head.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${name}["']`, "i"));
    return m ? m[1].trim() : null;
  };
  const link = (rels: string[]) => {
    for (const rel of rels) {
      const m =
        head.match(new RegExp(`<link[^>]*rel=["'][^"']*\\b${rel}\\b[^"']*["'][^>]*href=["']([^"']+)["']`, "i")) ??
        head.match(new RegExp(`<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*\\b${rel}\\b[^"']*["']`, "i"));
      if (m) return m[1].trim();
    }
    return null;
  };
  const abs = (u: string | null) => {
    if (!u) return null;
    try {
      return new URL(u, pageUrl).toString();
    } catch {
      return null;
    }
  };

  const themeColor = meta("theme-color");
  const scheme = meta("color-scheme");
  // The CSS reading comes first and the meta tags below override it: a
  // theme-color the owner set on purpose outranks a vote count.
  const fromCss = themeFromCss(inlineCss(html) + "\n" + css);
  let mode: "light" | "dark" = fromCss.dark ? "dark" : "light";
  // No brand colour at all (a black-and-white site): its own text colour is
  // the accent, so the blog and its covers stay black and white too - a
  // stock blue would be the one colour on the page the site never uses.
  // Only when the site's CSS was actually read; nothing read = the default.
  let accent = fromCss.accent ?? (fromCss.ink && mode === "light" ? fromCss.ink : DEFAULT_THEME.accent);
  if (themeColor && isHex(themeColor)) {
    const l = luminance(themeColor);
    // theme-color is the browser chrome colour: for most sites that IS the
    // brand colour, but a near-black or near-white value is the page
    // background, which tells us the mode and nothing about the accent.
    if (l < 0.08) mode = "dark";
    else if (l > 0.9) mode = "light";
    else accent = expandHex(themeColor);
  }
  if (scheme && /dark/.test(scheme) && !/light/.test(scheme)) mode = "dark";
  // A dark body background declared inline is the other common tell.
  if (/<(?:body|html)[^>]*(?:class|style)=["'][^"']*(?:\bdark\b|bg-neutral-9|bg-black|bg-gray-9|bg-slate-9|background:\s*#0)/i.test(head)) mode = "dark";

  const logo = abs(link(["apple-touch-icon", "icon", "shortcut icon"])) ?? abs(meta("og:image", "property"));
  return { accent: readableAccent(accent, mode), mode, logo, source: "site" };
}

/** Read the theme from the project's homepage. Null when it cannot be read;
 *  callers keep whatever theme they had. */
export async function readSiteTheme(project: Pick<Project, "domain">): Promise<{ theme: HostedTheme; origin: string } | null> {
  const url = `https://${project.domain.replace(/^www\./, "")}/`;
  const res = await fetchProjectUrl(url, project.domain, { timeoutMs: 6_000, userAgent: "DispatchSEO-Theme/1.0 (+https://dispatchseo.com)" });
  if (!res || !res.ok) return null;
  let html = "";
  try {
    html = await readCapped(res, 300_000);
  } catch {
    return null;
  }
  // The origin the site actually serves from: apex sites that redirect to
  // www (or the reverse) would otherwise get canonical urls that redirect.
  let origin: string;
  try {
    origin = new URL(res.url || url).origin;
  } catch {
    origin = url.replace(/\/$/, "");
  }
  // The site's own stylesheets, read in parallel and capped: the brand
  // colour of most sites lives here, not in a meta tag.
  const sheets = await Promise.all(
    siteStylesheets(html, res.url || url).map(async (href) => {
      const own = isProjectUrl(href, project.domain);
      const r = own ? await fetchProjectUrl(href, project.domain, { timeoutMs: 5_000, userAgent: "DispatchSEO-Theme/1.0 (+https://dispatchseo.com)" }) : await fetchPublicCss(href);
      if (!r || !r.ok) {
        await r?.body?.cancel().catch(() => undefined);
        return "";
      }
      try {
        return await readCapped(r, 600_000);
      } catch {
        return "";
      }
    }),
  );
  const fromCss = extractThemeFromHtml(html, res.url || url, sheets.join("\n"));
  // What a visitor sees outranks what the stylesheets declare (header).
  const rendered = await readRenderedColors(res.url || url);
  if (rendered) {
    const seen = themeFromRendered(rendered);
    if (seen.accent) return { theme: { ...fromCss, accent: readableAccent(seen.accent, seen.mode), mode: seen.mode }, origin };
    return { theme: { ...fromCss, mode: seen.mode }, origin };
  }
  return { theme: fromCss, origin };
}
