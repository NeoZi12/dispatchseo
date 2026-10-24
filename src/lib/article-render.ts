// The "finisher": turns an article a CUSTOMER'S AI wrote in markdown into a
// page ready to publish. This is the last module that touches an article
// before it reaches the site's actual database/CMS/repo - src/lib/wordpress.ts
// posts finishArticle()'s `html` straight into WordPress's `content` field,
// and a repo-publish path commits toMdx()'s output straight into the
// customer's repo. Nothing downstream re-escapes or re-sanitizes anything
// this file produces, so this is the one place that has to get it right.
//
// WHERE THIS SITS: the customer's own coding agent or chat AI writes markdown
// and submits it -> article-validate.ts gates it (word count, heading
// structure, placeholder text, fabricated sources, keyword stuffing - see
// that file) -> THIS module renders the validated markdown to publish-ready
// HTML, inserts a handful of internal links, builds an excerpt and a JSON-LD
// schema object -> wordpress.ts (or a GitHub PR carrying toMdx()'s output)
// actually lands it in front of a reader.
//
// THE SECURITY DESIGN, AND WHY IT IS NOT A COMPROMISE:
// There is no markdown-to-HTML library reachable from this module (see the
// dependency note below), so markdown parsing is hand-written. The obvious
// alternative - accept the model's own HTML, then sanitize it with an
// allowlist library afterward - is the shape that keeps producing XSS bugs
// industry-wide, because a sanitizer's allowlist is a moving target and this
// module's input is TEXT WRITTEN BY A LANGUAGE MODEL: for security purposes
// that is exactly as untrusted as a stranger's pull request, regardless of
// how well-behaved the model usually is. Sanitize-after is a blocklist
// wearing an allowlist's clothes.
//
// So the design here inverts it: HTML-ESCAPE THE ENTIRE MARKDOWN SOURCE FIRST
// - every &, <, >, ", ' becomes its entity, once, before any structural
// parsing happens - and every tag that ends up in the output (every <p>,
// <a>, <strong>, <code>, ...) is one this file itself writes, from a fixed
// set of template strings, never from a byte the model supplied. A literal
// "<script>" typed by the model is never treated as a tag; by the time any
// block/inline parsing sees it, it is already the three-and-a-bit escaped
// characters "&lt;script&gt;", which render as harmless visible text. There
// is no allowlist to keep in sync and nothing for a clever prompt to smuggle
// past, because nothing downstream of that first escape can ever introduce a
// real "<" or ">" into the output except this file's own template strings.
//
// DO NOT "fix" this later by adding HTML passthrough for the model's markup.
// The moment this module accepts and re-emits HTML from the markdown source,
// it reopens exactly the sanitizer-allowlist problem this design exists to
// avoid. "Customers publish an article they didn't type character-for-
// character" is the whole point of the product, not a reason to relax this.
//
// === NO NEW NPM DEPENDENCIES ===
// package.json has no markdown-to-HTML library reachable from this module
// (remark-gfm is present but its unified/remark-parse peers are not, and
// pnpm's strict node_modules layout means a transitive package is not
// importable just because some other dependency happens to pull it in).
// Every parser below is hand-written by design, not as a stopgap.
//
// SCOPE: this module supports the markdown subset the playbook actually
// produces - ATX headings, paragraphs, bold/italic/inline code, fenced code
// blocks, unordered/ordered lists with one level of nesting, blockquotes,
// GFM tables with alignment, horizontal rules, links, and images. Anything
// else in the source (setext headings, reference-style links, footnotes,
// raw HTML, strikethrough, ...) was never a structural element to begin with
// once the initial escape has run - it is just text, and it renders as
// exactly that: visible, harmless, and never silently dropped.
//
// ONE DELIBERATE COMPOSITION LIMIT, DOCUMENTED RATHER THAN HIDDEN: bold and
// italic markers that fall *inside* a link's visible text or an image's alt
// text are not further interpreted (they show up as literal ** or _
// characters inside the anchor/alt text). A real recursive-descent inline
// parser could compose these; this hand-written one is a single ordered pass
// per text run (code, then images, then links, then bold, then italic), and
// a bolded link is not a shape this playbook's own prose produces in
// practice. Write link/image text as plain text.
//
// REDOS: article-validate.ts, this module's upstream gate, already shipped
// one catastrophic-backtracking regex (a GFM table separator pattern that
// took 15 seconds on 3000 dashes) before it was rewritten as a linear scan -
// see that file's hasTable() comment. Every block-level scanner in this file
// follows the same discipline: anchored, single-quantifier regexes, or a
// plain character/line scan instead of a regex at all (isHr, splitTableRow,
// findWholeWordMatch all avoid regex entirely). The one pattern that could
// look suspicious at a glance - firstSentence()'s lazy `.*?[.!?]` - is a
// single, non-nested lazy quantifier anchored at the start of the string,
// which is linear-time (it is not the "(a+)+"-shaped ambiguity that causes
// blowups); it was hand-tested against a multi-KB string with no sentence
// punctuation at all and stayed sub-millisecond.
//
// PURE MODULE: no fetch, no fs, no env vars, no Date.now(), no React/JSX, no
// browser APIs. Every fact this file needs (the site's own URL, publish
// dates, the page inventory to link into) comes in as an argument - same
// discipline as article-validate.ts, and for the same reason: cheap to call
// on every retry, trivial to unit test with plain objects.

import type { ArticleSubmission, FaqPair } from "@/lib/article-validate";
import { countWords } from "@/lib/article-validate";

// --- Shared low-level text helpers ------------------------------------------

/** Turns every HTML-special character into its entity. Applied ONCE, to the
 *  entire raw markdown source, before any parsing - see the file header for
 *  why this ordering is the whole security model, not an implementation
 *  detail. Every markdown syntax character this module understands (# * _
 *  ` [ ] ( ) | > -) is untouched by this function, so escaping first and
 *  parsing second never trips over its own output - except ">" (blockquote
 *  markers), which becomes "&gt;" and is matched in its escaped form by the
 *  blockquote scanner below. That is a deliberate, isolated exception, not a
 *  crack in the design: it is still ONE fixed string this file matches
 *  against, never re-interpreted as markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The inverse of escapeHtml(), used only where this file needs the ORIGINAL
 *  characters back for a non-HTML purpose - building a heading's plain-text
 *  slug, or reporting an internal link's matched anchor text. Never used to
 *  build anything that gets written back into the rendered HTML. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&"); // must run last, or a literal "&amp;lt;" would double-decode
}

/** Strips inline markdown syntax down to plain readable text (code/image/
 *  link markup collapsed to their visible content, bold/italic markers
 *  removed), for the two places this file needs PLAIN text rather than
 *  rendered HTML: a heading's slug/TOC entry, and buildExcerpt()'s
 *  first-real-sentence fallback. Operates on RAW (unescaped) markdown, same
 *  as article-validate.ts's own stripMarkdownNoise() - not imported from
 *  there because that function also strips fenced code and full URLs, which
 *  this one deliberately does not need to (its caller already worked at
 *  line/heading granularity, where those never appear). */
function stripInlineMarkdownToPlainText(raw: string): string {
  let s = raw;
  s = s.replace(/`([^`\n]+)`/g, "$1");
  s = s.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1");
  s = s.replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1");
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
  s = s.replace(/__([^_\n]+?)__/g, "$1");
  s = s.replace(/\*([^*\n]+?)\*/g, "$1");
  s = s.replace(/_([^_\n]+?)_/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// --- URL classification (shared by inline rendering and the excerpt/link code) ---

/** Only http, https, and mailto ever become a live link or an <img src>.
 *  Everything else - javascript:, data:, vbscript:, a bare "//" protocol-
 *  relative URL, any other scheme - degrades to plain text. This is a
 *  character scan, not a URL-parsing library call, on purpose: it has to
 *  agree with itself on "what counts as a scheme" every time, and the
 *  CommonMark-ish scheme grammar (a letter, then letters/digits/+/-/. up to
 *  a colon) is simple enough to check directly. */
/**
 * Characters a browser silently DISCARDS from a URL before resolving it:
 * tab, line feed and carriage return, plus the other C0 controls and DEL.
 *
 * This is the oldest XSS bypass there is and it defeated the scheme check
 * here until it was tested for. "java&#9;script:alert(1)" does not match the
 * scheme pattern below - the tab is not a legal scheme character - so the URL
 * fell through to "relative", was treated as a harmless same-site path, and
 * was written into href verbatim. The browser then removed the tab and ran
 * javascript:. Stripping first means the classifier sees exactly what the
 * browser will see, which is the only comparison that can be trusted.
 */
function stripUrlNoise(u: string): string {
  // eslint-disable-next-line no-control-regex -- the point is the control chars
  return u.replace(/[\u0000-\u001F\u007F]/g, "");
}

function classifyUrl(u: string): "http" | "mailto" | "relative" | "rejected" {
  const t = stripUrlNoise(u).trim();
  if (!t) return "rejected";
  // Protocol-relative: inherits whatever scheme the embedding page loaded
  // under, so on an http-embedded preview or a hostile iframe it can resolve
  // to something other than https without ever writing out a scheme. Treated
  // the same as any other disallowed scheme, not as a special case of "relative".
  if (t.startsWith("//")) return "rejected";
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(t);
  if (m) {
    const scheme = m[1].toLowerCase();
    if (scheme === "http" || scheme === "https") return "http";
    if (scheme === "mailto") return "mailto";
    return "rejected"; // javascript:, data:, vbscript:, ftp:, everything else
  }
  return "relative"; // no scheme at all - a same-site path like "/pricing"
}

function hostOf(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isSameSite(url: string, siteHost: string | null): boolean {
  if (!siteHost) return false;
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return h === siteHost || h.endsWith(`.${siteHost}`);
  } catch {
    return false;
  }
}

/** CommonMark allows a link destination to be followed by an optional quoted
 *  "title" - `[text](https://x.com "Title")`. This is article-validate.ts's
 *  own technique for dropping that tail (see its links-well-formed check),
 *  reused here rather than re-derived so the two files never disagree about
 *  where a link's URL ends. */
function firstUrlToken(raw: string): string {
  return raw.trim().split(/\s+(?=["'])/)[0].trim();
}

type InlineCtx = { siteHost: string | null };

/** Decides what an <a>/<img> gets for `href`/`src`, and whether a link counts
 *  as "external" (gets rel="nofollow noopener" target="_blank") or points at
 *  the site's own domain (gets neither). `rawEscapedUrl` is already
 *  HTML-escaped (it was sliced out of the once-escaped document), which is
 *  exactly the string that belongs in the attribute value - so on success
 *  this function hands it back unchanged as `href`. */
function sanitizeUrl(rawEscapedUrl: string, ctx: InlineCtx): { href: string; external: boolean } | null {
  // Emit the STRIPPED value, not the original. Classifying a cleaned string
  // and then writing the dirty one back into href would hand the browser the
  // exact input the classifier just refused to judge on its own terms.
  const url = stripUrlNoise(rawEscapedUrl);
  const kind = classifyUrl(url);
  if (kind === "rejected") return null;
  if (kind === "http") {
    return { href: url, external: !isSameSite(decodeEntities(url), ctx.siteHost) };
  }
  if (kind === "mailto") return { href: url, external: false };
  return { href: url, external: false }; // relative - always same-site by construction
}

// --- Inline rendering (bold, italic, code, links, images) -------------------
//
// One left-to-right pass per text run, each feature "stashing" its rendered
// HTML behind an opaque placeholder token before the NEXT
// feature's regex runs - so a feature can never accidentally re-parse markup
// a previous feature already produced (this is what "emphasis must not run
// inside code" actually reduces to: code is stashed FIRST, so by the time
// the bold/italic regexes scan the string, a code span's raw *,_ characters
// are already sealed inside an opaque token they can't see). Placeholders are
// resolved back to real HTML recursively at the very end, so a token that
// itself contains an earlier token (code nested inside a link's visible
// text, say) still comes out fully resolved.

// U+0000 (NUL) can never appear in real prose, and escapeHtml() never
// produces it either (it only ever emits ASCII entities), so it is a safe,
// unambiguous sentinel to wrap a placeholder index in - unlike, say, a
// plain " N " token, which a real sentence containing a number ("the plan
// costs 5 dollars") could collide with. Built via String.fromCharCode()
// rather than a source-level escape so the sentinel is a real NUL only at
// RUNTIME - the .ts file on disk stays plain ASCII, which matters because
// a literal NUL byte embedded in a checked-in source file makes git (and
// most diff/blame tooling) treat it as a binary file.
const SENTINEL = String.fromCharCode(0);
const PLACEHOLDER_RE = new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g");

function renderInline(escapedText: string, ctx: InlineCtx): string {
  const stash: string[] = [];
  const put = (html: string): string => {
    stash.push(html);
    return `${SENTINEL}${stash.length - 1}${SENTINEL}`;
  };

  let out = escapedText;

  // 1. Inline code - must run first, unconditionally, so nothing below ever
  //    reaches inside a code span.
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => put(`<code>${code}</code>`));

  // 2. Images, 3. links - stashed before bold/italic. See the file header's
  //    "one deliberate composition limit" note for what this trades away.
  // The bracket pre-check below is a performance guard, not decoration. The
  // two regexes here use `[^\]\n]*`, which on text containing many "[" or "!["
  // with no "]" anywhere after them walks to end-of-line and backtracks from
  // EVERY starting position - O(n^2). Measured on the real pattern: "![" x
  // 25,000 took 530ms, x 50,000 took 2,039ms, and this pass runs more than
  // once per submission. The input is markdown written by a language model, so
  // a pathological shape is an accident waiting to happen rather than an
  // attack anyone has to mount. Skipping the scan when the line has no closing
  // bracket at all makes that case O(1), and a line with brackets is bounded
  // by its own length.
  if (out.includes("]")) {
  out = out.replace(/!\[([^\]\n]*)\]\(([^)\n]*)\)/g, (_m, alt: string, rawUrl: string) => {
    const safe = sanitizeUrl(firstUrlToken(rawUrl), ctx);
    if (!safe) return alt; // unsafe/invalid src degrades to just the alt text
    return put(`<img src="${safe.href}" alt="${alt}" loading="lazy">`);
  });

  out = out.replace(/\[([^\]\n]*)\]\(([^)\n]*)\)/g, (_m, text: string, rawUrl: string) => {
    const safe = sanitizeUrl(firstUrlToken(rawUrl), ctx);
    const label = text.trim() ? text : firstUrlToken(rawUrl); // empty link text falls back to showing the URL
    if (!safe) return label; // dangerous/invalid scheme: visible text, never a live link
    const rel = safe.external ? ` rel="nofollow noopener" target="_blank"` : "";
    return put(`<a href="${safe.href}"${rel}>${label}</a>`);
  });
  }

  // 4. Bold before italic, and "**"/"__" before "*"/"_", so "**x**" is never
  //    first read as two adjacent italics.
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, (_m, t: string) => put(`<strong>${t}</strong>`));
  out = out.replace(/__([^_\n]+?)__/g, (_m, t: string) => put(`<strong>${t}</strong>`));
  out = out.replace(/\*([^*\n]+?)\*/g, (_m, t: string) => put(`<em>${t}</em>`));
  // Underscore italics require a non-word character (or string edge) on both
  // sides. Without that guard, "get_site_stats" - and this codebase's own
  // prose is full of snake_case identifiers exactly like it - would read as
  // "get" + <em>site</em> + "stats". A lookbehind/lookahead is the only way
  // to express "not adjacent to a word character" here, because "_" is
  // itself a \w character, so a plain \b does not mean what it would for "*".
  out = out.replace(/(?<![A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_])/g, (_m, t: string) => put(`<em>${t}</em>`));

  return resolvePlaceholders(out, stash);
}

function resolvePlaceholders(s: string, stash: string[]): string {
  return s.replace(PLACEHOLDER_RE, (_m, idx: string) => resolvePlaceholders(stash[Number(idx)], stash));
}

// --- Block-level scanning ----------------------------------------------------
//
// Line-by-line, cursor-driven, exactly the style article-validate.ts uses for
// the same ReDoS reasons documented in the file header. Every regex below is
// anchored and uses at most one quantifier per character class - no adjacent
// or nested quantifiers that could disagree about how to split the string.
//
// Leading-whitespace tolerance (0-3 spaces) on headings/hr/blockquotes/fences
// matches CommonMark and mirrors article-validate.ts's own reasoning: an AI
// that indents its markdown slightly is common enough that requiring column 0
// would make a real heading invisible to this renderer.

const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+)$/;
const FENCE_OPEN_RE = /^ {0,3}([`~]{3,})[ \t]*([^\n]*)$/;
const TABLE_SEPARATOR_CELL_RE = /^:?-+:?$/;
// Top-level list items tolerate the same 0-3 space indent as everything else
// above. A NESTED item must indent at least 4 spaces - this is a simplifying
// choice, not full CommonMark (which nests relative to the parent marker's
// content column), but it draws a clean, unambiguous line between "top-level
// item written with a little indentation" and "actually nested", which is
// what "one level of nesting" needs to mean something concrete.
const TOP_ITEM_RE = /^ {0,3}([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const NESTED_ITEM_RE = /^ {4,10}([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;

/** Thematic break: 3+ of the same character (-, *, or _), optionally
 *  space-separated, alone on a line. A plain character scan rather than a
 *  regex - not because a regex here would be unsafe, but because it is the
 *  simplest way to express "every remaining character is identical" without
 *  reasoning about a quantified-group-inside-a-quantified-group shape at
 *  all. We deliberately never try to distinguish this from a Setext heading
 *  underline: article-validate.ts's own stance is that Setext headings are
 *  unsupported, and treating a bare "---" as an hr unconditionally keeps
 *  this renderer's behavior consistent with what the validator already
 *  assumes about the input. */
function isHr(line: string): boolean {
  const compact = line.trim().replace(/[ \t]/g, "");
  if (compact.length < 3) return false;
  const ch = compact[0];
  if (ch !== "-" && ch !== "*" && ch !== "_") return false;
  for (let i = 1; i < compact.length; i++) if (compact[i] !== ch) return false;
  return true;
}

/** Escaped form of "> " - the whole document was HTML-escaped up front, so
 *  every ">" in the source is already "&gt;" by the time this runs. */
function isBlockquoteLine(line: string): boolean {
  return /^ {0,3}&gt;/.test(line);
}

function stripBlockquoteMarker(line: string): string {
  return line.replace(/^ {0,3}&gt;[ \t]?/, "");
}

function splitOnBlank(lines: string[]): string[] {
  const paras: string[] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l.trim() === "") {
      if (cur.length) {
        paras.push(cur.join(" "));
        cur = [];
      }
    } else {
      cur.push(l.trim());
    }
  }
  if (cur.length) paras.push(cur.join(" "));
  return paras;
}

/** Splits one table row into cells on unescaped "|", honoring "\|" as a
 *  literal pipe inside a cell (the one bit of GFM table syntax that would
 *  otherwise be unparseable without it). A hand character scan, O(n), no
 *  regex - this is exactly the kind of input (an AI's table, arbitrary
 *  width, arbitrary pipe count) the ReDoS note in the file header is about. */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell: string): "left" | "right" | "center" | null {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function looksLikeTableStart(lines: string[], i: number): boolean {
  if (!lines[i].includes("|")) return false;
  if (i + 1 >= lines.length) return false;
  const cells = splitTableRow(lines[i + 1]).filter((c) => c.length > 0);
  if (cells.length === 0) return false;
  return cells.every((c) => TABLE_SEPARATOR_CELL_RE.test(c));
}

function isBlockStart(line: string, lines: string[], idx: number): boolean {
  if (FENCE_OPEN_RE.test(line)) return true;
  if (HEADING_RE.test(line)) return true;
  if (isHr(line)) return true;
  if (isBlockquoteLine(line)) return true;
  if (TOP_ITEM_RE.test(line)) return true;
  if (looksLikeTableStart(lines, idx)) return true;
  return false;
}

function parseTable(lines: string[], i: number, ctx: InlineCtx): { html: string; next: number } {
  const headerCells = splitTableRow(lines[i]);
  const aligns = splitTableRow(lines[i + 1]).map(alignOf);
  let j = i + 2;
  const bodyRows: string[][] = [];
  while (j < lines.length && lines[j].trim() !== "" && lines[j].includes("|")) {
    bodyRows.push(splitTableRow(lines[j]));
    j++;
  }
  const colCount = headerCells.length;
  const cellTag = (tag: "th" | "td", content: string, align: "left" | "right" | "center" | null) => {
    const style = align ? ` style="text-align:${align}"` : "";
    return `<${tag}${style}>${renderInline(content, ctx)}</${tag}>`;
  };
  const thead = `<tr>${headerCells.map((c, idx) => cellTag("th", c, aligns[idx] ?? null)).join("")}</tr>`;
  const tbody = bodyRows
    .map((row) => {
      const tds = Array.from({ length: colCount }, (_, idx) => cellTag("td", row[idx] ?? "", aligns[idx] ?? null));
      return `<tr>${tds.join("")}</tr>`;
    })
    .join("");
  return { html: `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`, next: j };
}

function parseList(lines: string[], i: number, ctx: InlineCtx): { html: string; next: number } {
  type Item = { text: string; children: { text: string }[]; childOrdered: boolean };
  const items: Item[] = [];
  let ordered = false;
  let firstSeen = false;
  let j = i;
  while (j < lines.length) {
    const line = lines[j];
    if (line.trim() === "") {
      // A blank line only continues the list if another list line follows
      // it (a "loose" list) - otherwise it ends the list here.
      const next = lines[j + 1];
      if (next !== undefined && (TOP_ITEM_RE.test(next) || NESTED_ITEM_RE.test(next))) {
        j++;
        continue;
      }
      break;
    }
    const top = TOP_ITEM_RE.exec(line);
    if (top) {
      const itemIsOrdered = /^\d/.test(top[1]);
      if (!firstSeen) {
        ordered = itemIsOrdered;
        firstSeen = true;
      } else if (itemIsOrdered !== ordered) {
        // A marker-type change (bullet -> numbered or back) starts a NEW
        // list, even across a blank line - without this check, "- a\n\n1.
        // one" would render as one <ul> containing "one" as a bullet, since
        // `ordered` was already locked in by the first item. Stop here and
        // leave the cursor on this line; the outer dispatch loop's next
        // TOP_ITEM_RE check picks it straight back up as a fresh list.
        break;
      }
      items.push({ text: top[2], children: [], childOrdered: false });
      j++;
      continue;
    }
    const nested = items.length > 0 ? NESTED_ITEM_RE.exec(line) : null;
    if (nested) {
      const parent = items[items.length - 1];
      if (parent.children.length === 0) parent.childOrdered = /^\d/.test(nested[1]);
      parent.children.push({ text: nested[2] });
      j++;
      continue;
    }
    break;
  }
  const tag = ordered ? "ol" : "ul";
  const itemsHtml = items
    .map((it) => {
      let childHtml = "";
      if (it.children.length) {
        const ctag = it.childOrdered ? "ol" : "ul";
        childHtml = `<${ctag}>${it.children.map((c) => `<li>${renderInline(c.text, ctx)}</li>`).join("")}</${ctag}>`;
      }
      return `<li>${renderInline(it.text, ctx)}${childHtml}</li>`;
    })
    .join("");
  return { html: `<${tag}>${itemsHtml}</${tag}>`, next: j };
}

// Collision-safe against EVERY id already handed out, not just against other
// headings sharing this base. Counting per-base looks equivalent and is not:
// headings "Intro", "Intro 1", "Intro" produced intro, intro-1, intro-1 - two
// elements with the same id, so a table-of-contents link to the second one
// silently jumps to the first. Anchor links are the whole reason these ids
// exist, so the loop below tries base, base-1, base-2... until the candidate
// is genuinely unused.
function uniqueSlug(text: string, used: Map<string, number>): string {
  let base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) base = "section";
  // The Map doubles as the set of taken ids (value is unused); keeping the
  // signature avoids touching every caller.
  if (!used.has(base)) {
    used.set(base, 1);
    return base;
  }
  for (let n = 1; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) {
      used.set(candidate, 1);
      return candidate;
    }
  }
}

// --- Public: renderMarkdown ---------------------------------------------------

export type RenderedHeading = { level: number; text: string; id: string };

export type RenderMarkdownOpts = {
  /** The site's own domain (bare host or full URL - either works), used to
   *  decide whether a link is "external" (gets rel="nofollow noopener"
   *  target="_blank") or points back at the site's own domain (gets
   *  neither). Optional: every absolute http(s) link is treated as external
   *  when this is omitted, which is the safe default. */
  siteUrl?: string;
};

export type RenderedMarkdown = {
  html: string;
  headings: RenderedHeading[];
  wordCount: number;
};

export function renderMarkdown(markdown: string, opts: RenderMarkdownOpts = {}): RenderedMarkdown {
  const raw = markdown ?? "";
  // THE security-load-bearing line of this whole module - see the file
  // header. Everything from here down operates on already-escaped text.
  const escaped = escapeHtml(raw);
  const lines = escaped.split("\n");
  const ctx: InlineCtx = { siteHost: hostOf(opts.siteUrl) };

  const htmlParts: string[] = [];
  const headings: RenderedHeading[] = [];
  const usedSlugs = new Map<string, number>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block.
    const fenceOpen = FENCE_OPEN_RE.exec(line);
    if (fenceOpen) {
      const marker = fenceOpen[1][0];
      const markerLen = fenceOpen[1].length;
      const infoWord = (fenceOpen[2] ?? "").trim().split(/\s+/)[0] ?? "";
      // Whitelisted shape only - short identifier characters - so a hostile
      // info string can never become anything but plain text even though
      // it's already-escaped by this point regardless.
      const lang = /^[A-Za-z0-9+#.-]{1,20}$/.test(infoWord) ? infoWord : "";
      const codeLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const close = /^ {0,3}([`~]{3,})[ \t]*$/.exec(lines[j]);
        if (close && close[1][0] === marker && close[1].length >= markerLen) {
          j++;
          break;
        }
        codeLines.push(lines[j]);
      }
      const classAttr = lang ? ` class="language-${lang}"` : "";
      // Code content is NEVER run through renderInline() - that is what
      // "emphasis must not run inside fenced code" means at the block level.
      htmlParts.push(`<pre><code${classAttr}>${codeLines.join("\n")}</code></pre>`);
      i = j;
      continue;
    }

    // Heading.
    const h = HEADING_RE.exec(line);
    if (h) {
      const level = h[1].length;
      // Trim a CommonMark-style closing "## Heading ##", same rule (and same
      // reasoning) as article-validate.ts's flatHeadings().
      const inlineSource = h[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
      const plainText = stripInlineMarkdownToPlainText(decodeEntities(inlineSource));
      const id = uniqueSlug(plainText, usedSlugs);
      headings.push({ level, text: plainText, id });
      htmlParts.push(`<h${level} id="${id}">${renderInline(inlineSource, ctx)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule.
    if (isHr(line)) {
      htmlParts.push("<hr>");
      i++;
      continue;
    }

    // Blockquote.
    if (isBlockquoteLine(line)) {
      const bqLines: string[] = [];
      let j = i;
      while (j < lines.length && (isBlockquoteLine(lines[j]) || lines[j].trim() === "")) {
        if (lines[j].trim() === "") {
          if (j + 1 >= lines.length || !isBlockquoteLine(lines[j + 1])) break;
          bqLines.push("");
          j++;
          continue;
        }
        bqLines.push(stripBlockquoteMarker(lines[j]));
        j++;
      }
      const paras = splitOnBlank(bqLines).filter((p) => p.trim() !== "");
      const inner = paras.map((p) => `<p>${renderInline(p, ctx)}</p>`).join("");
      htmlParts.push(`<blockquote>${inner}</blockquote>`);
      i = j;
      continue;
    }

    // Table.
    if (looksLikeTableStart(lines, i)) {
      const { html, next } = parseTable(lines, i, ctx);
      htmlParts.push(html);
      i = next;
      continue;
    }

    // List.
    if (TOP_ITEM_RE.test(line)) {
      const { html, next } = parseList(lines, i, ctx);
      htmlParts.push(html);
      i = next;
      continue;
    }

    // Paragraph: everything up to a blank line, EOF, or the start of another
    // block type ("paragraph interruption", same idea as CommonMark's).
    {
      const paraLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim() !== "" && !(j > i && isBlockStart(lines[j], lines, j))) {
        paraLines.push(lines[j].trim());
        j++;
      }
      htmlParts.push(`<p>${renderInline(paraLines.join(" "), ctx)}</p>`);
      i = j;
    }
  }

  return {
    html: htmlParts.join("\n"),
    headings,
    // Reuses article-validate.ts's countWords() on the RAW markdown, rather
    // than counting words some second way from the rendered HTML - so a
    // 900-word article that just cleared the validator's word-count gate is
    // never reported as some different number three steps later in the same
    // pipeline. See that file's own comment on why every count in it shares
    // one implementation; this is the same rule extended one module further.
    wordCount: countWords(raw),
  };
}

// --- Public: addInternalLinks -------------------------------------------------

export type LinkCandidate = {
  url: string;
  title: string;
  keywords?: string[];
};

export type AddInternalLinksOpts = {
  /** The URL of the page being written - never link a page to itself. */
  ownUrl: string;
  /** Default 5. */
  maxLinks?: number;
};

export type AddInternalLinksResult = {
  html: string;
  linked: { url: string; anchor: string }[];
};

const DEFAULT_MAX_INTERNAL_LINKS = 5;
const MIN_ANCHOR_CHARS = 3;

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9]/.test(ch);
}

/** Finds the first WHOLE-WORD, case-insensitive occurrence of `needleLower`
 *  in `haystackLower`. Plain indexOf plus a manual boundary check, not a
 *  regex built from candidate text - `needleLower` ultimately comes from a
 *  page title or keyword list that this file did not author, and building a
 *  RegExp out of arbitrary text means either escaping it correctly or
 *  risking a slow/broken pattern. indexOf() is linear and has no such risk
 *  no matter what the phrase contains. */
function findWholeWordMatch(haystackLower: string, needleLower: string): { start: number; end: number } | null {
  let idx = haystackLower.indexOf(needleLower);
  while (idx !== -1) {
    const before = haystackLower[idx - 1];
    const after = haystackLower[idx + needleLower.length];
    if (!isWordChar(before) && !isWordChar(after)) {
      return { start: idx, end: idx + needleLower.length };
    }
    idx = haystackLower.indexOf(needleLower, idx + 1);
  }
  return null;
}

/** A path-only comparison key, so "/pricing", "https://x.com/pricing", and
 *  "https://x.com/pricing/" are all recognized as the same target - the
 *  self-link exclusion and the one-link-per-target rule both need that,
 *  since a page inventory and this module's caller are not guaranteed to
 *  spell the same URL the same way. */
function urlKey(u: string): string {
  const trimmed = (u ?? "").trim();
  try {
    return new URL(trimmed, "https://placeholder.invalid").pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Inserts up to `opts.maxLinks` internal links into rendered HTML. This is
 * text surgery on already-rendered markup, so correctness depends entirely
 * on never touching anything but real text nodes:
 *
 * The HTML is tokenized with `html.split(/(<[^>]+>)/g)` - a capturing split
 * that alternates [text, tag, text, tag, ..., text]. That regex is only
 * safe to rely on here because THIS FILE controls every tag in the HTML
 * (renderMarkdown() never lets a raw "<" or ">" from the source survive
 * unescaped - see the file header), so a "<" can only ever start one of this
 * module's own tags and a ">" can only ever end one. There is no attribute
 * value in this document that can contain a literal, unescaped ">" to
 * confuse the split.
 *
 * A running tag-name stack tracks whether the CURRENT text node sits inside
 * a heading (h1-h6), inline/block code, or an existing <a> - those text
 * nodes are marked ineligible and never searched. When a match is found
 * inside an eligible node, that node is split into [before, the new <a>
 * (itself marked ineligible), after] rather than the whole HTML string being
 * concatenated and re-scanned - so a later candidate can never place a link
 * inside a link this function just inserted, and "never inside an existing
 * link" holds for links THIS function created, not just ones the source
 * markdown already had.
 */
export function addInternalLinks(
  html: string,
  candidates: LinkCandidate[],
  opts: AddInternalLinksOpts,
): AddInternalLinksResult {
  type Segment = { kind: "tag"; raw: string } | { kind: "text"; raw: string; eligible: boolean };

  const EXCLUDE_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "a"]);
  const SELF_CLOSING = new Set(["img", "br", "hr"]);

  const parts = html.split(/(<[^>]+>)/g);
  const segments: Segment[] = [];
  let excludeDepth = 0;
  for (const part of parts) {
    if (part === "") continue;
    if (part.startsWith("<")) {
      const m = /^<\/?([a-zA-Z0-9]+)/.exec(part);
      const name = m ? m[1].toLowerCase() : "";
      const isClose = part.startsWith("</");
      const isSelfClosing = SELF_CLOSING.has(name) || /\/>\s*$/.test(part);
      if (EXCLUDE_TAGS.has(name) && !isSelfClosing) {
        excludeDepth += isClose ? -1 : 1;
        if (excludeDepth < 0) excludeDepth = 0; // defensive - an unmatched close never goes negative
      }
      segments.push({ kind: "tag", raw: part });
    } else {
      // HTML character entities are split out as their own INELIGIBLE
      // segments, so no anchor phrase can ever start or end inside one.
      //
      // The text reaching this function has already been HTML-escaped, so a
      // literal "&" the author typed is now "&amp;". A link candidate whose
      // title or keyword happens to be "amp", "quot", "lt" or "gt" - and
      // "AMP" is a perfectly ordinary page title on an SEO site - matched
      // inside that entity, because the characters either side of it ("&" and
      // ";") are both non-word. The result was `&<a ...>amp</a>;T` in the
      // published page: a broken entity rendering as a stray ampersand, a
      // clickable "amp", and a stray semicolon.
      for (const piece of part.split(/(&(?:amp|lt|gt|quot|#0?39|apos|nbsp);)/g)) {
        if (piece === "") continue;
        const isEntity = piece.startsWith("&") && piece.endsWith(";");
        segments.push({ kind: "text", raw: piece, eligible: excludeDepth === 0 && !isEntity });
      }
    }
  }

  const maxLinks = opts.maxLinks ?? DEFAULT_MAX_INTERNAL_LINKS;
  const ownKey = urlKey(opts.ownUrl);
  const usedTargets = new Set<string>();
  const linked: { url: string; anchor: string }[] = [];

  for (const candidate of candidates) {
    if (linked.length >= maxLinks) break;
    const candKey = urlKey(candidate.url);
    if (candKey === ownKey) continue; // never link the page to itself
    if (usedTargets.has(candKey)) continue; // never more than one link to the same target
    // Candidate URLs come from a crawl of the customer's site - including, on
    // the WordPress fast path, `link` values their server sent us verbatim.
    // Same rule as every other URL this file writes into markup: a scheme this
    // renderer would refuse to render is a scheme it does not link to.
    if (classifyUrl(candidate.url) === "rejected") continue;

    // Longest anchor preferred over shorter: try the candidate's own longest
    // phrase first, and stop at the first one that matches anywhere.
    const seen = new Set<string>();
    const phrases = [candidate.title, ...(candidate.keywords ?? [])]
      .map((p) => (p ?? "").trim())
      .filter((p) => p.length >= MIN_ANCHOR_CHARS)
      .filter((p) => {
        const key = p.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.length - a.length)
      .map((p) => escapeHtml(p)); // compare in the same escaped space the HTML text is in

    let placed = false;
    for (const phrase of phrases) {
      if (placed) break;
      const phraseLower = phrase.toLowerCase();
      for (let i = 0; i < segments.length && !placed; i++) {
        const seg = segments[i];
        if (seg.kind !== "text" || !seg.eligible) continue;
        const hit = findWholeWordMatch(seg.raw.toLowerCase(), phraseLower);
        if (!hit) continue;

        const before = seg.raw.slice(0, hit.start);
        const matched = seg.raw.slice(hit.start, hit.end); // preserves the original casing found in the document
        const after = seg.raw.slice(hit.end);
        const anchorHtml = `<a href="${escapeHtml(candidate.url)}">${matched}</a>`;

        const replacement: Segment[] = [];
        if (before) replacement.push({ kind: "text", raw: before, eligible: true });
        replacement.push({ kind: "text", raw: anchorHtml, eligible: false });
        if (after) replacement.push({ kind: "text", raw: after, eligible: true });
        segments.splice(i, 1, ...replacement);

        usedTargets.add(candKey);
        linked.push({ url: candidate.url, anchor: decodeEntities(matched) });
        placed = true;
      }
    }
  }

  return { html: segments.map((s) => s.raw).join(""), linked };
}

// --- Public: buildSchema (JSON-LD) --------------------------------------------

export type SchemaInput = {
  headline: string;
  description: string;
  /** Canonical URL of the published page - becomes mainEntityOfPage. */
  url: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
  /** Default "Person". Pass "Organization" when the byline is the business
   *  itself rather than a named writer. */
  authorType?: "Person" | "Organization";
  /** The author's own page (a Person byline's about page). Optional. */
  authorUrl?: string;
  siteName: string;
  siteUrl: string;
  imageUrl?: string;
  faq?: FaqPair[];
};

export type BuildSchemaOpts = {
  logoUrl?: string;
};

/** Builds the Article JSON-LD object, plus a FAQPage merged in via "@graph"
 *  when `article.faq` has real entries. Returns a plain object - the caller
 *  is responsible for JSON.stringify()-ing it into a <script
 *  type="application/ld+json"> tag. Never invents a field it was not given:
 *  no logo unless `opts.logoUrl` is set, no image unless `article.imageUrl`
 *  is set. */
export function buildSchema(article: SchemaInput, opts: BuildSchemaOpts = {}): Record<string, unknown> {
  const publisher: Record<string, unknown> = {
    "@type": "Organization",
    name: article.siteName,
    url: article.siteUrl,
  };
  if (opts.logoUrl) {
    publisher.logo = { "@type": "ImageObject", url: opts.logoUrl };
  }

  const articleNode: Record<string, unknown> = {
    "@type": "Article",
    headline: article.headline,
    description: article.description,
    datePublished: article.datePublished,
    dateModified: article.dateModified,
    author: {
      "@type": article.authorType ?? "Person",
      name: article.authorName,
      ...(article.authorUrl ? { url: article.authorUrl } : {}),
    },
    publisher,
    mainEntityOfPage: { "@type": "WebPage", "@id": article.url },
  };
  if (article.imageUrl) articleNode.image = article.imageUrl;

  const faq = (article.faq ?? []).filter((f) => f.question?.trim() && f.answer?.trim());
  if (faq.length === 0) {
    return { "@context": "https://schema.org", ...articleNode };
  }

  const faqNode = {
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
  return { "@context": "https://schema.org", "@graph": [articleNode, faqNode] };
}

// --- Public: buildExcerpt -----------------------------------------------------

/** Masks fenced code block bodies to blank lines (same technique, and same
 *  reasoning, as article-validate.ts's fenceMask - a local copy because that
 *  one is not exported and this file's needs are narrower: it only ever
 *  looks at whole lines, never at line numbers). */
function maskFencedLines(markdown: string): string[] {
  const lines = markdown.split("\n");
  let inFence = false;
  let marker: "`" | "~" | null = null;
  const out: string[] = [];
  for (const line of lines) {
    const m = /^ {0,3}([`~]{3,})/.exec(line);
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
  return out;
}

/** First sentence of `text`, up to and including the first ., !, or ?. A
 *  single anchored lazy quantifier - see the file header's ReDoS note for
 *  why this specific pattern is linear rather than risky. */
function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(text);
  return m ? m[1].trim() : text.trim();
}

function truncateAtWordBoundary(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const boundary = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
  return `${boundary}...`;
}

/** The meta description: `metaDescription` when given, otherwise the first
 *  real sentence of prose - never a heading, a list item, a blockquote line,
 *  a table row, an hr, or anything inside a fenced code block. Always capped
 *  at `max` characters, cut at a word boundary. */
export function buildExcerpt(markdown: string, metaDescription?: string, max = 155): string {
  const meta = (metaDescription ?? "").trim();
  if (meta) return truncateAtWordBoundary(meta, max);

  const lines = maskFencedLines(markdown ?? "");
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^#{1,6}(\s|$)/.test(trimmed)) continue; // heading
    if (/^[-*+][ \t]/.test(trimmed) || /^\d{1,9}[.)][ \t]/.test(trimmed)) continue; // list item
    if (/^>/.test(trimmed)) continue; // blockquote
    if (trimmed.includes("|")) continue; // best-effort: a table row (header, separator, or body)
    if (isHr(trimmed)) continue;
    const plain = stripInlineMarkdownToPlainText(trimmed);
    if (!plain) continue;
    const sentence = firstSentence(plain);
    if (sentence) return truncateAtWordBoundary(sentence, max);
  }
  return "";
}

// --- Public: finishArticle -----------------------------------------------------

export type FinishArticleInput = {
  submission: ArticleSubmission;
  siteUrl: string;
  siteName: string;
  /** The internal-link candidate pool - typically the site's page inventory.
   *  Optional; no candidates means no internal links get inserted. */
  pages?: LinkCandidate[];
  ownSlug: string;
  publishedAt: string;
  /** Defaults to `publishedAt` - a brand-new post has not been modified yet. */
  modifiedAt?: string;
  authorName?: string;
  authorType?: "Person" | "Organization";
  authorUrl?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  /** Default 5 - see addInternalLinks(). */
  maxInternalLinks?: number;
};

export type FinishedArticle = {
  html: string;
  excerpt: string;
  schema: Record<string, unknown>;
  headings: RenderedHeading[];
  internalLinks: { url: string; anchor: string }[];
  wordCount: number;
  readingMinutes: number;
};

// Matches src/lib/blog.ts's own estimateReadingMinutes() constant exactly, so
// a reading time computed here for a WordPress publish and one computed by
// blog.ts for a repo-committed MDX post never disagree over the same 200
// words-per-minute assumption. (The word counts they start from differ
// slightly - this file's is article-validate.ts's prose-only count,
// blog.ts's is a raw whitespace split of the full MDX body including code
// fences and JSX - but the constant they're divided by is the same one.)
const WORDS_PER_MINUTE = 200;

function joinUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/${slug.replace(/^\/+/, "")}`;
}

/**
 * The one call a publisher makes. Composes the pieces above in order:
 * render the markdown, insert internal links into the rendered HTML, build
 * the excerpt (from the ORIGINAL markdown, independent of what the internal
 * linker did), then build the JSON-LD schema (using that excerpt as its
 * description, so the meta description and the schema description are
 * guaranteed to be the same text rather than two independently-truncated
 * near-duplicates).
 */
export function finishArticle(input: FinishArticleInput): FinishedArticle {
  const { submission } = input;
  const rendered = renderMarkdown(submission.markdown, { siteUrl: input.siteUrl });

  const ownUrl = joinUrl(input.siteUrl, input.ownSlug);
  const candidates = input.pages ?? [];
  const linkResult = candidates.length
    ? addInternalLinks(rendered.html, candidates, {
        ownUrl,
        maxLinks: input.maxInternalLinks ?? DEFAULT_MAX_INTERNAL_LINKS,
      })
    : { html: rendered.html, linked: [] as { url: string; anchor: string }[] };

  const excerpt = buildExcerpt(submission.markdown, submission.metaDescription);
  const modifiedAt = input.modifiedAt ?? input.publishedAt;

  const schema = buildSchema(
    {
      headline: submission.title,
      description: excerpt,
      url: ownUrl,
      datePublished: input.publishedAt,
      dateModified: modifiedAt,
      authorName: input.authorName ?? input.siteName,
      authorType: input.authorType,
      authorUrl: input.authorUrl,
      siteName: input.siteName,
      siteUrl: input.siteUrl,
      imageUrl: input.coverImageUrl,
      faq: submission.faq,
    },
    { logoUrl: input.logoUrl },
  );

  return {
    html: linkResult.html,
    excerpt,
    schema,
    headings: rendered.headings,
    internalLinks: linkResult.linked,
    wordCount: rendered.wordCount,
    readingMinutes: Math.max(1, Math.round(rendered.wordCount / WORDS_PER_MINUTE)),
  };
}

// --- Public: schemaScript ------------------------------------------------------

/**
 * The JSON-LD graph as a script tag ready to sit in a page.
 *
 * buildSchema returns the graph as an object, and for a long time nothing
 * turned it into anything: finishArticle handed back a `schema` field that its
 * only caller never read, so every article published through this pipeline
 * went out with no structured data at all. Caught on 2026-08-19 by the first
 * end-to-end publish against a real site, which is exactly the class of thing
 * only a real publish finds - every unit-level check passed, because the
 * object it produced was correct. It was simply thrown away.
 *
 * The escaping is not optional. `JSON.stringify` will happily emit the
 * characters `</script>` if any string in the graph contains them - an article
 * title, a FAQ answer - and the browser ends the script block there and treats
 * the rest as markup. Escaping the three characters that can start a tag or an
 * entity closes that without touching what the JSON means, since a JSON parser
 * reads \u003c and `<` identically.
 */
export function schemaScript(schema: Record<string, unknown>): string {
  const json = JSON.stringify(schema)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  return `\n<script type="application/ld+json">${json}</script>`;
}

// --- Public: toMdx -------------------------------------------------------------

/** Frontmatter field names match src/content/blog/*.mdx EXACTLY, as read by
 *  src/lib/blog.ts - title, description, date, keyword (singular - the ONE
 *  primary keyword the post targets, not a list), cover. Inventing a
 *  different shape (a "keywords" array, say) would produce a file blog.ts
 *  silently fails to read the intended fields from, since it reads through
 *  gray-matter's untyped `data` object with no schema to catch the mismatch. */
export type ToMdxOpts = {
  /** YYYY-MM-DD, matching blog.ts's PostMeta.date convention. */
  date: string;
  /** e.g. "/blog/covers/<slug>.webp" - the shape blog.ts's `cover` field expects. */
  coverPath?: string;
};

/** Minimal YAML double-quoted scalar - always quotes, unlike this repo's
 *  existing hand-written posts (which mostly get away with bare scalars).
 *  Machine-generated frontmatter cannot assume the title/description will
 *  never contain a ": " sequence, a leading "#", or a stray quote - any of
 *  which breaks an unquoted YAML scalar - so this always emits the quoted
 *  form, which is unconditionally safe. */
export function yamlDoubleQuote(s: string): string {
  const oneLine = s.replace(/[\r\n]+/g, " ").trim();
  return `"${oneLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Builds a repo-ready MDX file: frontmatter, then the article's ORIGINAL
 *  markdown body unchanged - a repo-based site wants markdown source to
 *  commit, not this file's rendered HTML. */
export function toMdx(
  submission: Pick<ArticleSubmission, "title" | "metaDescription" | "markdown" | "primaryKeyword">,
  opts: ToMdxOpts,
): string {
  const frontmatter = [
    "---",
    `title: ${yamlDoubleQuote(submission.title)}`,
    `description: ${yamlDoubleQuote(submission.metaDescription)}`,
    `date: ${opts.date}`,
  ];
  if (submission.primaryKeyword?.trim()) {
    frontmatter.push(`keyword: ${yamlDoubleQuote(submission.primaryKeyword)}`);
  }
  if (opts.coverPath) {
    frontmatter.push(`cover: ${opts.coverPath}`);
  }
  frontmatter.push("---", "");
  return `${frontmatter.join("\n")}\n${submission.markdown.trimEnd()}\n`;
}
