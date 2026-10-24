// Deterministic text work for the hosted writer: nothing here calls a model
// or the database. Claim sentences, figures, shingles for originality,
// banned phrases, the site brief's rendering. Kept pure so every rule can be
// unit-tested with plain strings - and so the judge is only ever asked
// questions code cannot answer.

export type Fact = {
  id: string;
  claim: string;
  quote: string;
  url: string;
  /** stat | price | step | pitfall | definition | example | opinion */
  kind: string;
  /** How many fetched pages state the same thing (deduped into one fact). */
  support: number;
  /** ISO date of the page it came from, when the page said. */
  date: string | null;
};

export type Source = {
  n: number;
  url: string;
  title: string | null;
  host: string;
  /** official | publisher | forum | product | unknown */
  type: string;
  date: string | null;
  wordCount: number;
  headings: string[];
  /** Hashed 8-word shingles of the page text, for the overlap gate. */
  shingles: number[];
};

export type SiteBrief = {
  name: string;
  url: string;
  about: string;
  tone: string;
  /** The site's own pages that relate to the keyword: citable as [S1]… */
  pages: { n: number; url: string; title: string; why: string }[];
  /** Search Console queries this site already gets impressions for. */
  queries: { query: string; impressions: number; position: number }[];
  /** Keyword already ranks on an existing page of this site. */
  alreadyRanks: { url: string; position: number } | null;
};

export type FactSheet = {
  keyword: string;
  facts: Fact[];
  sources: Source[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  /** Subtopics (normalised headings) and how many sources cover each. */
  coverage: { topic: string; sources: number }[];
  /** Median word count of the sources: the length the SERP expects. */
  medianWords: number;
  grounding: "serp" | "none";
};

// --- Tokens, shingles, overlap -----------------------------------------------

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu) ?? []);
}

/** FNV-1a over a joined n-gram: small, stable, fast. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export const SHINGLE_N = 8;

export function shingleHashes(text: string, n = SHINGLE_N): number[] {
  const t = tokens(text);
  const out = new Set<number>();
  for (let i = 0; i + n <= t.length; i++) out.add(hash(t.slice(i, i + n).join(" ")));
  return [...out];
}

/** Fraction of the draft's shingles found in one source, and the longest
 *  verbatim run in words. Quoted spans ("…") are excluded from the draft
 *  side: an attributed quote is allowed to match its source. */
export function overlapWith(draft: string, sourceShingles: number[], n = SHINGLE_N): { fraction: number; longestRun: number } {
  const unquoted = draft.replace(/"[^"\n]{20,}"/g, " ").replace(/“[^”\n]{20,}”/g, " ");
  const t = tokens(unquoted);
  if (t.length < n) return { fraction: 0, longestRun: 0 };
  const src = new Set(sourceShingles);
  let hits = 0;
  let run = 0;
  let longest = 0;
  const total = t.length - n + 1;
  for (let i = 0; i < total; i++) {
    if (src.has(hash(t.slice(i, i + n).join(" ")))) {
      hits++;
      run++;
      longest = Math.max(longest, run + n - 1);
    } else run = 0;
  }
  return { fraction: hits / total, longestRun: longest };
}

export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// --- Claims and figures ------------------------------------------------------

/** Sentences that assert something checkable: a figure, a citation marker,
 *  or a reporting verb after a name. Everything else is the writer's own
 *  reasoning and is judged for usefulness, not truth. */
export function claimSentences(markdown: string): string[] {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+ .*$/gm, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/\|/g, " . ");
  const sentences = prose.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const out: string[] = [];
  for (const s of sentences) {
    const hasFigure = /(?<![\w/.-])(?:[$€£₪]\s?\d|\d[\d,.]*\s?%|\d{2,})(?![\w/.-])/.test(s.replace(/\b(19|20)\d{2}\b/g, ""));
    const hasCite = /\[\d+\]|\[S\d+\]/.test(s);
    const hasReport = /\b(?:according to|found that|reports?|recommends?|requires?|study|survey|research shows|data shows)\b/i.test(s);
    if (hasFigure || hasCite || hasReport) out.push(s.slice(0, 400));
  }
  return [...new Set(out)].slice(0, 60);
}

/** Figures worth checking: two or more digits, or a percent or currency
 *  sign. Years stand alone are structure ("in 2026"), URLs are stripped,
 *  commas are dropped so 1,200 and 1200 compare equal, citation markers are
 *  not figures. Matching uses digit boundaries so 150 is not found inside
 *  1500. */
export function figuresIn(markdown: string): string[] {
  const body = markdown
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[S?\d+\]/g, " ")
    .replace(/,(?=\d{3}\b)/g, "");
  const found = new Set<string>();
  for (const m of body.matchAll(/(?<![\d.])(?:[$€£₪]\s?\d[\d.]*|\d[\d.]*\s?%|\d{2,}(?:\.\d+)?)(?![\d.])/g)) {
    const f = m[0].replace(/\s/g, "");
    if (/^(19|20)\d{2}$/.test(f)) continue;
    found.add(f);
  }
  return [...found];
}

export function figureAppearsIn(figure: string, haystack: string): boolean {
  const clean = haystack.replace(/,(?=\d{3}\b)/g, "");
  const esc = figure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/^\\\$/, "[$€£₪]?\\s?");
  return new RegExp(`(?<![\\d.])${esc}(?![\\d.])`).test(clean);
}

/** Top-k passages by token overlap with a claim: the candidates the judge
 *  decides between, so it never reads the whole sheet per claim. */
export function bestQuotesFor(claim: string, facts: Fact[], k = 3): Fact[] {
  const c = new Set(tokens(claim));
  return facts
    .map((f) => {
      const q = tokens(f.quote + " " + f.claim);
      let hits = 0;
      for (const t of q) if (c.has(t)) hits++;
      return { f, score: hits / Math.sqrt(q.length + 1) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.f);
}

// --- Slop phrases --------------------------------------------------------------

/** The phrases that mark text as generated in a reader's first second.
 *  English only for now; a per-language list is the next step. */
export const BANNED_PHRASES = [
  "in today's",
  "delve",
  "landscape",
  "navigate the",
  "it's important to note",
  "it is important to note",
  "whether you're a",
  "game-changer",
  "game changer",
  "unlock",
  "elevate",
  "seamless",
  "robust",
  "in conclusion",
  "comprehensive guide",
  "let's dive",
  "look no further",
  "ever-evolving",
  "plays a crucial role",
  "in the realm of",
  "a testament to",
  "it's worth noting",
  "at the end of the day",
  "when it comes to",
  "in this article",
  "in this guide",
  "we'll explore",
];

export function bannedPhraseHits(markdown: string): string[] {
  const lower = markdown.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

// --- Rendering the evidence for prompts ----------------------------------------

export function renderSheet(sheet: FactSheet, brief: SiteBrief | null): string {
  const lines: string[] = ["SOURCES (cite by number):"];
  for (const s of sheet.sources) {
    lines.push(`[${s.n}] ${s.title ?? s.url} - ${s.host} (${s.type}${s.date ? `, ${s.date.slice(0, 10)}` : ""}) ${s.url}`);
  }
  if (brief?.pages.length) {
    lines.push("", "THIS SITE'S OWN PAGES (cite as [S<n>], link inline where they genuinely help):");
    for (const p of brief.pages) lines.push(`[S${p.n}] ${p.title} - ${p.url} (${p.why})`);
  }
  lines.push("", "FACTS (each with the verbatim passage it came from):");
  for (const f of sheet.facts) {
    const n = sheet.sources.find((s) => s.url === f.url)?.n ?? "?";
    lines.push(`- (${f.id}) [${n}] ${f.kind}${f.support > 1 ? `, ${f.support} sources agree` : ""}${f.date ? `, page dated ${f.date.slice(0, 7)}` : ""}: ${f.claim}\n  quote: "${f.quote}"`);
  }
  if (sheet.peopleAlsoAsk.length) lines.push("", "QUESTIONS PEOPLE ALSO ASK (the only allowed FAQ questions):", ...sheet.peopleAlsoAsk.map((q) => `- ${q}`));
  if (sheet.relatedSearches.length) lines.push("", "RELATED SEARCHES:", ...sheet.relatedSearches.map((q) => `- ${q}`));
  if (sheet.coverage.length) {
    lines.push("", "WHAT PAGE ONE ALREADY COVERS (subtopic: how many of the top pages have it):");
    for (const c of sheet.coverage.slice(0, 30)) lines.push(`- ${c.topic}: ${c.sources}`);
  }
  if (brief) {
    lines.push("", `ABOUT THIS SITE: ${brief.name} (${brief.url}). ${brief.about}`);
    if (brief.tone) lines.push(`HOUSE RULES / TONE: ${brief.tone}`);
    if (brief.queries.length) lines.push("SEARCHES THIS SITE ALREADY GETS: " + brief.queries.slice(0, 20).map((q) => q.query).join("; "));
  }
  return lines.join("\n");
}

/** The site's own numbers (prices, thresholds) are legitimate figures the
 *  fact sheet does not carry. */
export function briefText(brief: SiteBrief | null): string {
  if (!brief) return "";
  return [brief.about, brief.tone, ...brief.pages.map((p) => `${p.title} ${p.why}`)].join("\n");
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function sameDomain(host: string, own: string): boolean {
  const d = host.replace(/^www\./, "").toLowerCase();
  return d === own || d.endsWith(`.${own}`);
}

export function classifyHost(host: string, url: string): string {
  if (/\.(gov|edu|mil)(\.[a-z]{2})?$|\.gov\.[a-z]{2}$|\.ac\.[a-z]{2}$/.test(host)) return "official";
  if (/^(docs|developer|developers|support|help|learn)\./.test(host) || /\/docs?\//.test(url)) return "official";
  if (/(reddit|quora|stackexchange|stackoverflow|discourse|community\.|forum)/.test(host)) return "forum";
  if (/\/(products?|collections?|shop|p|dp|item|listing)\//.test(url) || /(amazon|ebay|etsy|aliexpress|walmart)\./.test(host)) return "product";
  if (/(wikipedia|britannica)\./.test(host)) return "reference";
  return "publisher";
}

export const SKIP_HOSTS = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|pinterest\.com|linkedin\.com|amazon\.[a-z.]+|quora\.com|reddit\.com)$/i;

export function normalizeTopic(heading: string, keywordTokens: Set<string>): string {
  return tokens(heading)
    .filter((t) => t.length > 2 && !keywordTokens.has(t) && !STOP.has(t))
    .sort()
    .join(" ");
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "your", "you", "are", "how", "what", "why", "when", "can", "does", "did", "will", "from", "into", "about", "best", "top", "guide", "tips", "faq", "faqs", "conclusion", "introduction", "overview", "summary", "final", "thoughts"]);

/** The median SERP length, clamped to a sane band; the plan targets it. */
export function targetWords(sources: Source[]): number {
  const counts = sources.map((s) => s.wordCount).filter((n) => n > 150).sort((a, b) => a - b);
  if (counts.length === 0) return 1200;
  const median = counts[Math.floor(counts.length / 2)];
  return Math.min(2500, Math.max(700, Math.round(median * 1.1)));
}

export function slugify(s: string, fallback = ""): string {
  const clean = (v: string) =>
    v
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  return clean(s) || clean(fallback) || `article-${Math.random().toString(36).slice(2, 8)}`;
}

/** [n] and [S<n>] markers become visible inline links on the published page:
 *  a bare "[3]" is an AI tell, a link to the source is a citation. */
export function linkCitations(markdown: string, sources: Source[], pages: SiteBrief["pages"]): string {
  // One visible link per source per block: the writer is told to cite once
  // per paragraph, and when it still repeats a marker the repeats vanish. A
  // block is a paragraph, a list item or a table row - the units a reader
  // scans. The verify stage already ran on the marked-up text, so dropping
  // repeats here changes what the reader sees, not what was checked.
  return markdown
    .split("\n")
    .reduce<string[][]>((blocks, line) => {
      const last = blocks[blocks.length - 1];
      const startsBlock = !last || line.trim() === "" || /^(\s*[-*]\s|\s*\d+\.\s|\|)/.test(line) || last[last.length - 1]?.trim() === "";
      if (startsBlock) blocks.push([line]);
      else last.push(line);
      return blocks;
    }, [])
    .map((lines) => {
      const seen = new Set<string>();
      return lines
        .join("\n")
        .replace(/\s?\[S(\d+)\]/g, (m, n: string) => {
          const p = pages.find((x) => x.n === Number(n));
          if (!p || seen.has("S" + n)) return "";
          seen.add("S" + n);
          return ` ([${shortLabel(p.title)}](${p.url}))`;
        })
        .replace(/\s?\[(\d+)\]/g, (m, n: string) => {
          const s = sources.find((x) => x.n === Number(n));
          if (!s || seen.has(n)) return "";
          seen.add(n);
          return ` ([${s.host}](${s.url}))`;
        });
    })
    .join("\n");
}

function shortLabel(title: string): string {
  const t = title.replace(/\s*[|–-]\s*.*$/, "").trim();
  return (t.length > 40 ? t.slice(0, 37) + "…" : t) || "this page";
}

/** The FAQ section, when the writer produced one, as data: "## FAQ" then
 *  "**Question**" paragraphs each followed by an answer. */
/** The FAQ is the LAST H2 section when it is made of bold questions each
 *  followed by an answer - whatever language the heading is in. */
export function parseFaq(markdown: string): { body: string; faq: { question: string; answer: string }[]; heading: string } {
  const sections = splitSections(markdown);
  const last = sections[sections.length - 1];
  if (!last || !last.heading) return { body: markdown, faq: [], heading: "" };
  const parts = last.text.trim().split(/\n(?=\*\*[^*\n]+\*\*\s*\n)/);
  const faq: { question: string; answer: string }[] = [];
  for (const part of parts) {
    const q = part.trim().match(/^\*\*([^*\n]+)\*\*\s*\n([\s\S]*)$/);
    if (q && q[2].trim().length > 20) faq.push({ question: q[1].trim(), answer: q[2].trim() });
  }
  if (faq.length === 0 || faq.length < parts.filter((p) => p.trim()).length) return { body: markdown, faq: [], heading: "" };
  return { body: joinSections(sections.slice(0, -1)).trimEnd() + "\n", faq, heading: last.heading };
}

export function renderFaq(faq: { question: string; answer: string }[], heading = "Frequently asked questions"): string {
  if (faq.length === 0) return "";
  return `\n## ${heading}\n\n${faq.map((f) => `**${f.question}**\n\n${f.answer}`).join("\n\n")}\n`;
}

// Fenced code blocks and inline code spans are literal in markdown AND in
// MDX, and a developer-facing article legitimately contains "<div>" or "{}"
// inside them - so the sanitizer below leaves code alone and only touches
// prose. Placeholders are private-use characters no model output contains.
// Both regexes follow CommonMark so that what the sanitizer skips as "code"
// is exactly what the compiler renders as code: a fence may be indented up to
// three spaces, its closing run must use the same character and be at least
// as long; a code span's closing backtick run must EQUAL the opening run (an
// unmatched run is literal text, which MDX would read as prose).
// A backtick fence's info string may not contain a backtick (CommonMark),
// so "```a`b" is a paragraph, not a fence; tildes have no such rule.
const CODE_FENCE_BT_RE = /(^|\n) {0,3}(`{3,})(?![^\n]*`)[^\n]*\n[\s\S]*?\n {0,3}\2`*[ \t]*(?=\n|$)/g;
const CODE_FENCE_TILDE_RE = /(^|\n) {0,3}(~{3,})[^\n]*\n[\s\S]*?\n {0,3}\2~*[ \t]*(?=\n|$)/g;
// A backslash-escaped backtick is literal text, never a span opener.
const CODE_SPAN_RE = /(?<![`\\])(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g;

function withProseOnly(markdown: string, fn: (prose: string) => string): string {
  const stash: string[] = [];
  const keep = (m: string) => {
    stash.push(m);
    return `\uE000${stash.length - 1}\uE001`;
  };
  const masked = markdown.replace(CODE_FENCE_BT_RE, keep).replace(CODE_FENCE_TILDE_RE, keep).replace(CODE_SPAN_RE, keep);
  return fn(masked).replace(/\uE000(\d+)\uE001/g, (_, i: string) => stash[Number(i)]);
}

/** The writer's output is model text grown from pages we fetched off the
 *  web, i.e. untrusted twice over, and the repo route writes it into the
 *  customer's own blog folder where .mdx files are COMPILED at their build.
 *  So, in prose (never inside code): every raw HTML tag and comment goes
 *  (its inner text stays), a link with any scheme but http(s) collapses to
 *  its label, curly braces are escaped so MDX never evaluates them, and a
 *  line that would be an MDX import/export becomes plain words. The quality
 *  gate separately REJECTS script/iframe/style tags and javascript: links;
 *  this is the belt to that suspender, for everything the gate's list does
 *  not name (img onerror, svg onload, unquoted hrefs, data: URLs, {expr}). */
const TAG_RE = /<\/?(?!https?:\/\/)[a-zA-Z!?][^<>]*>/g;

/** Strip tags until nothing changes, then escape any "<" still followed by a
 *  letter: a nested "<<b>script>" survives one pass as "<script>", and a
 *  stray "<" that never closes is not a tag but must not become one later. */
function stripTagsToFixedPoint(text: string): string {
  let prev: string;
  do {
    prev = text;
    text = text.replace(TAG_RE, "");
  } while (text !== prev);
  return text.replace(/<(?=\/?[a-zA-Z!?])(?!https?:\/\/)/g, "&lt;");
}

export function sanitizeWriterMarkdown(markdown: string): string {
  return withProseOnly(markdown, (prose) =>
    prose
      .replace(/<!--[\s\S]*?-->/g, "")
      // Links first, so an <a href="javascript:..."> collapses to its label
      // before the generic tag strip would leave the label alone anyway.
      // A raw <a> becomes a markdown link when its href is http(s) (so the
      // allowlist in restrictLinks still judges it) and just its label
      // otherwise - javascript:, data:, unquoted, whatever.
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (m, label: string) => {
        const href = m.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const url = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim();
        return /^https?:\/\//i.test(url) ? `[${label}](${url})` : label;
      })
      // Reference-style definitions carry destinations too; none survive.
      .replace(/^\s*\[[^\]\n]+\]:\s*\S+.*$/gm, "")
      // Links and images, judged POSITIVELY: a destination must start with
      // http(s):// as literally written, and contain no backslash escape and
      // no character entity. CommonMark decodes both inside destinations, so
      // "java\script:" and "&#106;avascript:" are javascript: once rendered;
      // a rule that only recognises things that LOOK like a scheme misses
      // them. Anything else - other schemes, relative paths, obfuscated
      // hosts - collapses to its label (an image to its alt text). Handles
      // the <angle-wrapped> form and (parentheses) inside the URL.
      .replace(
        /!?\[([^\]\n]*)\]\(\s*(?:<([^>\n]*)>|([^()\s]*(?:\([^()\s]*\)[^()\s]*)*))(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g,
        (m, label: string, angled: string | undefined, bare: string | undefined) => {
          const dest = (angled ?? bare ?? "").trim();
          return /^https?:\/\//i.test(dest) && !/[\\]|&#|&[a-zA-Z]+;/.test(dest) ? m : label;
        },
      )
      // Any remaining HTML tag, open or close, except markdown autolinks.
      // To a fixed point: one pass turns "<<b>script>" into "<script>".
      .replace(/<\/?(?!https?:\/\/)[a-zA-Z!?][^<>]*>/g, "")
      .replace(/^[\s\S]*$/, (rest) => stripTagsToFixedPoint(rest))
      // Entities, not backslashes: a brace the model already wrote as "\{"
      // would become "\\{", which MDX reads as an escaped backslash and then
      // a live expression. &#123; cannot be undone by anything before it.
      .replace(/[{}]/g, (ch) => (ch === "{" ? "&#123;" : "&#125;"))
      .replace(/^(\s*)(import|export)(?=\s)/gm, (m, ws: string, kw: string) => `${ws}&#${kw.charCodeAt(0)};${kw.slice(1)}`),
  );
}

/** Every way markdown can carry a link, reduced to the allowed set: exact
 *  research-source URLs and the site's own domain. Everything else becomes
 *  its label or disappears. A ranking page with injected text must not be
 *  able to place a link on the customer's site. Runs the sanitizer first so
 *  the link rules below only ever see http(s) links in clean prose. */
export function restrictLinks(markdown: string, allowedUrls: Set<string>, ownDomain: string): string {
  // Judged on the PARSED URL, never on the text: the protocol must be
  // http(s) and the hostname must be the site's own, or the exact string
  // must be a research source. A string the URL parser rejects is not a
  // link we place anywhere.
  const allowed = (url: string) => {
    if (allowedUrls.has(url) || allowedUrls.has(url.replace(/\/$/, ""))) return true;
    try {
      const u = new URL(url);
      return (u.protocol === "http:" || u.protocol === "https:") && sameDomain(u.hostname, ownDomain);
    } catch {
      return false;
    }
  };
  return sanitizeWriterMarkdown(markdown)
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, url: string, label: string) => (allowed(url) ? `[${label}](${url})` : label))
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, "")
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g, (m, label: string, url: string) => (allowed(url) ? `[${label}](${url})` : label))
    .replace(/<(https?:\/\/[^>\s]+)>/g, (m, url: string) => (allowed(url) ? `<${url}>` : ""))
    .replace(/(^|[^(<"'\]])(https?:\/\/[^\s)<>"']+)/g, (m, pre: string, url: string) => (allowed(url) ? m : pre));
}

/** Split an article into its H2 sections, keeping the intro as "". */
export function splitSections(markdown: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = "";
  let buf: string[] = [];
  for (const line of markdown.split("\n")) {
    const h = line.match(/^## (.+)$/);
    if (h) {
      out.push({ heading, text: buf.join("\n") });
      heading = h[1].trim();
      buf = [];
    } else buf.push(line);
  }
  out.push({ heading, text: buf.join("\n") });
  return out;
}

export function joinSections(sections: { heading: string; text: string }[]): string {
  return sections.map((s) => (s.heading ? `## ${s.heading}\n${s.text}` : s.text)).join("\n");
}
