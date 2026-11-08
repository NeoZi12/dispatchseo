import { fetchProjectUrl } from "@/lib/url-guard";
import type { Project } from "@/lib/projects";

// The hosted blog's colours and logo, read from the site itself.
//
// One fetch of the homepage when the hosted route is switched on (and again
// on demand from Settings). What a homepage reliably says about itself:
//   <meta name="theme-color">                the brand colour, when set
//   <meta name="color-scheme"> / theme-color  light or dark
//   <link rel="icon"/"apple-touch-icon">      a logo-ish mark
//   <meta property="og:image">                a wide brand image (fallback)
// Most sites set none of those (a Weebly vet clinic, a Wix studio), so the
// site's own CSS is read too: inline <style> blocks and up to three of its
// own stylesheets. The accent is the saturated colour the site leans on
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
const MAX_CSS_CHARS = 600_000;

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

/** The CSS a page carries inline: <style> blocks and style="" attributes. */
function inlineCss(html: string): string {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const attrs = [...html.matchAll(/\sstyle=["']([^"']{3,400})["']/gi)].map((m) => `x{${m[1]}}`);
  return blocks.join("\n") + "\n" + attrs.join("\n");
}

/** Up to three of the page's stylesheets on the site's own host - a
 *  platform's shared CDN stylesheet (the builder's base CSS) says nothing
 *  about this site's brand and is skipped. */
export function ownStylesheets(html: string, pageUrl: string): string[] {
  let host: string;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const u = new URL(href, pageUrl);
      if (u.hostname.replace(/^www\./, "") !== host) continue;
      if (/font|icon|fancybox|social/i.test(u.pathname)) continue;
      out.push(u.toString());
    } catch {
      // unreadable href
    }
    if (out.length >= 3) break;
  }
  return out;
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
    ownStylesheets(html, res.url || url).map(async (href) => {
      const r = await fetchProjectUrl(href, project.domain, { timeoutMs: 5_000, userAgent: "DispatchSEO-Theme/1.0 (+https://dispatchseo.com)" });
      if (!r || !r.ok) return "";
      try {
        return await readCapped(r, 200_000);
      } catch {
        return "";
      }
    }),
  );
  return { theme: extractThemeFromHtml(html, res.url || url, sheets.join("\n")), origin };
}
