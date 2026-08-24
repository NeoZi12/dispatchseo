// Pure-ish H1-tag analysis behind the H1 Tag Checker widget. Parses pasted
// page HTML with DOMParser (browser-only - no fetch, no backend, nothing
// pasted ever leaves the tab) and scores each <h1> found against an optional
// target keyword using the same stopword-filtered term-overlap approach as
// the site's other analyzers (see internal-linking-analysis.ts).

export type LengthVerdict = "short" | "good" | "long";

export type H1Finding = {
  text: string;
  length: number;
  lengthVerdict: LengthVerdict;
  matchedTerms: string[];
  missingTerms: string[];
  /** 0-1: share of the target keyword's significant words found verbatim in this H1. Null when no keyword was given. */
  keywordScore: number | null;
};

export type IssueSeverity = "error" | "warning" | "info";

export type H1Issue = {
  severity: IssueSeverity;
  title: string;
  detail: string;
};

export type H1CheckResult = {
  looksLikeHtml: boolean;
  h1s: H1Finding[];
  issues: H1Issue[];
};

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have if in into is it its of on or " +
    "that the this to was were will with your you"
  ).split(" "),
);

const MAX_HTML_CHARS = 300000;
export const H1_MIN_CHARS = 15;
export const H1_MAX_CHARS = 70;

function isContentWord(token: string): boolean {
  return token.length >= 3 && !STOPWORDS.has(token);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function lengthVerdict(len: number): LengthVerdict {
  if (len < H1_MIN_CHARS) return "short";
  if (len > H1_MAX_CHARS) return "long";
  return "good";
}

// Word-boundary, case-insensitive check: does `term` appear verbatim in `text`?
function containsTerm(term: string, text: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function scoreAgainstKeyword(
  h1Text: string,
  keyword: string,
): { matched: string[]; missing: string[]; score: number | null } {
  const terms = [...new Set(tokenize(keyword).filter(isContentWord))];
  if (terms.length === 0) return { matched: [], missing: [], score: null };
  const matched = terms.filter((t) => containsTerm(t, h1Text));
  const missing = terms.filter((t) => !matched.includes(t));
  return { matched, missing, score: matched.length / terms.length };
}

export function checkH1s(html: string, keyword: string): H1CheckResult {
  const doc = new DOMParser().parseFromString(html.slice(0, MAX_HTML_CHARS), "text/html");
  const looksLikeHtml = doc.body.querySelectorAll("*").length > 0;

  const h1Texts = [...doc.querySelectorAll("h1")]
    .map((el) => (el.textContent ?? "").trim())
    .filter((text) => text.length > 0);

  const trimmedKeyword = keyword.trim();
  const h1s: H1Finding[] = h1Texts.map((text) => {
    const { matched, missing, score } = trimmedKeyword
      ? scoreAgainstKeyword(text, trimmedKeyword)
      : { matched: [], missing: [], score: null };
    return {
      text,
      length: text.length,
      lengthVerdict: lengthVerdict(text.length),
      matchedTerms: matched,
      missingTerms: missing,
      keywordScore: score,
    };
  });

  const issues: H1Issue[] = [];

  if (!looksLikeHtml) {
    issues.push({
      severity: "info",
      title: "That doesn't look like HTML",
      detail:
        'Paste your page\'s HTML source, not plain text - right-click the page and choose "View Page Source" (or open dev tools and copy the <body> markup), then paste the whole thing in.',
    });
  } else if (h1s.length === 0) {
    issues.push({
      severity: "error",
      title: "No H1 tag found",
      detail:
        "Every page should have one clear heading that states what the page is about. Add a single <h1> wrapping your main heading.",
    });
  } else if (h1s.length > 1) {
    issues.push({
      severity: "warning",
      title: `${h1s.length} H1 tags found`,
      detail:
        "Google's own SEO starter guide says heading order and count don't affect ranking - multiple H1s won't get you penalized. But one clear H1 is still easier for readers and screen readers to follow, so unless these are deliberately separate document sections, consolidate to one and demote the rest to H2.",
    });
  }

  for (const h1 of h1s) {
    if (h1.lengthVerdict === "short") {
      issues.push({
        severity: "info",
        title: `"${h1.text}" is short (${h1.length} characters)`,
        detail:
          "No official limit, but a very short H1 often reads as generic. Consider stating specifically what the page covers.",
      });
    } else if (h1.lengthVerdict === "long") {
      issues.push({
        severity: "info",
        title: `"${h1.text}" is long (${h1.length} characters)`,
        detail:
          "No official limit, but an H1 this long is harder to scan. Consider tightening it to the core of what the page is about.",
      });
    }
    if (h1.keywordScore !== null && h1.keywordScore < 1) {
      issues.push({
        severity: h1.keywordScore === 0 ? "warning" : "info",
        title: `"${h1.text}" doesn't fully match your target keyword`,
        detail: `Missing: ${h1.missingTerms.join(", ")}. The H1 doesn't have to quote the keyword exactly, but working these words in makes the page's topic clearer to both readers and search engines.`,
      });
    }
  }

  return { looksLikeHtml, h1s, issues };
}
