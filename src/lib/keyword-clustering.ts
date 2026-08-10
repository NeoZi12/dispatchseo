// Pure, client-safe clustering behind the Keyword Clustering Tool widget. No
// network calls, no DOM - tokenizes pasted keywords and groups them by shared
// significant words/phrases (the same term-overlap idea as
// internal-linking-analysis.ts, applied to keyword-vs-keyword instead of
// page-vs-page). Kept isolated from the widget component so the clustering
// itself can be reasoned about (and hand-tested) on its own.

export type ClusterVerdict = "same-page" | "sections" | "standalone";

export type KeywordCluster = {
  id: string;
  keywords: string[];
  label: string;
  verdict: ClusterVerdict;
  avgSimilarity: number;
};

export type ClusterResult = {
  clusters: KeywordCluster[];
  totalInput: number;
  uniqueCount: number;
  droppedCount: number;
};

const STOPWORDS = new Set(
  (
    "a about after all am an and are as at be been being best better but by can cannot could did do " +
    "does doing for from had has have how i if in into is it near of on or should than that the their " +
    "there these this those to top vs versus what when where which who why will with your"
  ).split(" "),
);

export const MAX_KEYWORDS = 300;
const JOIN_THRESHOLD = 0.25;
const DUPLICATE_THRESHOLD = 0.6;

function contentTokens(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// Unigrams + adjacent-pair bigrams over the STOPWORD-FILTERED sequence, so
// "email deliverability" survives as a phrase even when the raw keyword has
// a stopword between two other words removed elsewhere in the string.
function significantTerms(keyword: string): Set<string> {
  const tokens = contentTokens(keyword);
  const terms = new Set<string>(tokens);
  for (let i = 0; i < tokens.length - 1; i++) {
    terms.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return terms;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const term of a) if (b.has(term)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function findRoot(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

function union(parent: number[], a: number, b: number): void {
  const ra = findRoot(parent, a);
  const rb = findRoot(parent, b);
  if (ra !== rb) parent[ra] = rb;
}

function titleCase(term: string): string {
  return term.replace(/\b\w/g, (c) => c.toUpperCase());
}

// The label for a multi-keyword cluster is the term shared by at least two
// of its members that scores highest (bigrams outweigh unigrams, then
// longer terms win ties) - the phrase that best explains why these keywords
// landed together. A singleton just uses its own keyword.
function clusterLabel(indices: number[], termSets: Set<string>[], keywords: string[]): string {
  if (indices.length === 1) return keywords[indices[0]];

  const freq = new Map<string, number>();
  for (const i of indices) {
    for (const term of termSets[i]) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [term, count] of freq) {
    if (count < 2) continue;
    const score = count * (term.includes(" ") ? 1.5 : 1) * term.length;
    if (score > bestScore) {
      bestScore = score;
      best = term;
    }
  }
  return best ? titleCase(best) : keywords[indices[0]];
}

export function clusterKeywords(rawLines: string[]): ClusterResult {
  const totalInput = rawLines.length;

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  const uniqueCount = unique.length;
  const droppedCount = Math.max(0, uniqueCount - MAX_KEYWORDS);
  const keywords = unique.slice(0, MAX_KEYWORDS);

  const termSets = keywords.map((k) => significantTerms(k));
  const parent = keywords.map((_, i) => i);
  const pairSim = new Map<string, number>();

  for (let i = 0; i < keywords.length; i++) {
    for (let j = i + 1; j < keywords.length; j++) {
      const sim = jaccard(termSets[i], termSets[j]);
      if (sim > 0) pairSim.set(`${i}:${j}`, sim);
      if (sim >= JOIN_THRESHOLD) union(parent, i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < keywords.length; i++) {
    const root = findRoot(parent, i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }

  const clusters: KeywordCluster[] = [];
  for (const indices of groups.values()) {
    let avgSimilarity = 0;
    if (indices.length > 1) {
      let sum = 0;
      let count = 0;
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          const key = `${indices[a]}:${indices[b]}`;
          sum += pairSim.get(key) ?? 0;
          count++;
        }
      }
      avgSimilarity = count > 0 ? sum / count : 0;
    }

    const verdict: ClusterVerdict =
      indices.length === 1 ? "standalone" : avgSimilarity >= DUPLICATE_THRESHOLD ? "same-page" : "sections";

    clusters.push({
      id: indices.join("-"),
      keywords: indices.map((i) => keywords[i]),
      label: clusterLabel(indices, termSets, keywords),
      verdict,
      avgSimilarity,
    });
  }

  clusters.sort((a, b) => {
    if (a.keywords.length !== b.keywords.length) return b.keywords.length - a.keywords.length;
    return keywords.indexOf(a.keywords[0]) - keywords.indexOf(b.keywords[0]);
  });

  return { clusters, totalInput, uniqueCount, droppedCount };
}
