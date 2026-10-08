import { db } from "./db";
import {
  keywordSuggestions,
  relatedKeywords,
  type DataforseoCreds,
  type KeywordIdea,
} from "./dataforseo";

// A 30-day, cross-project cache in front of the two metered Labs endpoints the
// keyword_ideas MCP tool expands every seed through (migration 0063).
//
// Why: each seed costs two live calls (~$0.024 together), and research runs
// re-expand the same seeds week after week - the 2026-10-08 ledger showed the
// platform account paying ~$1.8/week for Labs rows it had already bought.
// Search volume / KD are market facts, not tenant data, and DataForSEO itself
// refreshes them monthly, so a hit is as good as a live call for the agent's
// purposes and costs nothing. Shared across projects on purpose: two sites in
// the same niche researching "ai seo agent" pay once.
//
// Tolerance: a cache failure (the table missing until 0063 is applied, a
// transient DB error) falls through to the live call and logs - research must
// never break because the thing that makes it cheaper did.

export const RESEARCH_CACHE_TTL_MS = 30 * 86_400_000;

type Endpoint = "keyword_suggestions" | "related_keywords";

export type CachedLabsResult = { ideas: KeywordIdea[]; cost: number; cached: boolean };

function cacheKey(seed: string): string {
  return seed.trim().toLowerCase();
}

async function readCache(
  endpoint: Endpoint,
  seed: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<KeywordIdea[] | null> {
  try {
    const { data, error } = await db()
      .from("keyword_research_cache")
      .select("ideas, limit, fetched_at")
      .eq("endpoint", endpoint)
      .eq("seed", cacheKey(seed))
      .eq("location_code", locationCode)
      .eq("language_code", languageCode)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { ideas: KeywordIdea[]; limit: number; fetched_at: string };
    if (Date.now() - Date.parse(row.fetched_at) > RESEARCH_CACHE_TTL_MS) return null;
    // A row fetched with a smaller limit than asked for now is still a valid
    // answer only if the live call returned fewer rows than that limit (the
    // endpoint ran dry) - otherwise refetch at the larger limit.
    if (row.limit < limit && row.ideas.length >= row.limit) return null;
    return row.ideas.slice(0, limit);
  } catch (err) {
    console.error(`[research-cache] read failed (${endpoint} "${seed}"):`, err);
    return null;
  }
}

async function writeCache(
  endpoint: Endpoint,
  seed: string,
  locationCode: number,
  languageCode: string,
  limit: number,
  ideas: KeywordIdea[],
  cost: number,
): Promise<void> {
  try {
    const { error } = await db()
      .from("keyword_research_cache")
      .upsert(
        {
          endpoint,
          seed: cacheKey(seed),
          location_code: locationCode,
          language_code: languageCode,
          limit,
          ideas,
          cost_microusd: Math.round((cost ?? 0) * 1_000_000),
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "endpoint,seed,location_code,language_code" },
      );
    if (error) console.error(`[research-cache] write failed (${endpoint} "${seed}"): ${error.message}`);
  } catch (err) {
    console.error(`[research-cache] write failed (${endpoint} "${seed}"):`, err);
  }
}

async function cached(
  endpoint: Endpoint,
  live: () => Promise<{ ideas: KeywordIdea[]; cost: number }>,
  seed: string,
  locationCode: number,
  languageCode: string,
  limit: number,
): Promise<CachedLabsResult> {
  const hit = await readCache(endpoint, seed, locationCode, languageCode, limit);
  if (hit) return { ideas: hit, cost: 0, cached: true };
  const fresh = await live();
  // Fire-and-forget, like the usage ledger: the caller already has its data.
  void writeCache(endpoint, seed, locationCode, languageCode, limit, fresh.ideas, fresh.cost);
  return { ...fresh, cached: false };
}

export function cachedKeywordSuggestions(
  seed: string,
  creds: DataforseoCreds,
  limit: number,
  locationCode: number,
  languageCode: string,
): Promise<CachedLabsResult> {
  return cached(
    "keyword_suggestions",
    () => keywordSuggestions(seed, creds, limit, locationCode, languageCode),
    seed,
    locationCode,
    languageCode,
    limit,
  );
}

export function cachedRelatedKeywords(
  seed: string,
  creds: DataforseoCreds,
  limit: number,
  locationCode: number,
  languageCode: string,
): Promise<CachedLabsResult> {
  return cached(
    "related_keywords",
    () => relatedKeywords(seed, creds, limit, locationCode, languageCode),
    seed,
    locationCode,
    languageCode,
    limit,
  );
}
