import { db } from "./db";
import { backlinksSummary, type DataforseoCreds } from "./dataforseo";

// Domain Rating for the analytics dashboard, backed by the domain_ratings table
// (migration 0008) instead of unstable_cache. The DB row IS the cache: we
// call the pricier DataForSEO backlinks-summary endpoint only when the stored
// snapshot is older than the TTL, then persist the fresh value. This is what
// keeps the "updates in Xd Yh" timer honest - the countdown reads fetched_at
// from the row, so a Next revalidatePath (which wipes the in-memory data cache
// and used to reset both the value and the clock) can no longer restart the
// timer or re-fire the paid API. Returns null only when there is nothing to
// show at all (no stored row and no creds / a failed first fetch). DR 0
// (indexed, no authority yet) is a real value, distinct from null.
//
// TTL was cut to weekly on 2026-07-27 and to TWO weeks on 2026-10-08: DR
// moves on a monthly scale, and the backlinks-summary call ($0.024) is the
// priciest single request the backend makes for a number that almost never
// changes week to week.

const DAY_MS = 86_400_000;
export const DR_TTL_MS = 14 * DAY_MS;
// The cron refreshes slightly early so the weekly cadence never drifts a day
// forward each week (a row refreshed at 04:00 is 6.99d old at the next
// Monday's 04:00 run, not 7d).
const CRON_REFRESH_AGE_MS = 6.5 * DAY_MS;

export type DomainRating = {
  dr: number | null; // 0-100 (rank / 10, rounded)
  rank: number | null; // raw 0-1000
  referringDomains: number | null;
  backlinks: number | null;
  spamScore: number | null; // 0-100
  // When the DataForSEO call actually ran. The dashboard counts down to
  // fetchedAt + 24h to show when the cache will refresh.
  fetchedAt?: string;
};

type DomainRatingRow = {
  dr: number | null;
  rank: number | null;
  referring_domains: number | null;
  backlinks: number | null;
  spam_score: number | null;
  fetched_at: string;
};

function fromRow(r: DomainRatingRow): DomainRating {
  return {
    dr: r.dr,
    rank: r.rank,
    referringDomains: r.referring_domains,
    backlinks: r.backlinks,
    spamScore: r.spam_score,
    fetchedAt: r.fetched_at,
  };
}

// The actual paid call. Returns the metrics, or null on any failure (missing
// data, API error) so callers can fall back to the last good stored value.
async function fetchFromDataforseo(
  domain: string,
  creds: DataforseoCreds,
): Promise<Omit<DomainRating, "fetchedAt"> | null> {
  try {
    const s = await backlinksSummary(domain, creds);
    return {
      dr: s.rank != null ? Math.round(s.rank / 10) : null,
      rank: s.rank,
      referringDomains: s.referring_domains,
      backlinks: s.backlinks,
      spamScore: s.spam_score,
    };
  } catch {
    return null;
  }
}

// Cron entry point: refresh only when the stored snapshot has aged past the
// weekly cadence (or never existed). Returns the current value either way and
// says whether a paid call actually happened, so the cron can report
// "refreshed" vs "fresh" honestly.
export async function refreshDomainRatingIfStale(
  projectId: string,
  domain: string,
  creds: DataforseoCreds,
): Promise<{ rating: DomainRating | null; refreshed: boolean; failed: boolean }> {
  const { data } = await db()
    .from("domain_ratings")
    .select("dr, rank, referring_domains, backlinks, spam_score, fetched_at")
    .eq("project_id", projectId)
    .maybeSingle();
  const stored = data ? fromRow(data as DomainRatingRow) : null;
  if (stored?.fetchedAt && Date.now() - Date.parse(stored.fetchedAt) < CRON_REFRESH_AGE_MS) {
    return { rating: stored, refreshed: false, failed: false };
  }
  const fresh = await refreshDomainRating(projectId, domain, creds);
  // On API failure keep showing the last good snapshot (stale beats blank),
  // but SAY the refresh failed - a stale-and-failing DR must not report as
  // "fresh" to the cron (no-silent-failures).
  if (!fresh) return { rating: stored, refreshed: false, failed: true };
  return { rating: fresh, refreshed: true, failed: false };
}

// Force a refresh: call DataForSEO and persist the snapshot, ignoring how fresh
// the stored row is. Returns the fresh value, or null if the API call fails (in
// which case the existing row is left untouched).
export async function refreshDomainRating(
  projectId: string,
  domain: string,
  creds: DataforseoCreds,
): Promise<DomainRating | null> {
  const fresh = await fetchFromDataforseo(domain, creds);
  if (!fresh) return null;

  const fetchedAt = new Date().toISOString();
  await db().from("domain_ratings").upsert({
    project_id: projectId,
    dr: fresh.dr,
    rank: fresh.rank,
    referring_domains: fresh.referringDomains,
    backlinks: fresh.backlinks,
    spam_score: fresh.spamScore,
    fetched_at: fetchedAt,
  });

  // Append the same snapshot to the history series (migration 0051) - the
  // single-row cache above has no yesterday, and the authority surfaces need
  // one ("referring domains +2 this month", the 5-referring-domains
  // milestone). Errors are ignored on purpose: before the migration runs this
  // insert fails, and history must never be a reason a refresh fails.
  await db().from("domain_rating_history").insert({
    project_id: projectId,
    dr: fresh.dr,
    rank: fresh.rank,
    referring_domains: fresh.referringDomains,
    backlinks: fresh.backlinks,
    spam_score: fresh.spamScore,
    fetched_at: fetchedAt,
  });

  return { ...fresh, fetchedAt };
}

// ---------------------------------------------------------------------------
// History reads (migration 0051)
// ---------------------------------------------------------------------------

export type DomainRatingPoint = {
  dr: number | null;
  referringDomains: number | null;
  fetchedAt: string;
};

// Oldest-first points since `sinceMs` ago. Tolerant like everything else in
// this file: a missing table (migration pending) or query error reads as an
// empty series, never a dead page.
export async function getDomainRatingHistory(
  projectId: string,
  sinceMs: number,
): Promise<DomainRatingPoint[]> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { data, error } = await db()
    .from("domain_rating_history")
    .select("dr, referring_domains, fetched_at")
    .eq("project_id", projectId)
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: true });
  if (error || !data) return [];
  return (data as Array<{ dr: number | null; referring_domains: number | null; fetched_at: string }>).map(
    (r) => ({ dr: r.dr, referringDomains: r.referring_domains, fetchedAt: r.fetched_at }),
  );
}

// Earliest moment the site provably had `n`+ referring domains - the
// 5-referring-domains journey milestone. Falls back to the current cache row
// for sites already past the bar before history existed: "first observed" is
// the honest reading either way.
export async function firstReferringDomainsAt(
  projectId: string,
  n: number,
): Promise<string | null> {
  const { data } = await db()
    .from("domain_rating_history")
    .select("fetched_at")
    .eq("project_id", projectId)
    .gte("referring_domains", n)
    .order("fetched_at", { ascending: true })
    .limit(1);
  if (data?.[0]) return (data[0] as { fetched_at: string }).fetched_at;
  const { data: cur } = await db()
    .from("domain_ratings")
    .select("referring_domains, fetched_at")
    .eq("project_id", projectId)
    .maybeSingle();
  const row = cur as { referring_domains: number | null; fetched_at: string } | null;
  if (row?.referring_domains != null && row.referring_domains >= n) return row.fetched_at;
  return null;
}

// Read-through weekly cache keyed by project. Reads the stored snapshot; if it
// is fresh (< DR_TTL_MS) it is served as-is with no API call - so this stays
// cheap on every dashboard render and survives page revalidation. Only a
// stale/missing snapshot triggers a DataForSEO call, which is then persisted.
// Null creds (project not connected) never call the API - they return whatever
// snapshot exists, or null.
export async function getDomainRating(
  projectId: string,
  domain: string,
  creds: DataforseoCreds | null,
): Promise<DomainRating | null> {
  const { data } = await db()
    .from("domain_ratings")
    .select("dr, rank, referring_domains, backlinks, spam_score, fetched_at")
    .eq("project_id", projectId)
    .maybeSingle();
  const stored = data ? fromRow(data as DomainRatingRow) : null;

  // Fresh enough - serve the stored snapshot untouched.
  if (stored?.fetchedAt && Date.now() - Date.parse(stored.fetchedAt) < DR_TTL_MS) {
    return stored;
  }

  // Can't refresh without creds - show the last good value (even if stale) or
  // nothing.
  if (!creds) return stored;

  // Stale or missing - refresh from DataForSEO. On API failure keep showing the
  // last good snapshot.
  const refreshed = await refreshDomainRating(projectId, domain, creds);
  return refreshed ?? stored;
}
