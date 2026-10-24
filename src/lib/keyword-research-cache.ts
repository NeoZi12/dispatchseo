import { db } from "./db";
import {
  bulkKeywordDifficulty,
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

// --- Keyword difficulty, per keyword ------------------------------------------
//
// Research fills the KD Labs left empty (bulk_keyword_difficulty) before it
// filters, because nothing is queued without a measured KD. Same table, same
// 30-day rule, one row per KEYWORD rather than per seed: endpoint
// "bulk_keyword_difficulty", seed = the keyword, limit 1, ideas = a one-row
// KeywordIdea[] carrying only keyword + keyword_difficulty (null when
// DataForSEO had none - also a market fact, so a keyword it cannot score is
// not bought again every run).

const KD_ENDPOINT = "bulk_keyword_difficulty";
/** Cache reads go out as `seed IN (...)`; Hebrew keywords URL-encode to ~6
 *  bytes a character, so the list is read in slices to keep the URL short. */
const KD_READ_CHUNK = 50;

function kdKey(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function cachedBulkKeywordDifficulty(
  keywords: string[],
  creds: DataforseoCreds,
  locationCode: number,
  languageCode: string,
): Promise<{ kd: Map<string, number | null>; cost: number; cached: number }> {
  const keys = [...new Set(keywords.map(kdKey).filter(Boolean))];
  const known = new Map<string, number | null>();
  if (keys.length === 0) return { kd: known, cost: 0, cached: 0 };
  try {
    for (let i = 0; i < keys.length; i += KD_READ_CHUNK) {
      const { data, error } = await db()
        .from("keyword_research_cache")
        .select("seed, ideas, fetched_at")
        .eq("endpoint", KD_ENDPOINT)
        .eq("location_code", locationCode)
        .eq("language_code", languageCode)
        .in("seed", keys.slice(i, i + KD_READ_CHUNK));
      if (error) {
        console.error(`[research-cache] KD read failed: ${error.message}`);
        break;
      }
      for (const row of (data ?? []) as { seed: string; ideas: KeywordIdea[] | null; fetched_at: string }[]) {
        if (Date.now() - Date.parse(row.fetched_at) > RESEARCH_CACHE_TTL_MS) continue;
        const kd = row.ideas?.[0]?.keyword_difficulty;
        known.set(row.seed, typeof kd === "number" ? kd : null);
      }
    }
  } catch (err) {
    console.error("[research-cache] KD read failed:", err);
  }
  const missing = keys.filter((k) => !known.has(k));
  const cached = keys.length - missing.length;
  if (missing.length === 0) return { kd: known, cost: 0, cached };
  const live = await bulkKeywordDifficulty(missing, creds, locationCode, languageCode);
  const got = new Map(live.items.map((i) => [kdKey(i.keyword), i.kd]));
  for (const k of missing) known.set(k, got.get(k) ?? null);
  void writeKdCache(missing, known, locationCode, languageCode, live.cost ?? 0);
  return { kd: known, cost: live.cost ?? 0, cached };
}

async function writeKdCache(
  keys: string[],
  known: Map<string, number | null>,
  locationCode: number,
  languageCode: string,
  cost: number,
): Promise<void> {
  const share = Math.round(((cost ?? 0) * 1_000_000) / Math.max(1, keys.length));
  const fetchedAt = new Date().toISOString();
  try {
    const { error } = await db()
      .from("keyword_research_cache")
      .upsert(
        keys.map((k) => ({
          endpoint: KD_ENDPOINT,
          seed: k,
          location_code: locationCode,
          language_code: languageCode,
          limit: 1,
          ideas: [
            {
              keyword: k,
              search_volume: null,
              keyword_difficulty: known.get(k) ?? null,
              cpc: null,
              competition: null,
              detected_language: null,
              is_another_language: null,
            } satisfies KeywordIdea,
          ],
          cost_microusd: share,
          fetched_at: fetchedAt,
        })),
        { onConflict: "endpoint,seed,location_code,language_code" },
      );
    if (error) console.error(`[research-cache] KD write failed: ${error.message}`);
  } catch (err) {
    console.error("[research-cache] KD write failed:", err);
  }
}

// --- Per-project research memory (same table, no migration) -------------------
//
// Two kinds of rows ride along in keyword_research_cache, told apart by an
// endpoint that carries the project id (the primary key is endpoint + seed +
// market, so they can never collide with the shared Labs rows):
//
//   "dead_seed:<project id>"       a seed that expanded into nothing this
//                                  site could queue (zero candidates kept by
//                                  the measured-numbers filter). Research
//                                  skips it, and never proposes it again,
//                                  for 30 days. ideas = { dead: true, rows }.
//   "research_state:<project id>"  one row (seed "_state", location 0,
//                                  language "") holding the back-off: the
//                                  added-idea counts of the last two runs and
//                                  research_backoff_until.
//
// Both are tolerance-first like the rest of this file: a read failure reads
// as "nothing remembered", a write failure logs.

const deadSeedEndpoint = (projectId: string) => `dead_seed:${projectId}`;
const stateEndpoint = (projectId: string) => `research_state:${projectId}`;
const STATE_SEED = "_state";

/** One seed however it was written: "e-commerce" and "e commerce" are one
 *  (the same normalisation research's seed list applies). */
export function seedKey(seed: string): string {
  return seed.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function readDeadSeeds(projectId: string, locationCode: number, languageCode: string): Promise<Set<string>> {
  try {
    const { data, error } = await db()
      .from("keyword_research_cache")
      .select("seed, fetched_at")
      .eq("endpoint", deadSeedEndpoint(projectId))
      .eq("location_code", locationCode)
      .eq("language_code", languageCode)
      .limit(1000);
    if (error) {
      console.error(`[research-cache] dead-seed read failed: ${error.message}`);
      return new Set();
    }
    return new Set(
      ((data ?? []) as { seed: string; fetched_at: string }[])
        .filter((r) => Date.now() - Date.parse(r.fetched_at) <= RESEARCH_CACHE_TTL_MS)
        .map((r) => r.seed),
    );
  } catch (err) {
    console.error("[research-cache] dead-seed read failed:", err);
    return new Set();
  }
}

export async function markDeadSeeds(
  projectId: string,
  seeds: Array<{ seed: string; rows: number }>,
  locationCode: number,
  languageCode: string,
): Promise<void> {
  if (seeds.length === 0) return;
  const fetchedAt = new Date().toISOString();
  try {
    const { error } = await db()
      .from("keyword_research_cache")
      .upsert(
        seeds.map((s) => ({
          endpoint: deadSeedEndpoint(projectId),
          seed: seedKey(s.seed),
          location_code: locationCode,
          language_code: languageCode,
          limit: 0,
          ideas: { dead: true, rows: s.rows },
          cost_microusd: 0,
          fetched_at: fetchedAt,
        })),
        { onConflict: "endpoint,seed,location_code,language_code" },
      );
    if (error) console.error(`[research-cache] dead-seed write failed: ${error.message}`);
  } catch (err) {
    console.error("[research-cache] dead-seed write failed:", err);
  }
}

export type ResearchState = {
  /** Ideas added by the most recent completed research runs, newest first (at most two). */
  recent_added: number[];
  /** While in back-off, rung 4 (the wider search) does not run before this. */
  research_backoff_until: string | null;
};

export async function readResearchState(projectId: string): Promise<ResearchState> {
  const empty: ResearchState = { recent_added: [], research_backoff_until: null };
  try {
    const { data, error } = await db()
      .from("keyword_research_cache")
      .select("ideas")
      .eq("endpoint", stateEndpoint(projectId))
      .eq("seed", STATE_SEED)
      .eq("location_code", 0)
      .eq("language_code", "")
      .maybeSingle();
    if (error || !data) return empty;
    const s = (data as { ideas: Partial<ResearchState> | null }).ideas ?? {};
    return {
      recent_added: Array.isArray(s.recent_added) ? s.recent_added.filter((n): n is number => typeof n === "number").slice(0, 2) : [],
      research_backoff_until: typeof s.research_backoff_until === "string" ? s.research_backoff_until : null,
    };
  } catch (err) {
    console.error("[research-cache] research state read failed:", err);
    return empty;
  }
}

export async function writeResearchState(projectId: string, state: ResearchState): Promise<void> {
  try {
    const { error } = await db()
      .from("keyword_research_cache")
      .upsert(
        {
          endpoint: stateEndpoint(projectId),
          seed: STATE_SEED,
          location_code: 0,
          language_code: "",
          limit: 0,
          ideas: state,
          cost_microusd: 0,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "endpoint,seed,location_code,language_code" },
      );
    if (error) console.error(`[research-cache] research state write failed: ${error.message}`);
  } catch (err) {
    console.error("[research-cache] research state write failed:", err);
  }
}
