import { getHostedQueue } from "@/lib/autopilot/queue";
import { repoMismatchOf } from "@/lib/site-root";

// The next article a hosted site will write, for the owner dashboard: the
// same projection the customer's own Home shows ("Up next" + its date) -
// getHostedQueue's first upcoming idea and its expected start, falling back
// to the bare slot when the queue is empty (that morning's run researches a
// topic first, so there is a date but no title yet).
//
// Only sites the hosted writer runs and nobody paused have one: an agent
// site's own coding agent decides when it builds, a paused writer has no
// date to promise, and neither does a site whose connected repo isn't the
// site's (the scheduler starts nothing there: repoStillNotTheSite). Fails soft - a read error reads as "no date", never as a
// broken owner page.

export type NextArticle = {
  /** The queued idea's title; null when the queue is empty and the day's
   *  run will pick a topic itself. */
  title: string | null;
  /** yyyy-mm-dd (UTC) the article is expected to start. */
  at: string;
};

export type NextArticleSite = {
  id: string;
  next_article_at: string | null;
  writer_mode: string | null;
  writer_paused_at?: string | null;
  owner_user_id?: string | null;
  domain?: string | null;
  created_at?: string | null;
  github_repo?: string | null;
  repo_site_check?: unknown;
};

export async function nextArticleOf(p: NextArticleSite, now = new Date()): Promise<NextArticle | null> {
  if (p.writer_mode !== "hosted" || p.writer_paused_at || repoMismatchOf(p)) return null;
  try {
    const q = await getHostedQueue(
      { id: p.id, next_article_at: p.next_article_at, writer_paused_at: p.writer_paused_at ?? null, owner_user_id: p.owner_user_id, domain: p.domain, created_at: p.created_at },
      now,
      { parked: false },
    );
    const first = q.upcoming[0];
    if (first?.expected_start) return { title: first.title, at: first.expected_start };
    return q.nextStart ? { title: null, at: q.nextStart } : null;
  } catch {
    return null;
  }
}

/** nextArticleOf over many sites, a few at a time (each is a handful of
 *  reads), keyed by site id. Sites with no date are left out. */
export async function nextArticles(sites: NextArticleSite[], now = new Date(), concurrency = 6): Promise<Map<string, NextArticle>> {
  const out = new Map<string, NextArticle>();
  let i = 0;
  const worker = async () => {
    while (i < sites.length) {
      const s = sites[i++];
      const n = await nextArticleOf(s, now);
      if (n) out.set(s.id, n);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, sites.length) }, worker));
  return out;
}
