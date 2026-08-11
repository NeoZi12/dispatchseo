// Pure, client-safe logic behind the SEO Title Length Checker widget: turns
// a title/description pair into truncation verdicts and a Google-style
// breadcrumb. No network calls; the one DOM-dependent piece (actual pixel
// measurement) is injected as a callback so this stays hand-testable, same
// split as internal-linking-analysis.ts and faq-schema.ts.
//
// Thresholds are sourced, not guessed: Google's own docs
// (developers.google.com/search/docs/appearance/title-link and .../snippet)
// state there is no fixed limit - titles and snippets are truncated "as
// needed, typically to fit the device width." For a practical number to
// check against, Semrush's guides (semrush.com/blog/title-tag,
// semrush.com/blog/meta-description) give: titles "550 pixels or fewer,
// typically 50-60 characters," and descriptions a recommended 135-character
// safe max with an observed average snippet length of 146.28 characters on
// desktop and 135.87 on mobile before truncation. These are practical
// community-measured figures, not a Google-guaranteed cutoff - the widget
// says so rather than presenting them as gospel.

export const TITLE_MAX_PX = 550;
export const TITLE_SAFE_PX = 500;
export const TITLE_CHAR_MIN = 50;
export const TITLE_CHAR_MAX = 60;

export const DESC_SAFE_CHARS = 135;
export const DESC_DESKTOP_AVG_CHARS = 146;
export const DESC_MOBILE_AVG_CHARS = 136;

export type Verdict = "safe" | "close" | "truncated";
export type Device = "desktop" | "mobile";

export function titleVerdict(px: number): Verdict {
  if (px <= 0) return "safe";
  if (px < TITLE_SAFE_PX) return "safe";
  if (px <= TITLE_MAX_PX) return "close";
  return "truncated";
}

export function descriptionVerdict(chars: number, device: Device): Verdict {
  if (chars <= 0) return "safe";
  const avg = device === "desktop" ? DESC_DESKTOP_AVG_CHARS : DESC_MOBILE_AVG_CHARS;
  if (chars <= DESC_SAFE_CHARS) return "safe";
  if (chars <= avg) return "close";
  return "truncated";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  safe: "Safe",
  close: "Cutting it close",
  truncated: "Will likely get cut off",
};

// Google shows a domain then each path segment separated by "›" in the
// breadcrumb line above the title. Falls back to a placeholder domain so the
// preview still reads sensibly with no URL typed yet.
export function buildBreadcrumb(rawUrl: string): { domain: string; segments: string[] } {
  const fallback = { domain: "yoursite.com", segments: [] as string[] };
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallback;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const segments = url.pathname.split("/").filter(Boolean);
    return { domain: url.hostname.replace(/^www\./, ""), segments };
  } catch {
    return fallback;
  }
}

// Binary search for the longest prefix of `text` whose measured pixel width
// (via the injected `measure` callback) fits within `maxPx`, then appends an
// ellipsis - mirrors how Google visually truncates rather than just flagging
// over-budget text with a label.
export function truncateAtPixelWidth(text: string, maxPx: number, measure: (s: string) => number): string {
  if (measure(text) <= maxPx) return text;

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}...`;
    if (measure(candidate) <= maxPx) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${text.slice(0, lo).trimEnd()}...`;
}

export function truncateAtChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}...`;
}
