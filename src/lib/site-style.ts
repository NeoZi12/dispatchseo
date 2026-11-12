import type { Project } from "@/lib/projects";

// A site's own article style, for the rare repo site whose articles have a
// house look the engine's defaults would break.
//
// WHY IT EXISTS. mia-tax.co.il (2026-11-12) moved from the agent pipeline to
// the hosted writer with 47 articles already live in one fixed shape: a light
// navy cover, three inline Hebrew diagrams per article, a frontmatter contract
// its own parser reads (unquoted single-line values; `excerpt`,
// `meta_description`, `keywords`), Latin transliterated slugs, and a markdown
// renderer that prints raw HTML as text. The engine's defaults - a dark house
// cover, one description key, Hebrew slugs, the hidden <span> signature -
// each break one of those.
//
// WHERE IT LIVES. A raw key inside projects.content_prefs (`site_style`), the
// way banned_claims and require_sources already do: set by SQL, operator-only,
// no tool, no UI, no migration. content-prefs-store merges patches over the
// stored object, so a later Settings save never drops it.
//
// THE CONTRACT: absent or malformed = null, and null changes NOTHING. Every
// caller reads `siteStyleOf(project)` and keeps its existing path when it is
// null, so no other site's output moves by a byte.

export type CoverPalette = {
  /** The canvas colour. */
  bg: string;
  /** Outlines and dark details. */
  ink: string;
  /** The main colour of the drawing. */
  accent: string;
  /** Shadow sides and key lines. */
  deep: string;
  /** Secondary objects. */
  neutral: string;
  /** Icon bodies and cards (what the illustrator draws as #ffffff). */
  paper: string;
};

export type FrontmatterSource = "title" | "description" | "date" | "cover" | "keyword";

export type FrontmatterLine =
  | { key: string; from: FrontmatterSource }
  /** A constant, written only when `when` (if given) has a phrase found in
   *  the article's title or primary keyword. */
  | { key: string; value: string; when?: string[] };

export type SiteStyle = {
  cover: {
    palette: CoverPalette;
    /** What the cover shows and how it is composed, in place of the engine's
     *  own brief. Operator text, trusted. */
    brief: string | null;
  } | null;
  /** Inline diagrams in the article body (lib/article-figures.ts). */
  figures: { max: number; brief: string } | null;
  /** The article file's frontmatter, line by line, in place of mirroring a
   *  neighbour post. Values are written bare (no YAML quoting): the site's
   *  own parser reads a line as key: value and would print an escaped quote. */
  frontmatter: FrontmatterLine[] | null;
  /** Slugs in Latin letters only (a transliteration), never the article's
   *  own script. */
  latinSlugs: boolean;
  /** The site's markdown renderer prints raw HTML as text: no hidden
   *  signature element and no HTML credit line in the file. */
  plainBody: boolean;
  /** No closing "site name: pitch" line - the site's template has its own. */
  noClosingCta: boolean;
  /** The label the opening summary callout carries in the file, in place of
   *  "TL;DR" (the writer and its gate keep "TL;DR"; only the file differs). */
  tldrLabel: string | null;
};

const HEX = /^#[0-9a-f]{6}$/i;
const KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,40}$/;
const SOURCES: FrontmatterSource[] = ["title", "description", "date", "cover", "keyword"];

function text(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function paletteOf(raw: unknown): CoverPalette | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const names = ["bg", "ink", "accent", "deep", "neutral", "paper"] as const;
  const out = {} as Record<(typeof names)[number], string>;
  for (const n of names) {
    const v = o[n];
    if (typeof v !== "string" || !HEX.test(v)) return null;
    out[n] = v.toLowerCase();
  }
  return out;
}

function frontmatterOf(raw: unknown): FrontmatterLine[] | null {
  if (!Array.isArray(raw)) return null;
  const lines: FrontmatterLine[] = [];
  for (const item of raw.slice(0, 20)) {
    const o = (item ?? {}) as Record<string, unknown>;
    if (typeof o.key !== "string" || !KEY.test(o.key)) return null;
    if (typeof o.from === "string" && (SOURCES as string[]).includes(o.from)) {
      lines.push({ key: o.key, from: o.from as FrontmatterSource });
      continue;
    }
    const value = text(o.value, 200);
    if (!value || /[\r\n]/.test(value)) return null;
    const when = Array.isArray(o.when) ? o.when.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim()).slice(0, 20) : undefined;
    lines.push(when?.length ? { key: o.key, value, when } : { key: o.key, value });
  }
  // A file with no title or no date is not an article on any site.
  const has = (from: FrontmatterSource) => lines.some((l) => "from" in l && l.from === from);
  return has("title") && has("date") ? lines : null;
}

/** The site's own style, or null (the engine's defaults, untouched). A part
 *  that does not read cleanly is dropped on its own; the rest still applies. */
export function siteStyleOf(project: Pick<Project, "content_prefs">): SiteStyle | null {
  const prefs = (project.content_prefs ?? {}) as Record<string, unknown>;
  const raw = prefs.site_style;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const coverRaw = (o.cover ?? null) as Record<string, unknown> | null;
  const palette = coverRaw ? paletteOf(coverRaw.palette) : null;
  const figuresRaw = (o.figures ?? null) as Record<string, unknown> | null;
  const figuresBrief = figuresRaw ? text(figuresRaw.brief, 4000) : null;
  const max = figuresRaw && typeof figuresRaw.max === "number" && Number.isFinite(figuresRaw.max) ? Math.max(1, Math.min(4, Math.floor(figuresRaw.max))) : 3;

  return {
    cover: palette ? { palette, brief: text(coverRaw?.brief, 3000) } : null,
    figures: figuresBrief ? { max, brief: figuresBrief } : null,
    frontmatter: frontmatterOf(o.frontmatter),
    latinSlugs: o.latin_slugs === true,
    plainBody: o.plain_body === true,
    noClosingCta: o.no_closing_cta === true,
    tldrLabel: text(o.tldr_label, 40),
  };
}

const HEBREW: Record<string, string> = {
  א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t", י: "y", כ: "k", ך: "k", ל: "l", מ: "m", ם: "m",
  נ: "n", ן: "n", ס: "s", ע: "a", פ: "p", ף: "f", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
};

/** A slug in Latin letters, digits and hyphens only. The planner is asked for
 *  a proper transliteration on a `latinSlugs` site; this is the floor under
 *  it when it answers in the article's own script anyway: Hebrew letter by
 *  letter (consonants only, so it reads rough but is stable and unique),
 *  anything else dropped. Empty = the caller's fallback. */
export function latinSlug(slug: string): string {
  return [...slug.toLowerCase().normalize("NFKD")]
    .map((ch) => HEBREW[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** A section's heading, reduced for matching a reworded one. */
export const normHeading = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The body with each figure as an image line at the END of its section
 *  (before the next H2, or at the end of the body). A figure whose heading
 *  is not in this body is left out. */
export function withFigures(body: string, figures: { heading: string; alt: string; ref: string }[]): string {
  if (!figures.length) return body;
  const lines = body.split("\n");
  // Bottom up, so an insert never moves a section still to be handled.
  const placed = figures
    .map((f) => ({ f, at: lines.findIndex((l) => /^##\s+/.test(l) && normHeading(l.replace(/^##\s+/, "")) === normHeading(f.heading)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => b.at - a.at);
  for (const { f, at } of placed) {
    let end = lines.findIndex((l, i) => i > at && /^##\s+/.test(l));
    if (end < 0) end = lines.length;
    while (end > at + 1 && lines[end - 1].trim() === "") end--;
    lines.splice(end, 0, "", `![${f.alt.replace(/[\[\]{}<>\\`]/g, " ").replace(/\s+/g, " ").trim()}](${f.ref})`);
  }
  return lines.join("\n");
}
