// The server-side quality gate for AI-written articles.
//
// WHY THIS FILE EXISTS: the product is moving to a model where the CUSTOMER'S
// OWN coding agent or chat AI writes the article - their ChatGPT Plus, Claude
// Pro, Claude Code, Codex, or Cursor. Those clients are wildly inconsistent: a
// chat app skips half a playbook a coding agent follows exactly, a cheap model
// leaves in "as an AI, I cannot..." boilerplate, a rushed run pastes the whole
// draft inside a code fence instead of writing the article. If quality depended
// on which client showed up, we could not promise a ChatGPT user the same
// standard as a Claude Code user. So quality is enforced HERE, once, identically,
// no matter who submitted the draft.
//
// This module is intentionally a closed box: pure functions only, no fetch, no
// database, no env vars, nothing async. Every fact it needs is passed in via
// `submission` and `context`. That is what makes it cheap to call on every
// submission (including every retry) and trivial to unit test with plain
// objects - no mocking, no network, no flakiness.
//
// THE "fix" FIELD IS THE PRODUCT. Every failing check writes its `fix` string
// to be read by the AI that submitted the draft, not by a human. It has to
// name the exact thing to change and the exact target ("expand X to at least N
// words"), because a rejection that just says "word count too low" costs the
// customer's own AI quota on a whole extra round trip to guess what "better"
// means. Vague fixes are a bug in this file, not a style nit.
//
// EXTENDING THIS FILE: every check is one entry in the `defs` array inside
// validateArticle(). To add a check, add one object with an `id`, a
// `severity`, and a `run()` that returns { passed, title, detail, fix }. Never
// scatter validation logic outside that array - the whole point is that the
// full rulebook lives in one place a reviewer can read top to bottom.

// --- Public types ----------------------------------------------------------

export type FaqPair = {
  question: string;
  answer: string;
};

export type SourceRef = {
  url: string;
  title?: string;
};

export type ArticleSubmission = {
  title: string;
  slug: string;
  metaDescription: string;
  primaryKeyword: string;
  markdown: string;
  faq?: FaqPair[];
  sources?: SourceRef[];
  /** Free-text brief for a cover image generator elsewhere in the pipeline.
   *  Deliberately not validated here - it never reaches the published page
   *  as text, so none of the content-quality checks below apply to it. */
  coverBrief?: string;
};

export type ValidationContext = {
  /** Loose content-type hint ("listicle", "comparison", "how-to", ...). Only
   *  used today to decide whether a list/table is required rather than a
   *  nice-to-have - see `listMandatory` below. */
  archetype?: string;
  minWords?: number;
  maxWords?: number;
  /** When true, the sources-present check becomes blocking instead of a
   *  friendly suggestion. Per-project, since not every site needs citations
   *  (a local plumber's FAQ page does not need footnotes). */
  requireSources?: boolean;
  bannedClaims?: string[];
  existingTitles?: string[];
  existingSlugs?: string[];
  siteName?: string;
  /** ISO code of the article's language. Only matters for scripts written
   *  without spaces (th, ja, zh), where words must be segmented. */
  lang?: string;
};

export type CheckSeverity = "blocking" | "advisory";

export type Check = {
  id: string;
  severity: CheckSeverity;
  passed: boolean;
  title: string;
  /** What a human (or the dashboard) sees: what was measured. */
  detail: string;
  /** What the SUBMITTING AI sees on retry: a specific, actionable instruction.
   *  Empty string when passed - there is nothing to fix. */
  fix: string;
};

export type ValidationReport = {
  /** True only when every BLOCKING check passed. Advisory failures never
   *  block publish - they are logged so the dashboard can nudge quality up
   *  over time without costing the customer a round trip every time. */
  ok: boolean;
  /** 0-100. Weighted so blocking checks count for more than advisory ones -
   *  see computeScore() below for the exact formula. A quick signal for a
   *  dashboard progress bar; `ok` is the real gate. */
  score: number;
  checks: Check[];
  blocking: Check[];
  advisory: Check[];
};

export type HeadingNode = {
  level: number;
  text: string;
  /** 1-based line number in the original markdown, for pointing an editor
   *  (human or AI) at the exact spot. */
  line: number;
  children: HeadingNode[];
};

// --- Low-level text helpers --------------------------------------------------
//
// countWords() and extractOutline() are exported separately because several
// checks below need both, and the requirement is that they AGREE with each
// other (a "thin section" check that disagrees with the headline word count
// on how many words a section has would be a checker bug, not a content bug).
// The way that is guaranteed here is structural: every word count in this
// file - the whole-article count, the intro-window count, every per-section
// count - runs through the exact same wordsOf(stripMarkdownNoise(...)) pair.
// There is no second counting method anywhere in the file.

// A "word" is a run of letters/digits, optionally joined by a single
// apostrophe or hyphen ("don't", "e-commerce" both count as one word). This
// single regex is also what keeps markdown syntax out of every word count for
// free: "#", "*", "_", ">", "|", "-" as a list marker, backticks - none of
// those characters are word characters, so heading markers, emphasis markers,
// list bullets, and table pipes are never matched and never need separate
// stripping. Only actual markup that CONTAINS letters/digits (code, URLs)
// needs explicit removal below.
/** See the ceiling check at the top of validateArticle for why this exists. */
const MAX_MARKDOWN_CHARS = 200_000;

// Any script's letters and digits are words - Hebrew, Thai, Japanese and
// Arabic articles were counting as zero words under the old [A-Za-z0-9]
// pattern and failing every length check. Scripts written without spaces
// are segmented with Intl when the caller names the language.
const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;
const SPACELESS_LANGS = new Set(["th", "ja", "zh", "km", "lo", "my"]);
let segmenterLang: string | null = null;

function wordsOf(text: string): string[] {
  if (segmenterLang && typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      const seg = new Intl.Segmenter(segmenterLang, { granularity: "word" });
      const out: string[] = [];
      for (const s of seg.segment(text)) if (s.isWordLike) out.push(s.segment);
      return out;
    } catch {
      // fall through to the regex
    }
  }
  return text.match(WORD_RE) ?? [];
}

// Strips everything that would inflate a word count without being real prose:
// fenced and inline code (content, not just the backticks), image/link URLs
// (keeping the alt text / anchor text, which IS authored content), bare
// autolinks, and raw HTML tags (keeping their inner text). Order matters -
// fenced blocks must go first so a stray backtick or bracket inside a code
// sample never gets treated as inline-code or link syntax by the later steps.
function stripMarkdownNoise(markdown: string): string {
  let s = markdown;
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/~~~[\s\S]*?~~~/g, " ");
  s = s.replace(/`[^`\n]*`/g, " ");
  // The negated classes below exclude newlines, and that is load-bearing, not
  // tidiness. As `[^\]]*` they scanned to the END OF THE DOCUMENT from every
  // "[" that had no "]" after it, which is O(n^2) on model-authored text:
  // measured at 1.8s per pattern on 100KB of "![" repeated, and countWords()
  // runs this on every single submission. A markdown link never spans lines,
  // so bounding each attempt to one line costs nothing and removes the
  // document-length term. (The absolute size cap in validateArticle is the
  // other half of this fix - see MAX_MARKDOWN_CHARS.)
  // The includes() guard is the half that actually removes the quadratic
  // term. Excluding newlines above bounds each attempt to one LINE, which
  // does nothing when the whole document is a single 400KB line of "![" - and
  // that is exactly the shape measured at 2 seconds per pattern. With no "]"
  // anywhere there is no possible match, so the entire scan is skipped for
  // O(1). A document that does contain "]" is bounded by its own line lengths,
  // which real prose keeps short.
  if (s.includes("]")) {
    s = s.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, " $1 "); // image -> keep alt text
    s = s.replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, " $1 "); // link -> keep anchor text, drop URL
  }
  s = s.replace(/<https?:\/\/[^>\s]+>/gi, " "); // autolink
  s = s.replace(/\bhttps?:\/\/\S+/gi, " "); // bare URL
  s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?>/g, " "); // raw HTML tags
  return s;
}

/** Word count that ignores code blocks and link URLs, per the shared rule
 *  above. Every other word count in this file is this same pipeline applied
 *  to a slice of the markdown, so they can never disagree by construction. */
export function countWords(markdown: string): number {
  return wordsOf(stripMarkdownNoise(markdown)).length;
}

function proseWordsLower(markdown: string): string[] {
  return wordsOf(stripMarkdownNoise(markdown)).map((w) => w.toLowerCase());
}

/** For PLAIN fields that are not markdown - title, meta description, the
 *  primary keyword, an existing title to compare against. No code/URL
 *  stripping needed because none of that syntax is expected there; running
 *  the markdown-aware stripper on a plain string is harmless but pointless. */
function plainWordsLower(text: string): string[] {
  return wordsOf(text).map((w) => w.toLowerCase());
}

// --- Heading / outline extraction -------------------------------------------
//
// ATX headings only ("# Heading"). Setext headings ("Heading\n===") are
// deliberately unsupported: every AI client this gate has to accept writes
// ATX style by default, and supporting both would double the edge cases in
// the hierarchy checks for a form nobody actually submits.

/** Masks out fenced code block bodies (blank line per source line, so line
 *  numbers for headings elsewhere in the document stay accurate) and reports
 *  whether a fence was left open at end of file. Every other check that needs
 *  to ignore code - heading detection, the link/HTML/list checks - reuses
 *  this ONE fence scanner rather than re-implementing fence matching, so
 *  "is this line inside a code block" can never be answered two different
 *  ways in the same file. */
function fenceMask(markdown: string): { masked: string; unclosedFence: boolean } {
  const lines = markdown.split("\n");
  let inFence = false;
  let marker: "`" | "~" | null = null;
  const out: string[] = [];
  for (const line of lines) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      const ch = m[1][0] as "`" | "~";
      if (!inFence) {
        inFence = true;
        marker = ch;
        out.push("");
        continue;
      }
      if (ch === marker) {
        inFence = false;
        marker = null;
        out.push("");
        continue;
      }
    }
    out.push(inFence ? "" : line);
  }
  return { masked: out.join("\n"), unclosedFence: inFence };
}

type FlatHeading = { level: number; text: string; line: number };

function flatHeadings(markdown: string): FlatHeading[] {
  const { masked } = fenceMask(markdown);
  const lines = masked.split("\n");
  const heads: FlatHeading[] = [];
  lines.forEach((line, idx) => {
    // Up to three leading spaces is still a heading in CommonMark, and an AI
    // that indents its markdown is common enough that requiring column 0 made
    // a real H1 invisible to every heading check - and then told the author to
    // "add an H1" it had already written, which is the worst kind of fix
    // message. The fence scanner already tolerates the same three spaces.
    const m = /^ {0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
    if (!m) return;
    // Trim a CommonMark-style closing sequence ("## Heading ##") but only
    // when it is preceded by whitespace, so a heading that legitimately ends
    // in a hash character ("Learning C#") is never mangled.
    const text = m[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
    if (!text) return; // a line of bare "#####" is not a real heading
    heads.push({ level: m[1].length, text, line: idx + 1 });
  });
  return heads;
}

/** Builds the heading tree. Every H2-and-deeper node nests under the nearest
 *  preceding shallower heading, REGARDLESS of whether the level jump between
 *  them is valid - that is deliberate: it lets heading-hierarchy validation
 *  (findHierarchySkips, below) walk the same tree this returns rather than
 *  re-deriving nesting with its own logic. */
export function extractOutline(markdown: string): HeadingNode[] {
  const flat = flatHeadings(markdown);
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];
  for (const h of flat) {
    const node: HeadingNode = { ...h, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

/** A heading "skips a level" when it is more than one level deeper than its
 *  parent in the tree extractOutline() built - including a document that
 *  opens with an H2 or H3 before any H1 (parent level is then the implicit
 *  document root, level 0). */
function findHierarchySkips(nodes: HeadingNode[], parentLevel = 0): HeadingNode[] {
  const skips: HeadingNode[] = [];
  for (const n of nodes) {
    if (n.level - parentLevel > 1) skips.push(n);
    skips.push(...findHierarchySkips(n.children, n.level));
  }
  return skips;
}

/** Everything after the first H1's line - used for the "keyword in the first
 *  120 words" check, so a keyword that only appears in the H1 (already its
 *  own separate check) does not double-count as satisfying the intro check. */
function bodyAfterFirstH1(markdown: string): string {
  const flat = flatHeadings(markdown);
  const h1 = flat.find((h) => h.level === 1);
  if (!h1) return markdown;
  return markdown.split("\n").slice(h1.line).join("\n");
}

/** Per-H2 word count, sliced from the ORIGINAL markdown between this H2's
 *  line and the next heading at level <=2 (an H3/H4 under it stays part of
 *  its parent section's word count - the check is "is this section real",
 *  not "is every sub-heading independently long enough"). Reuses countWords()
 *  on the slice, so a section's reported word count always matches what
 *  countWords() would say about that same text on its own. */
function sectionWordCounts(
  markdown: string,
  flat: FlatHeading[],
): { heading: string; line: number; words: number }[] {
  const lines = markdown.split("\n");
  const h2s = flat.filter((h) => h.level === 2);
  return h2s.map((h) => {
    const startIdx = flat.findIndex((f) => f.line === h.line);
    let endLine = lines.length + 1;
    for (let i = startIdx + 1; i < flat.length; i++) {
      if (flat[i].level <= 2) {
        endLine = flat[i].line;
        break;
      }
    }
    const slice = lines.slice(h.line, endLine - 1).join("\n");
    return { heading: h.text, line: h.line, words: countWords(slice) };
  });
}

// --- Phrase matching (keyword presence / density) ---------------------------
//
// Deliberately NOT regex-based: primaryKeyword is caller-supplied text, and
// building a RegExp out of untrusted text means escaping it correctly or
// risking a broken/slow pattern. Matching a phrase as a contiguous run inside
// an already-tokenized word array sidesteps that entirely and also avoids the
// classic substring bug where a single-word keyword "cat" would match inside
// "category".

function occurrencesOfPhrase(haystack: string[], phrase: string[]): number {
  if (phrase.length === 0 || haystack.length < phrase.length) return 0;
  let count = 0;
  outer: for (let i = 0; i <= haystack.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      if (haystack[i + j] !== phrase[j]) continue outer;
    }
    count++;
  }
  return count;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// A short hand-picked stop-word list (not a dependency) used two places: (1)
// slug "stop-word soup" detection, (2) filtering near-duplicate title
// comparisons down to the words that actually carry meaning, so "The Best
// Guide To X" vs "A Complete Guide To X" is judged on {best/complete, guide,
// x}, not inflated by every article sharing "the/a/to".
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with", "by", "from", "as",
  "is", "are", "was", "were", "be", "been", "being", "it", "its", "this", "that", "these", "those",
  "you", "your", "we", "our", "they", "their", "he", "she", "his", "her", "them", "i", "my", "me", "us",
  "not", "no", "do", "does", "did", "can", "could", "will", "would", "should", "may", "might", "must",
  "have", "has", "had", "if", "than", "then", "so", "such", "up", "down", "out", "about", "into", "over",
  "under", "again", "further", "just", "also", "how", "what", "when", "where", "why", "which", "who", "whom",
]);

function slugify(text: string): string {
  return plainWordsLower(text).join("-").slice(0, 80).replace(/-+$/, "");
}

function significantTokens(title: string): Set<string> {
  return new Set(plainWordsLower(title).filter((w) => !STOP_WORDS.has(w) && w.length > 1));
}

// --- Source URL plausibility -------------------------------------------------
//
// This module never fetches a source URL - it has no network access, on
// purpose (see the file header). "Fabricated-looking" here means shape-only:
// a placeholder host, or a bare domain with no path, which is exactly what a
// model hallucinating a citation tends to produce ("https://example.com" or
// "https://healthline.com" with nothing after it) versus a real citation,
// which almost always points at a specific article path.

const FABRICATED_HOSTS = new Set([
  "example.com", "example.org", "example.net", "example.edu",
  "test.com", "yoursite.com", "yourdomain.com", "yourwebsite.com",
  "domain.com", "website.com", "site.com", "foo.com", "bar.com",
  "sample.com", "placeholder.com", "mysite.com", "company.com",
]);

function looksFabricatedSource(rawUrl: string): { bad: boolean; reason: string } {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { bad: true, reason: "not a valid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { bad: true, reason: "not an http(s) URL" };
  }
  const host = u.hostname.toLowerCase();
  // Compare the bare host AND the host with a leading "www." removed: an AI
  // citing "www.example.com" is inventing exactly as hard as one citing
  // "example.com", and an exact-set lookup let the first one through.
  const bareHost = host.replace(/^www\./, "");
  if (FABRICATED_HOSTS.has(host) || FABRICATED_HOSTS.has(bareHost)) {
    return { bad: true, reason: `"${host}" is a placeholder domain, not a real source` };
  }
  const path = u.pathname.replace(/\/+$/, "");
  if (!path) {
    return { bad: true, reason: "a bare domain with no article path - reads as a made-up citation" };
  }
  return { bad: false, reason: "" };
}

function normalizeUrlForDedupe(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

// --- Placeholder / model-artifact text ---------------------------------------
//
// This is the check that catches a half-finished draft, so it is deliberately
// the most heavily populated list in the file. Every pattern below is plain
// (no "g" flag) so it is safe to .test() repeatedly on a long-lived module -
// a "g" flag on a module-scoped regex reused with .test() would carry a stale
// lastIndex between calls and silently start missing matches.
//
// "anywhere" patterns can appear anywhere in the article. "tail" patterns are
// only checked in roughly the last paragraph - chat sign-offs like "let me
// know if you'd like changes" are a tail phenomenon; checking them everywhere
// would false-positive on a legitimate mid-article sentence.
type ArtifactPattern = { re: RegExp; label: string; scope: "anywhere" | "tail" };

const ARTIFACT_PATTERNS: ArtifactPattern[] = [
  { re: /lorem ipsum/i, label: 'placeholder text ("lorem ipsum")', scope: "anywhere" },
  { re: /\btodo\b/i, label: 'a "TODO" marker', scope: "anywhere" },
  { re: /\btbd\b/i, label: 'a "TBD" marker', scope: "anywhere" },
  { re: /\[insert\b/i, label: 'a "[insert ...]" placeholder', scope: "anywhere" },
  { re: /\bxxx\b/i, label: '"XXX" placeholder text', scope: "anywhere" },
  { re: /\bas an ai\b/i, label: 'the model referring to itself ("as an AI")', scope: "anywhere" },
  { re: /\bas a language model\b/i, label: 'the model referring to itself ("as a language model")', scope: "anywhere" },
  { re: /\bi cannot\b/i, label: 'a refusal-style phrase ("I cannot")', scope: "anywhere" },
  { re: /\bi can.?t\b/i, label: "a refusal-style phrase (\"I can't\")", scope: "anywhere" },
  { re: /\bi apologi[sz]e\b/i, label: 'an apology from the model ("I apologize")', scope: "anywhere" },
  {
    re: /\bhere is (?:a|the) (?:revised|updated|rewritten) (?:article|version|draft)\b/i,
    label: "chat framing left in from an editing pass",
    scope: "anywhere",
  },
  { re: /let me know if/i, label: 'a trailing chat sign-off ("let me know if...")', scope: "tail" },
  { re: /feel free to (?:ask|reach out|let me know)/i, label: 'a trailing chat sign-off ("feel free to...")', scope: "tail" },
  { re: /i hope (?:this|that) (?:helps|is helpful)/i, label: 'a trailing chat sign-off ("I hope this helps")', scope: "tail" },
  { re: /is there anything else/i, label: 'a trailing chat sign-off ("is there anything else...")', scope: "tail" },
  { re: /would you like me to/i, label: 'a trailing chat offer ("would you like me to...")', scope: "tail" },
];

/** Some chat clients paste the entire article back wrapped in one big code
 *  fence instead of writing the article itself. That is a shape problem the
 *  pattern list above can't catch (none of those phrases need to appear), so
 *  it gets its own dedicated check. */
function wholeDocWrappedInFence(markdown: string): boolean {
  const trimmed = markdown.trim();
  return (
    /^(`{3,}|~{3,})/.test(trimmed) &&
    /(`{3,}|~{3,})$/.test(trimmed) &&
    trimmed.split("\n").length > 5
  );
}

function normalizedText(markdown: string): string {
  return fenceMask(markdown).masked.replace(/\s+/g, " ").trim();
}

// --- Markdown-sanity regexes (module scope, no "g" where .test() is used) --

const LINK_RE = /\[([^\]\n]*)\]\(([^)\n]*)\)/g; // used only via matchAll(), which is state-safe
const RAW_HTML_TAG_RE = /<\s*\/?\s*(script|iframe|style)\b/i;
const LIST_RE = /^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+\S/m;

// A single markdown cell in a table's separator row: optional leading/trailing
// colon for alignment, dashes in between. Anchored, one character class, no
// adjacent quantifiers - it cannot backtrack.
const TABLE_SEPARATOR_CELL_RE = /^:?-+:?$/;

/**
 * Does this markdown contain a table? Deliberately a line scan rather than a
 * regex.
 *
 * The regex this replaced -
 *   /^[ \t]*\|.+\|[ \t]*\n[ \t]*\|?[ \t:-]*-{2,}[ \t:|-]*\|?[ \t]*$/m
 * - had two quantified character classes that both match "-" sitting either
 * side of `-{2,}`, so a line of N dashes that fails to match at the end costs
 * exponential time to prove. Measured on this machine: 200 dashes 29ms, 1000
 * dashes 0.6s, 3000 dashes 14.9s. The input here is an article written by a
 * CUSTOMER'S AI and passed straight in, so "a long run of dashes" is not a
 * hypothetical - a horizontal rule someone padded out, or a code block of
 * table art, would hang the request thread for the whole deployment.
 *
 * The scan below is linear and allocates nothing per line beyond the split.
 */
function hasTable(markdown: string): boolean {
  const lines = markdown.split("\n");
  for (let i = 0; i + 1 < lines.length; i++) {
    // Header row: must contain a pipe with something either side of it.
    if (!lines[i].includes("|")) continue;
    const cells = lines[i + 1]
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    if (cells.every((c) => TABLE_SEPARATOR_CELL_RE.test(c))) return true;
  }
  return false;
}
// Lower-case letters and digits of any script: a Hebrew or Thai site's slugs
// are in its own script (WordPress and Next.js both serve them), and an
// ASCII-only shape made every such article fail the gate.
const SLUG_SHAPE_RE = /^[\p{Ll}\p{Lo}\p{M}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{M}\p{N}]+)*$/u;

// --- Score ------------------------------------------------------------------

function computeScore(checks: Check[]): number {
  // Blocking checks count 3x an advisory one, so a single blocking failure
  // moves the score much more than an advisory nit - the number is meant to
  // read, at a glance, as "how close is this to publishable", not as a flat
  // percentage of boxes ticked.
  const WEIGHT: Record<CheckSeverity, number> = { blocking: 3, advisory: 1 };
  let earned = 0;
  let total = 0;
  for (const c of checks) {
    const w = WEIGHT[c.severity];
    total += w;
    if (c.passed) earned += w;
  }
  return total === 0 ? 100 : Math.round((earned / total) * 100);
}

// --- The gate -----------------------------------------------------------

type CheckDef = {
  id: string;
  severity: CheckSeverity;
  run: () => Omit<Check, "id" | "severity">;
};

export function validateArticle(
  submission: ArticleSubmission,
  context: ValidationContext = {},
): ValidationReport {
  const langBase = (context.lang ?? "").toLowerCase().split(/[-_]/)[0];
  segmenterLang = SPACELESS_LANGS.has(langBase) ? langBase : null;
  try {
    return validateArticleInner(submission, context);
  } finally {
    segmenterLang = null; // never leak one article's language into the next word count
  }
}

function validateArticleInner(submission: ArticleSubmission, context: ValidationContext): ValidationReport {
  // Computed once, reused by every check below - this is also what
  // guarantees the different checks can never disagree about the same fact
  // (e.g. the word-count check and the section-substance check both derive
  // from the same flatHeadings()/countWords() calls).
  // HARD SIZE CEILING, CHECKED BEFORE ANY PARSING TOUCHES THE TEXT.
  //
  // Every function below walks this string, several of them more than once,
  // and the input is written by a language model on the customer's side - so
  // its shape is not something we control or can predict. Two separate
  // quadratic scans have already been found in this file (a table regex that
  // took 15 seconds on 3000 dashes, and link/image patterns that took 1.8s per
  // pattern on 100KB of unmatched brackets). Both are fixed, but the honest
  // lesson is that the next one will not be spotted by reading either - so the
  // input itself is bounded, which caps the damage from whatever is found
  // next. 200,000 characters is roughly 30,000 words: an order of magnitude
  // past the longest article this product would ever want, so no real
  // submission can hit it, and anything that does is a bug or an accident
  // rather than someone's work being refused.
  if (submission.markdown.length > MAX_MARKDOWN_CHARS) {
    const tooBig: Check = {
      id: "article-too-long",
      severity: "blocking",
      passed: false,
      title: "Article is a workable length",
      detail: `The submitted article is ${submission.markdown.length.toLocaleString()} characters, past the ${MAX_MARKDOWN_CHARS.toLocaleString()} we accept.`,
      fix: `Something has gone wrong: this is far longer than an article should ever be. Send the article on its own, without any extra material pasted around it, and keep it under ${MAX_MARKDOWN_CHARS.toLocaleString()} characters.`,
    };
    return { ok: false, score: 0, checks: [tooBig], blocking: [tooBig], advisory: [] };
  }

  const flat = flatHeadings(submission.markdown);
  const outline = extractOutline(submission.markdown);
  const wordsLower = proseWordsLower(submission.markdown);
  const wordCount = wordsLower.length;
  const first120 = proseWordsLower(bodyAfterFirstH1(submission.markdown)).slice(0, 120);
  const sections = sectionWordCounts(submission.markdown, flat);
  const kwTokens = plainWordsLower(submission.primaryKeyword ?? "");

  // --- Thresholds, with the reasoning for each documented right where it is
  // used below. Anything caller-tunable reads from `context` with a default.
  const minWords = context.minWords ?? 900; // 900 words is the rough floor for a page Google treats as a real answer rather than a stub
  const maxWords = context.maxWords ?? 2500; // past ~2500 words engagement drops off and it usually means the draft rambled rather than covered more ground
  const TITLE_MIN = 45;
  const TITLE_MAX = 62; // Google typically renders ~50-60px-equivalent characters of a title before truncating with "..."
  const META_MIN = 110;
  const META_MAX = 158; // same idea for the meta description snippet
  const SECTION_FLOOR = 40; // ~2 short sentences - enough to prove a section isn't a heading with a placeholder line under it
  const STUFFING_MIN_OCCURRENCES = 4; // a handful of natural mentions is normal; only flag once there's real repetition to measure
  const STUFFING_DENSITY = 0.03; // 3% density is the conventional spam threshold; natural prose lands under 1-2%
  const SIMILARITY_THRESHOLD = 0.6; // 60% token overlap on a title is close enough to read as "the same article, again"
  const MIN_SIGNIFICANT_TOKENS = 3; // below this, almost any two titles overlap by chance - skip the comparison rather than false-flag

  const archetype = (context.archetype ?? "").toLowerCase();
  // A listicle/comparison piece without a list or table isn't just missing
  // polish, it's not actually the format it claims to be - so the same
  // scannability check becomes blocking for those archetypes instead of a
  // suggestion.
  const listMandatory = ["listicle", "list", "comparison", "vs", "roundup", "alternatives"].some((k) =>
    archetype.includes(k),
  );

  const defs: CheckDef[] = [
    // --- Structure ---------------------------------------------------------
    {
      id: "word-count-band",
      severity: "blocking",
      run: () => {
        const passed = wordCount >= minWords && wordCount <= maxWords;
        return {
          passed,
          title: "Word count is inside the target range",
          detail: `Article is ${wordCount} words (target ${minWords}-${maxWords}).`,
          fix: passed
            ? ""
            : wordCount < minWords
              ? `Add roughly ${minWords - wordCount} more words of real content - expand a thin section or add a section the outline is missing, rather than padding existing sentences.`
              : `Cut roughly ${wordCount - maxWords} words - tighten sections that repeat a point already made, rather than deleting a whole section.`,
        };
      },
    },
    {
      id: "single-h1",
      severity: "blocking",
      run: () => {
        const h1s = flat.filter((h) => h.level === 1);
        const passed = h1s.length === 1;
        return {
          passed,
          title: "Exactly one H1 heading",
          detail: `Found ${h1s.length} H1 heading(s)${h1s.length ? `: ${h1s.map((h) => `"${h.text}"`).join(", ")}` : ""}.`,
          fix: passed
            ? ""
            : h1s.length === 0
              ? "Add exactly one H1 (# Title) at the top of the article - it should read like the article's title, not a section heading."
              : "Keep only the first H1 and demote every other H1 to H2 (## ...) - a page must have exactly one H1.",
        };
      },
    },
    {
      id: "heading-hierarchy",
      severity: "blocking",
      run: () => {
        const skips = findHierarchySkips(outline);
        const passed = skips.length === 0;
        return {
          passed,
          title: "Heading levels never skip a level",
          detail: passed
            ? "Heading structure descends one level at a time."
            : `Found heading(s) that jump levels: ${skips.slice(0, 3).map((h) => `"${h.text}" (H${h.level})`).join(", ")}.`,
          fix: passed
            ? ""
            : "Fix the flagged heading(s) so the level only ever increases by one at a time (an H2 can be followed by an H3, never straight to an H4), and make sure the very first heading in the document is the H1.",
        };
      },
    },
    {
      id: "section-substance",
      severity: "blocking",
      run: () => {
        const thin = sections.filter((s) => s.words < SECTION_FLOOR);
        const passed = thin.length === 0;
        return {
          passed,
          title: "Every H2 section has real content under it",
          detail: passed
            ? "Every H2 section clears the minimum word floor."
            : thin.map((s) => `"${s.heading}" has only ${s.words} word(s)`).join("; "),
          fix: passed
            ? ""
            : thin
                .map(
                  (s) =>
                    `Expand "${s.heading}" (currently ${s.words} words) to at least ${SECTION_FLOOR} words, or merge it into the section before it.`,
                )
                .join(" "),
        };
      },
    },

    // --- Primary keyword -----------------------------------------------------
    {
      id: "keyword-in-title",
      severity: "blocking",
      run: () => {
        if (kwTokens.length === 0) {
          return {
            passed: false,
            title: "Primary keyword appears in the title",
            detail: "No primary keyword was given.",
            fix: "Set primaryKeyword to the exact phrase this article should rank for, then make sure it appears in the title.",
          };
        }
        const passed = occurrencesOfPhrase(plainWordsLower(submission.title), kwTokens) > 0;
        return {
          passed,
          title: "Primary keyword appears in the title",
          detail: passed
            ? `"${submission.primaryKeyword}" appears in the title.`
            : `The title does not contain "${submission.primaryKeyword}".`,
          fix: passed ? "" : `Work the exact phrase "${submission.primaryKeyword}" into the title.`,
        };
      },
    },
    {
      id: "keyword-in-intro",
      severity: "blocking",
      run: () => {
        if (kwTokens.length === 0) {
          return {
            passed: false,
            title: "Primary keyword appears early in the article",
            detail: "No primary keyword was given.",
            fix: "Set primaryKeyword, then use it once in the opening paragraph.",
          };
        }
        const passed = occurrencesOfPhrase(first120, kwTokens) > 0;
        return {
          passed,
          title: "Primary keyword appears early in the article",
          detail: passed
            ? `"${submission.primaryKeyword}" appears in the first 120 words after the title.`
            : `"${submission.primaryKeyword}" is missing from the first 120 words of the article body.`,
          fix: passed ? "" : `Add the exact phrase "${submission.primaryKeyword}" once, naturally, within the opening paragraph.`,
        };
      },
    },
    {
      id: "keyword-in-h2",
      // ADVISORY, deliberately, and it was blocking for about an hour on
      // 2026-08-18 before a test article made the problem obvious. A good
      // article frequently has no H2 containing the exact keyword phrase -
      // "Start from your chair cost" is a better heading than "How to price a
      // haircut: chair cost", and forcing the second is precisely the
      // exact-match stuffing that Google's own spam guidance and every study
      // in this repo's research notes say kills a page. Blocking it also costs
      // the customer their own AI quota on a retry that makes the article
      // worse. Keep it as a nudge; the title and opening-paragraph checks
      // (both blocking) already guarantee the keyword is unmissable.
      severity: "advisory",
      run: () => {
        if (kwTokens.length === 0) {
          return {
            passed: false,
            title: "Primary keyword appears in at least one H2",
            detail: "No primary keyword was given.",
            fix: "Set primaryKeyword, then reflect it in at least one H2 heading.",
          };
        }
        const h2s = flat.filter((h) => h.level === 2);
        const passed = h2s.some((h) => occurrencesOfPhrase(proseWordsLower(h.text), kwTokens) > 0);
        return {
          passed,
          title: "Primary keyword appears in at least one H2",
          detail: passed
            ? `At least one H2 contains "${submission.primaryKeyword}".`
            : `None of the ${h2s.length} H2 heading(s) contain "${submission.primaryKeyword}".`,
          fix: passed
            ? ""
            : `Reword one H2 (ideally the section most directly about it) to include the phrase "${submission.primaryKeyword}".`,
        };
      },
    },
    {
      id: "no-keyword-stuffing",
      severity: "blocking",
      run: () => {
        if (kwTokens.length === 0 || wordCount === 0) {
          return { passed: true, title: "Keyword is not overused", detail: "Nothing to measure.", fix: "" };
        }
        const occ = occurrencesOfPhrase(wordsLower, kwTokens);
        const density = (occ * kwTokens.length) / wordCount;
        const passed = !(occ >= STUFFING_MIN_OCCURRENCES && density > STUFFING_DENSITY);
        return {
          passed,
          title: "Keyword is not overused",
          detail: `"${submission.primaryKeyword}" appears ${occ} time(s) (${(density * 100).toFixed(1)}% of the article's words).`,
          fix: passed
            ? ""
            : `Cut repeated exact uses of "${submission.primaryKeyword}" down to a natural handful (roughly one per 150-200 words) and use synonyms or related phrasing the rest of the time - this reads as keyword stuffing to search engines.`,
        };
      },
    },

    // --- Metadata ------------------------------------------------------------
    {
      id: "title-length",
      severity: "advisory",
      run: () => {
        const len = submission.title.trim().length;
        const passed = len >= TITLE_MIN && len <= TITLE_MAX;
        return {
          passed,
          title: "Title length fits search result display",
          detail: `Title is ${len} characters (target ${TITLE_MIN}-${TITLE_MAX}).`,
          fix: passed
            ? ""
            : len < TITLE_MIN
              ? `Lengthen the title by about ${TITLE_MIN - len} characters - add a specific detail (a number, a benefit, a qualifier) rather than a generic word.`
              : `Shorten the title by about ${len - TITLE_MAX} characters so it isn't cut off with "..." in search results.`,
        };
      },
    },
    {
      id: "meta-description-length",
      severity: "advisory",
      run: () => {
        const len = submission.metaDescription.trim().length;
        const passed = len >= META_MIN && len <= META_MAX;
        return {
          passed,
          title: "Meta description length fits search result display",
          detail: `Meta description is ${len} characters (target ${META_MIN}-${META_MAX}).`,
          fix: passed
            ? ""
            : len < META_MIN
              ? `Lengthen the meta description by about ${META_MIN - len} characters - say specifically what the reader will get from the article.`
              : `Shorten the meta description by about ${len - META_MAX} characters so it isn't cut off with "..." in search results.`,
        };
      },
    },
    {
      id: "slug-shape",
      severity: "blocking",
      run: () => {
        const slug = submission.slug ?? "";
        const passed = SLUG_SHAPE_RE.test(slug);
        return {
          passed,
          title: "Slug is lowercase, hyphenated, and URL-safe",
          detail: passed
            ? `"${slug}" is a valid slug.`
            : `"${slug}" is not a valid URL slug - it must be lowercase letters, numbers, and single hyphens only, with no leading, trailing, or doubled hyphens, and no spaces or underscores.`,
          fix: passed ? "" : `Rewrite the slug as lowercase words separated by single hyphens, e.g. "${slugify(submission.title)}".`,
        };
      },
    },
    {
      id: "slug-not-stopword-soup",
      severity: "advisory",
      run: () => {
        const segments = (submission.slug ?? "").split("-").filter(Boolean);
        const stopCount = segments.filter((s) => STOP_WORDS.has(s)).length;
        const fraction = segments.length ? stopCount / segments.length : 0;
        const passed = !(segments.length >= 3 && fraction >= 0.5);
        return {
          passed,
          title: "Slug carries real keyword content, not just filler words",
          detail: passed
            ? "Slug is not dominated by filler words."
            : `"${submission.slug}" is mostly filler words (${stopCount} of ${segments.length} segments) - it won't tell search engines or readers what the page is about.`,
          fix: passed
            ? ""
            : `Rebuild the slug around the primary keyword, e.g. "${slugify(submission.primaryKeyword || submission.title)}".`,
        };
      },
    },
    {
      id: "slug-not-colliding",
      severity: "blocking",
      run: () => {
        const existing = (context.existingSlugs ?? []).map((s) => s.toLowerCase());
        const passed = !existing.includes((submission.slug ?? "").toLowerCase());
        return {
          passed,
          title: "Slug does not collide with an existing page",
          detail: passed ? "No existing page uses this slug." : `The slug "${submission.slug}" is already used by another page on this site.`,
          fix: passed
            ? ""
            : "Choose a different, more specific slug - for example, add a distinguishing word from the title or the primary keyword.",
        };
      },
    },
    {
      id: "title-not-near-duplicate",
      severity: "blocking",
      run: () => {
        const mine = significantTokens(submission.title);
        if (mine.size < MIN_SIGNIFICANT_TOKENS) {
          return {
            passed: true,
            title: "Title is not a near-duplicate of an existing one",
            detail: "Title too short to meaningfully compare.",
            fix: "",
          };
        }
        let worst: { title: string; score: number } | null = null;
        for (const t of context.existingTitles ?? []) {
          const other = significantTokens(t);
          if (other.size < MIN_SIGNIFICANT_TOKENS) continue;
          const score = jaccard(mine, other);
          if (!worst || score > worst.score) worst = { title: t, score };
        }
        const passed = !worst || worst.score < SIMILARITY_THRESHOLD;
        return {
          passed,
          title: "Title is not a near-duplicate of an existing one",
          detail: passed
            ? "No close title match found."
            : `This title overlaps ${Math.round(worst!.score * 100)}% with an existing page: "${worst!.title}".`,
          fix: passed
            ? ""
            : `Change the title so it targets a distinct angle from "${worst!.title}" - keep the primary keyword if needed, but don't restate the same phrase.`,
        };
      },
    },

    // --- Draft cleanliness -----------------------------------------------------
    {
      id: "no-placeholder-text",
      severity: "blocking",
      run: () => {
        const anywhereText = normalizedText(submission.markdown);
        const tailText = anywhereText.slice(-400);
        const hits: string[] = [];
        for (const p of ARTIFACT_PATTERNS) {
          if (p.re.test(p.scope === "tail" ? tailText : anywhereText)) hits.push(p.label);
        }
        if (wholeDocWrappedInFence(submission.markdown)) {
          hits.push("the entire draft is wrapped in a single code fence instead of being the article itself");
        }
        const passed = hits.length === 0;
        return {
          passed,
          title: "No placeholder or leftover model text",
          detail: passed
            ? "No placeholder text, refusal language, or chat sign-offs were found."
            : `Found: ${hits.join("; ")}.`,
          fix: passed
            ? ""
            : `Rewrite the article as finished, standalone content: remove ${hits.join(", ")} entirely - the published page must contain nothing but the article itself.`,
        };
      },
    },
    {
      id: "no-banned-claims",
      severity: "blocking",
      run: () => {
        const claims = (context.bannedClaims ?? []).filter((c) => c.trim());
        if (claims.length === 0) {
          return { passed: true, title: "No banned claims present", detail: "No banned claim list was given for this project.", fix: "" };
        }
        const text = normalizedText(submission.markdown).toLowerCase();
        const found = claims.filter((c) => text.includes(c.trim().toLowerCase()));
        const passed = found.length === 0;
        return {
          passed,
          title: "No banned claims present",
          detail: passed ? "None of the banned claims appear in the article." : `Found banned claim(s): ${found.map((f) => `"${f}"`).join(", ")}.`,
          fix: passed
            ? ""
            : `Remove or fully rephrase the flagged claim(s) - ${found.map((f) => `"${f}"`).join(", ")} - this business is not allowed to publish them.`,
        };
      },
    },

    // --- Sources ---------------------------------------------------------------
    {
      id: "sources-authenticity",
      severity: "blocking",
      run: () => {
        const sources = submission.sources ?? [];
        if (sources.length === 0) {
          return { passed: true, title: "Cited sources look real", detail: "No sources were given, so there is nothing to check here.", fix: "" };
        }
        const problems: string[] = [];
        const seen = new Map<string, number>();
        for (const s of sources) {
          const check = looksFabricatedSource(s.url);
          if (check.bad) {
            problems.push(`"${s.url}" - ${check.reason}`);
            continue;
          }
          const key = normalizeUrlForDedupe(s.url);
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        for (const [key, n] of seen) {
          if (n > 1) problems.push(`the same URL is cited ${n} times (${key})`);
        }
        const passed = problems.length === 0;
        return {
          passed,
          title: "Cited sources look real",
          detail: passed ? `${sources.length} source(s) look like real, distinct citations.` : problems.slice(0, 4).join("; "),
          fix: passed
            ? ""
            : "Replace each flagged source with a real URL to a specific page (not a bare homepage) that actually supports the claim it's attached to, and make sure no two sources are the same link.",
        };
      },
    },
    {
      id: "sources-present",
      severity: context.requireSources ? "blocking" : "advisory",
      run: () => {
        const sources = submission.sources ?? [];
        const validCount = sources.filter((s) => !looksFabricatedSource(s.url).bad).length;
        const need = 2;
        const passed = context.requireSources ? validCount >= need : validCount >= 1;
        return {
          passed,
          title: "Article cites external sources",
          detail: `${validCount} valid external source(s) found${context.requireSources ? ` (need at least ${need})` : ""}.`,
          fix: passed
            ? ""
            : context.requireSources
              ? `Add at least ${Math.max(1, need - validCount)} more real, specific source URL(s) that back up a factual claim in the article.`
              : "Consider adding at least one real source URL - it isn't required for this article, but it strengthens trust with readers and search engines.",
        };
      },
    },

    // --- Markdown sanity ---------------------------------------------------------
    {
      id: "links-well-formed",
      severity: "blocking",
      run: () => {
        const { masked } = fenceMask(submission.markdown);
        const issues: string[] = [];
        const matchedSpans: [number, number][] = [];
        for (const m of masked.matchAll(LINK_RE)) {
          const start = m.index ?? 0;
          matchedSpans.push([start, start + m[0].length]);
          const text = m[1].trim();
          const urlRaw = m[2].trim();
          const urlPart = urlRaw.split(/\s+(?=["'])/)[0].trim(); // strip an optional trailing "title" in quotes
          if (!text) issues.push(`a link near "...${masked.slice(Math.max(0, start - 20), start + 20)}..." has empty link text`);
          if (!urlPart) issues.push(`the link "${text || "(untitled)"}" has no URL`);
          else if (/\s/.test(urlPart)) issues.push(`the link "${text || "(untitled)"}" has a space in its URL ("${urlPart}")`);
          else if (/^javascript:/i.test(urlPart))
            issues.push(`the link "${text || "(untitled)"}" uses a javascript: URL, which is a script-injection risk`);
        }
        // Anything else shaped like "](" that the loop above did not consume
        // as part of a clean match is likely a broken link - unbalanced
        // brackets, a stray earlier "[", or nesting our simple parser can't
        // follow. Not a full CommonMark parser (no dependency for one is
        // allowed), so this is a heuristic, not exhaustive.
        let idx = masked.indexOf("](");
        while (idx !== -1) {
          const covered = matchedSpans.some(([s, e]) => idx >= s && idx < e);
          if (!covered) issues.push(`malformed link syntax near "...${masked.slice(Math.max(0, idx - 20), idx + 20)}..."`);
          idx = masked.indexOf("](", idx + 2);
        }
        const passed = issues.length === 0;
        return {
          passed,
          title: "Markdown links are well-formed",
          detail: passed ? "All links have real link text and a real URL." : issues.slice(0, 4).join("; "),
          fix: passed
            ? ""
            : "Fix each flagged link: give it non-empty visible text in [brackets], a complete URL in (parentheses) with no raw spaces, and never a javascript: URL.",
        };
      },
    },
    {
      id: "code-fences-closed",
      severity: "blocking",
      run: () => {
        const { unclosedFence } = fenceMask(submission.markdown);
        return {
          passed: !unclosedFence,
          title: "Code fences are all closed",
          detail: unclosedFence
            ? "The document opens a ``` or ~~~ code fence that is never closed - everything after it can render as broken formatting for the rest of the page."
            : "Every code fence is closed.",
          fix: unclosedFence
            ? "Find the unmatched ``` or ~~~ marker and add its closing fence, or remove the opening one if no code block was intended."
            : "",
        };
      },
    },
    {
      id: "no-raw-html",
      severity: "blocking",
      run: () => {
        const { masked } = fenceMask(submission.markdown);
        const found = RAW_HTML_TAG_RE.test(masked);
        return {
          passed: !found,
          title: "No raw <script>/<iframe>/<style> tags",
          detail: found ? "The article contains a raw <script>, <iframe>, or <style> tag." : "No embedded script, iframe, or style tags found.",
          fix: found
            ? "Delete the <script>/<iframe>/<style> tag and its contents entirely - published articles must be plain content only, never embedded code, for the customer site's safety."
            : "",
        };
      },
    },
    {
      id: "has-scannable-structure",
      severity: listMandatory ? "blocking" : "advisory",
      run: () => {
        const { masked } = fenceMask(submission.markdown);
        const passed = LIST_RE.test(masked) || hasTable(masked);
        return {
          passed,
          title: "Article includes a list or table",
          detail: passed ? "Found at least one markdown list or table." : "No bullet list, numbered list, or table was found anywhere in the article.",
          fix: passed
            ? ""
            : "Turn at least one dense paragraph (steps, options, comparisons, or a summary) into a bullet list or a markdown table for scannability.",
        };
      },
    },
    {
      id: "faq-quality",
      severity: "blocking",
      run: () => {
        const faq = submission.faq ?? [];
        if (faq.length === 0) {
          return { passed: true, title: "FAQ entries are real Q&A pairs", detail: "No FAQ was submitted.", fix: "" };
        }
        const issues: string[] = [];
        faq.forEach((f, i) => {
          const q = (f.question ?? "").trim();
          const a = (f.answer ?? "").trim();
          if (!q.endsWith("?")) issues.push(`FAQ #${i + 1} question does not end in "?": "${q.slice(0, 60)}"`);
          const answerWords = wordsOf(a).length;
          if (answerWords < 8) issues.push(`FAQ #${i + 1} answer is only ${answerWords} word(s) - too thin to be a real answer`);
        });
        const passed = issues.length === 0;
        return {
          passed,
          title: "FAQ entries are real Q&A pairs",
          detail: passed ? `${faq.length} FAQ entrie(s) all look like real Q&A pairs.` : issues.slice(0, 4).join("; "),
          fix: passed
            ? ""
            : 'Fix each flagged FAQ entry: phrase the question as an actual question ending in "?", and write a real answer of at least a couple of sentences (8+ words), not a one-line stub.',
        };
      },
    },
  ];

  const checks: Check[] = defs.map((d) => ({ id: d.id, severity: d.severity, ...d.run() }));
  const blocking = checks.filter((c) => c.severity === "blocking");
  const advisory = checks.filter((c) => c.severity === "advisory");
  const ok = blocking.every((c) => c.passed);
  const score = computeScore(checks);

  return { ok, score, checks, blocking, advisory };
}
