import { db } from "./db";
import { backlinksSummary, type DataforseoCreds } from "./dataforseo";

// Domain Rating for the analytics dashboard, backed by the domain_ratings table
// (migration 0008) instead of unstable_cache. The DB row IS the 24h cache: we
// call the pricier DataForSEO backlinks-summary endpoint only when the stored
// snapshot is older than 24h, then persist the fresh value. This is what keeps
// the "updates in Xh Ym" timer honest - the countdown reads fetched_at from the
// row, so a Next revalidatePath (which wipes the in-memory data cache and used
// to reset both the value and the clock) can no longer restart the timer or
// re-fire the paid API. Returns null only when there is nothing to show at all
// (no stored row and no creds / a failed first fetch). DR 0 (indexed, no
// authority yet) is a real value, distinct from null.

const DAY_MS = 86_400_000;

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

// Force a refresh: call DataForSEO and persist the snapshot, ignoring how fresh
// the stored row is. Returns the fresh value, or null if the API call fails (in
// which case the existing row is left untouched). The daily cron calls this so
// the row stays warm and dashboard renders never have to pay for the API.
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

  return { ...fresh, fetchedAt };
}

// Read-through 24h cache keyed by project. Reads the stored snapshot; if it is
// fresh (< 24h) it is served as-is with no API call - so this stays cheap on
// every dashboard render and survives page revalidation. Only a stale/missing
// snapshot triggers a DataForSEO call, which is then persisted. Null creds
// (project not connected) never call the API - they return whatever snapshot
// exists, or null.
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
  if (stored?.fetchedAt && Date.now() - Date.parse(stored.fetchedAt) < DAY_MS) {
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
