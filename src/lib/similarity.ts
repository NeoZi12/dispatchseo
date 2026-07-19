// Corpus sameness detection: does a new guide read like the ones this site
// already published?
//
// Why this exists: template convergence across a site's OWN articles is the
// scaled-content-abuse fingerprint search engines discount - every post
// sharing an intro pattern, a heading skeleton, and the same stock phrases
// reads as one template wearing N keywords. It is invisible in per-article
// review (each one looks fine alone) and NO commercial content tool checks it
// for you - Surfer/Clearscope/MarketMuse all benchmark a draft against
// COMPETITORS, never against your own back catalogue.
//
// Everything here is deterministic and dependency-free: plain string math, no
// model judgement, no API. That is the point - the build-guide playbook
// already asks the agent to "vary the structure", and an agent grading its own
// prose for sameness is exactly the vibes-based check this replaces.
//
// Two consumers share these functions: the check_sameness MCP tool (the
// pre-publish gate the builder must pass) and the weekly drift audit.

export type Features = {
  // First ~12 words of the opening paragraph, normalized.
  opening: string[];
  // Normalized H2 headings, keyword tokens stripped (see normalizeHeading).
  headings: string[];
  // Normalized full body text, tokenized.
  words: string[];
};

export type CorpusEntry = Features & { label: string };

export type Flag = {
  kind: "opening" | "headings" | "phrases";
  // The offending text, verbatim, so the fix is mechanical rather than a hunt.
  detail: string;
  against: string;
};

export type Verdict = {
  pass: boolean;
  compared_against: number;
  flags: Flag[];
  note: string;
};

// Tunable in one place. Deliberately loose: this gate exists to catch a draft
// that is a RE-SKIN of a recent post, not to police every echoed phrase. A
// false fail costs a rewrite loop in CI, so the thresholds favour precision.
export const OPENING_NGRAM = 6; // an identical 6-word opener is a template tell
export const HEADING_OVERLAP_LIMIT = 0.6; // >60% of the same normalized H2s
export const STOCK_PHRASE_LEN = 5; // 5-word shingles
export const STOCK_PHRASE_LIMIT = 3; // >3 shared across half the corpus
export const CORPUS_SIZE = 8; // recent guides to compare against

const WORD = /[a-z0-9']+/g;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter(Boolean);
}

// Headings are compared with the topic REMOVED, which is the whole trick: two
// guides on different keywords still share a skeleton when their H2s are
// "What is <kw>?", "How does <kw> work?", "<kw> vs <other>". Strip the
// keyword tokens and both collapse to "what is", "how does work" - the
// template shows itself. Without this, literal heading text almost never
// matches across topics and the check would find nothing.
export function normalizeHeading(heading: string, keywordTokens: Set<string>): string {
  return tokenize(heading)
    .filter((w) => !keywordTokens.has(w))
    .join(" ")
    .trim();
}

export function shingles(words: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

// ---- extraction -----------------------------------------------------------

// Strip the fenced code blocks, inline code, images/links, and markdown
// punctuation that would otherwise dominate the shingles. Code samples are
// SUPPOSED to repeat across guides (the same install command is the same
// command); prose is what must vary.
function stripMarkdown(md: string): string {
  return md
    .replace(/^---\n[\s\S]*?\n---/, "") // frontmatter
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    // Link ANCHOR TEXT goes too, on both sides of the comparison. The body
    // contract mandates 2-3 links to sibling guides, so anchors are sibling
    // TITLES - which also appear in every published page's related-posts rail.
    // Kept, they would flag a compliant draft for obeying its instructions:
    // measured against the real corpus, the "shared phrases" were almost all
    // other guides' titles. Losing a few words per link from a ~2000-word
    // shingle pool costs nothing; keeping them costs a false failure a day.
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ") // stray jsx/html
    .replace(/[#*_>|]/g, " ");
}

export function extractFromMarkdown(md: string, keywordTokens: Set<string>): Features {
  const headings = [...md.matchAll(/^##\s+(.+)$/gm)]
    .map((m) => normalizeHeading(m[1], keywordTokens))
    .filter(Boolean);

  const body = stripMarkdown(md);
  // The opening is the first real paragraph: skip headings, frontmatter, and
  // any leading blockquote (the TL;DR the contract mandates).
  const firstPara =
    body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p.length > 40) ?? "";

  return {
    opening: tokenize(firstPara).slice(0, 12),
    headings,
    words: tokenize(body),
  };
}

// Decode the entities that actually appear in rendered prose, so HTML text
// tokenizes identically to the markdown side. Measured on a real guide:
// &#x27; appears 27 times, which without this turns every "wasn't" into
// "wasn" + "x27" + "t" and silently fails to match the same contraction in a
// draft - a false PASS, the expensive direction for this gate.
function decodeEntities(s: string): string {
  return s
    .replace(/&(?:#0*39|#x0*27|apos|lsquo|rsquo);/gi, "'")
    .replace(/&(?:#0*34|#x0*22|quot|ldquo|rdquo);/gi, '"')
    .replace(/&(?:#0*160|nbsp);/gi, " ")
    .replace(/&(?:#0*38|#x0*26|amp);/gi, "&")
    .replace(/&(?:#0*60|#x0*3c|lt);/gi, "<")
    .replace(/&(?:#0*62|#x0*3e|gt);/gi, ">")
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, " ");
}

export function extractFromHtml(html: string, keywordTokens: Set<string>): Features {
  // Kill the chrome first so nav/footer boilerplate never counts as content -
  // every page shares those by design.
  const main = html
    .replace(/<(script|style|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Anchors are stripped INSIDE an already-bounded chunk, never across the
  // document: a page-wide /<a...>[\s\S]*?<\/a>/ swallowed four real
  // paragraphs (intro, TL;DR, definition) on a live guide, because the next
  // </a> it found sat far below the one it started from. Bounded chunks
  // cannot span that way.
  const clean = (chunk: string) =>
    decodeEntities(chunk.replace(/<a[^>]*>[\s\S]*?<\/a>/gi, " ").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();

  const headings = [...main.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => normalizeHeading(clean(m[1]), keywordTokens))
    .filter(Boolean);

  // PROSE ONLY - the <p> elements. Related-post rails, card grids, and tag
  // chips live in divs and lists, and pour every OTHER guide's title into this
  // one's word pool: measured against the real site, that leak was 64 of the
  // 65 "shared phrases" this gate found. Paragraphs exclude it structurally.
  // Code blocks (<pre>) drop out for free, which is right - the same install
  // command SHOULD repeat across guides; only prose has to vary.
  const paragraphs = [...main.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => clean(m[1]))
    .filter(Boolean);

  const firstPara = paragraphs.find((p) => p.length > 40) ?? "";

  return {
    opening: tokenize(firstPara).slice(0, 12),
    headings,
    words: tokenize(paragraphs.join(" ")),
  };
}

// ---- the comparison -------------------------------------------------------

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

// Compare one draft against the recent corpus. Returns every flag found (not
// just the first) so a rewrite fixes everything in one pass instead of
// discovering the next failure on the next CI run.
export function compareToCorpus(draft: Features, corpus: CorpusEntry[]): Verdict {
  const flags: Flag[] = [];
  if (corpus.length === 0) {
    return {
      pass: true,
      compared_against: 0,
      flags: [],
      note: "Nothing published yet to compare against - nothing to converge on. Pass.",
    };
  }

  // 1. Identical opening n-gram: the strongest single template tell, because
  //    the intro is the one place every writer reaches for the same crutch.
  const draftOpen = shingles(draft.opening, OPENING_NGRAM);
  for (const entry of corpus) {
    for (const gram of shingles(entry.opening, OPENING_NGRAM)) {
      if (draftOpen.has(gram)) {
        flags.push({
          kind: "opening",
          detail: `Opening repeats a ${OPENING_NGRAM}-word run: "${gram}"`,
          against: entry.label,
        });
        break;
      }
    }
  }

  // 2. Heading skeleton: same H2 shape with the topic swapped out.
  const draftHeads = new Set(draft.headings);
  for (const entry of corpus) {
    const overlap = jaccard(draftHeads, new Set(entry.headings));
    if (overlap > HEADING_OVERLAP_LIMIT) {
      const shared = entry.headings.filter((h) => draftHeads.has(h));
      flags.push({
        kind: "headings",
        detail: `Heading skeleton is ${Math.round(overlap * 100)}% the same (limit ${Math.round(
          HEADING_OVERLAP_LIMIT * 100,
        )}%). Shared once the keyword is stripped: ${shared
          .slice(0, 5)
          .map((h) => `"${h}"`)
          .join(", ")}`,
        against: entry.label,
      });
    }
  }

  // 3. Stock phrases: prose crutches that have hardened into house style.
  //    Only phrases present in MOST of the corpus AND this draft count - a
  //    phrase shared with one post is a coincidence, shared with half the
  //    catalogue it is a template.
  const draftShingles = shingles(draft.words, STOCK_PHRASE_LEN);
  const spread = new Map<string, number>();
  for (const entry of corpus) {
    for (const s of shingles(entry.words, STOCK_PHRASE_LEN)) {
      if (draftShingles.has(s)) spread.set(s, (spread.get(s) ?? 0) + 1);
    }
  }
  const majority = Math.max(2, Math.ceil(corpus.length / 2));
  const stock = [...spread.entries()]
    .filter(([, n]) => n >= majority)
    .map(([phrase]) => phrase)
    .sort();
  if (stock.length > STOCK_PHRASE_LIMIT) {
    flags.push({
      kind: "phrases",
      detail: `${stock.length} stock phrases shared with most recent guides (limit ${STOCK_PHRASE_LIMIT}): ${stock
        .slice(0, 8)
        .map((s) => `"${s}"`)
        .join(", ")}`,
      against: `${majority}+ of ${corpus.length} guides`,
    });
  }

  const pass = flags.length === 0;
  return {
    pass,
    compared_against: corpus.length,
    flags,
    note: pass
      ? `Reads as its own piece against the last ${corpus.length} guides.`
      : `Too close to what this site already published - rewrite the flagged elements (never loosen the check) and re-run.`,
  };
}

// The pairwise score behind the weekly drift audit: one number per pair of
// published guides, same signals as the gate. 0 = unrelated, 1 = identical.
export function pairScore(a: Features, b: Features): number {
  const headings = jaccard(new Set(a.headings), new Set(b.headings));
  const body = jaccard(shingles(a.words, STOCK_PHRASE_LEN), shingles(b.words, STOCK_PHRASE_LEN));
  const opening = jaccard(shingles(a.opening, OPENING_NGRAM), shingles(b.opening, OPENING_NGRAM));
  // Heading skeleton carries the most template signal; body shingles catch
  // house-style crutches; a shared opener is rare enough to be damning.
  return Number((headings * 0.5 + body * 0.3 + opening * 0.2).toFixed(4));
}
