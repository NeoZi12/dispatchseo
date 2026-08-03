// Pure, client-safe logic behind the Keyword Cannibalization Checker widget.
// No network calls, no DOM - just comparing the target keywords and titles a
// user pastes in and flagging pairs likely competing for the same query.
// Deliberately keyword/title-only, not full-body comparison: this is a
// pre-publish check ("am I about to duplicate a page that already exists"),
// not the internal-linking tool's job of finding topical overlap in prose.

export type CannibalizationPage = {
  id: string;
  url: string;
  title: string;
  keyword: string;
};

export type CannibalizationSuggestion = {
  aId: string;
  aUrl: string;
  aTitle: string;
  aKeyword: string;
  bId: string;
  bUrl: string;
  bTitle: string;
  bKeyword: string;
  severity: "direct" | "likely";
  score: number;
  sharedTerms: string[];
  keepId: string;
  keepReason: string;
};

const STOPWORDS = new Set(
  (
    "a an and are as at be by for from how in into is it of on or our that the their " +
    "this to too what when where which who why with your you"
  ).split(" "),
);

// Overlap needed (0.7 keyword weight, 0.3 title weight) below the exact-match
// case to still call two pages "likely" competing for the same query.
const OVERLAP_THRESHOLD = 0.34;
const KEYWORD_WEIGHT = 0.7;
const TITLE_WEIGHT = 0.3;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function uniq(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  let intersectionSize = 0;
  for (const t of setA) if (setB.has(t)) intersectionSize++;
  return intersectionSize / union.size;
}

function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((t) => setB.has(t));
}

function sameTokenSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort().join("|");
  const sortedB = [...b].sort().join("|");
  return sortedA === sortedB;
}

// Fraction of a page's own keyword terms that already show up in its own
// title - a proxy for how tightly that page is written for the keyword it's
// targeting. Used to decide which of two conflicting pages should stay
// canonical: a real signal computed from what was pasted in, never a guess
// at which page "ranks better" (we have no rank data here).
function alignmentScore(titleTokens: string[], keywordTokens: string[]): number {
  const kw = uniq(keywordTokens);
  if (kw.length === 0) return 0;
  const titleSet = new Set(titleTokens);
  const matched = kw.filter((t) => titleSet.has(t)).length;
  return matched / kw.length;
}

function label(page: CannibalizationPage): string {
  return page.title.trim() || page.url.trim() || "this page";
}

function keepReason(
  keep: { page: CannibalizationPage; alignment: number },
  other: { page: CannibalizationPage; alignment: number },
): string {
  if (keep.alignment === 0 && other.alignment === 0) {
    return "Neither title closely reflects its target keyword yet - keep whichever page currently ranks or has more backlinks as canonical, then merge or 301 redirect the other into it.";
  }
  return `${label(keep.page)}'s title matches ${Math.round(keep.alignment * 100)}% of its target keyword's terms, versus ${Math.round(other.alignment * 100)}% for ${label(other.page)} - keep it as the canonical page and merge or 301 redirect the other into it.`;
}

export function analyzeCannibalization(pages: CannibalizationPage[]): CannibalizationSuggestion[] {
  const withTokens = pages
    .map((p) => {
      const keywordTokens = uniq(tokenize(p.keyword));
      const titleTokens = uniq(tokenize(p.title));
      return {
        page: p,
        keywordTokens,
        titleTokens,
        alignment: alignmentScore(titleTokens, keywordTokens),
      };
    })
    .filter((p) => p.keywordTokens.length > 0);

  const suggestions: CannibalizationSuggestion[] = [];

  for (let i = 0; i < withTokens.length; i++) {
    for (let j = i + 1; j < withTokens.length; j++) {
      const a = withTokens[i];
      const b = withTokens[j];

      const exact = sameTokenSet(a.keywordTokens, b.keywordTokens);
      const keywordJaccard = jaccard(a.keywordTokens, b.keywordTokens);
      const titleJaccard = jaccard(a.titleTokens, b.titleTokens);
      const combined = KEYWORD_WEIGHT * keywordJaccard + TITLE_WEIGHT * titleJaccard;

      let severity: "direct" | "likely" | null = null;
      let score = 0;
      if (exact) {
        severity = "direct";
        score = 1;
      } else if (combined >= OVERLAP_THRESHOLD) {
        severity = "likely";
        score = combined;
      }
      if (!severity) continue;

      const sharedTerms = exact
        ? a.keywordTokens
        : uniq([...intersect(a.keywordTokens, b.keywordTokens), ...intersect(a.titleTokens, b.titleTokens)]);
      if (sharedTerms.length === 0) continue;

      const keep = a.alignment >= b.alignment ? a : b;
      const other = keep === a ? b : a;

      suggestions.push({
        aId: a.page.id,
        aUrl: a.page.url,
        aTitle: a.page.title,
        aKeyword: a.page.keyword,
        bId: b.page.id,
        bUrl: b.page.url,
        bTitle: b.page.title,
        bKeyword: b.page.keyword,
        severity,
        score,
        sharedTerms,
        keepId: keep.page.id,
        keepReason: keepReason(keep, other),
      });
    }
  }

  suggestions.sort((x, y) => y.score - x.score);
  return suggestions;
}
