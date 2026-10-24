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
// Everything else about a site's look lives in its CSS and is not worth
// guessing at: an accent colour on a neutral page is what makes a blog read
// as the site's own, and that is the one thing this extracts. The owner can
// override every field on Settings.

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

export function extractThemeFromHtml(html: string, pageUrl: string): HostedTheme {
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
  let accent = DEFAULT_THEME.accent;
  let mode: "light" | "dark" = "light";
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
  if (/<body[^>]*(?:class|style)=["'][^"']*(?:dark|bg-neutral-9|bg-black|bg-gray-9|bg-slate-9|background:\s*#0)/i.test(head)) mode = "dark";

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
    html = (await res.text()).slice(0, 300_000);
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
  return { theme: extractThemeFromHtml(html, res.url || url), origin };
}
