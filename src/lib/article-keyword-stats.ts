import { db } from "@/lib/db";

// Each article's target keyword with its monthly searches and difficulty, as
// research measured them: the tracked keyword's row first, else the newest
// idea written for it. Bulk, for lists (the Articles page, Home's latest
// articles, get_autopilot); one article's page uses keywordStatsFor in
// article-data.ts, which may also pay DataForSEO to measure a missing one.
// This never calls DataForSEO: a keyword research never measured is absent.

export type KeywordStats = { volume: number | null; difficulty: number | null };

/** The lookup key: lowercased, inner whitespace folded. */
export const keywordKey = (k: string) => k.trim().toLowerCase().replace(/\s+/g, " ");

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Keeps each `in.(...)` filter well under PostgREST's URL limit.
const CHUNK = 80;

/** Stats keyed by keywordKey(keyword). A keyword with neither number is
 *  left out. A failed read leaves its half out rather than throwing - the
 *  numbers are a nicety on a list, never a reason for it not to load. */
export async function keywordStatsBulk(projectId: string, keywords: Array<string | null | undefined>): Promise<Map<string, KeywordStats>> {
  // Query both the spelling we have and its lowercase: `in` is exact, and
  // research stores keywords lowercased while a title-derived one may not be.
  const keys = new Set<string>();
  const variants = new Set<string>();
  for (const k of keywords) {
    const t = k?.trim();
    if (!t) continue;
    keys.add(keywordKey(t));
    variants.add(t);
    variants.add(keywordKey(t));
  }
  const out = new Map<string, KeywordStats>();
  if (!keys.size) return out;
  const list = [...variants];
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));

  const [tracked, ideas] = await Promise.all([
    Promise.all(
      chunks.map((c) =>
        db()
          .from("keywords")
          .select("keyword, search_volume, keyword_difficulty")
          .eq("project_id", projectId)
          .in("keyword", c)
          .then((r) => (r.error ? [] : ((r.data ?? []) as Array<{ keyword: string; search_volume: unknown; keyword_difficulty: unknown }>))),
      ),
    ),
    Promise.all(
      chunks.map((c) =>
        db()
          .from("suggestions")
          .select("primary_keyword, keyword_volume, keyword_difficulty, created_at")
          .eq("project_id", projectId)
          .in("primary_keyword", c)
          .order("created_at", { ascending: false })
          .then((r) => (r.error ? [] : ((r.data ?? []) as Array<{ primary_keyword: string; keyword_volume: unknown; keyword_difficulty: unknown }>))),
      ),
    ),
  ]);

  const fromTracked = new Map<string, KeywordStats>();
  for (const r of tracked.flat()) {
    const k = keywordKey(r.keyword);
    if (!fromTracked.has(k)) fromTracked.set(k, { volume: num(r.search_volume), difficulty: num(r.keyword_difficulty) });
  }
  // Newest idea first per keyword (each chunk is newest-first; across
  // chunks the same keyword can't repeat with a different spelling often
  // enough to matter, and the first measured one wins either way).
  const fromIdeas = new Map<string, KeywordStats>();
  for (const r of ideas.flat()) {
    const k = keywordKey(r.primary_keyword);
    const s = { volume: num(r.keyword_volume), difficulty: num(r.keyword_difficulty) };
    const had = fromIdeas.get(k);
    if (!had || (had.volume == null && had.difficulty == null)) fromIdeas.set(k, s);
  }

  for (const k of keys) {
    const a = fromTracked.get(k);
    const b = fromIdeas.get(k);
    const volume = a?.volume ?? b?.volume ?? null;
    const difficulty = a?.difficulty ?? b?.difficulty ?? null;
    if (volume != null || difficulty != null) out.set(k, { volume, difficulty });
  }
  return out;
}
