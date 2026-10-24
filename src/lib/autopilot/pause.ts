import { db } from "@/lib/db";
import { reportCronRun } from "@/lib/cron-alerts";
import { gscClientForProject, gscPageImpressions } from "@/lib/gsc";
import { gscCronReadiness } from "@/lib/gsc-readiness";
import { writerMode, type Project } from "@/lib/projects";
import {
  DAY_MS,
  gscCollapse,
  RESUME_GRACE_DAYS,
  withinResumeGrace,
  zeroImpressionStreak,
  type GscDay,
  type HostedArticleStat,
} from "./math";

// The autopilot's brake.
//
// A hosted site stops itself when the numbers say more articles would make
// things worse, not better (decision 4 of the 2026-10-23 spec):
//   - Search Console collapses: the last 7 settled days of impressions fall
//     under 40% of what the 28 days before predict, on a site with real
//     traffic. That is the shape of a manual action or a core-update hit
//     (dispatchseo.com, 2026-08-21), and writing into it deepens a demotion.
//   - Three articles in a row indexed for three weeks with no impression at
//     all: Google sees the pages and declines to show them. A fourth costs the
//     same and earns the same. Proven per page with a live Search Console
//     query before the site is stopped (the stored snapshots hold only the
//     top 100 pages a day).
//
// A pause stops research and new runs; drafts already finished still publish
// (their cost is spent, and the owner can see them). It NEVER lifts itself:
// the conditions that tripped it rarely clear on their own, and a brake that
// releases silently is not a brake. Only the owner resumes (dashboard or the
// resume_writer MCP tool). A resume stamps writer_resumed_at, after which the
// collapse rule sits out 28 days (its window still holds the collapse the
// owner just acknowledged) and the streak counts only newer articles.
//
// Loud on purpose: a pause is a regression the owner must hear about, so it
// rides the cron_runs rails as "autopilot-pause--<slug>", which
// isUrgentCronFailure treats as urgent (banner + email on the first one) -
// but at most once per rule within 28 days, so a site resumed into the same
// problem is paused again quietly instead of paging the owner every time.
// Resuming logs an ok row for the same job, which clears the banner.

const CLIENT_KIND = "dispatchseo-writer";

export type AutoPauseResult = { paused: false; reason?: string } | { paused: true; reason: string };
type PauseRule = "collapse" | "zero-impressions";

export async function evaluateAutoPause(project: Project, now = new Date()): Promise<AutoPauseResult> {
  if (writerMode(project) !== "hosted") return { paused: false, reason: "not a hosted project" };
  if (project.writer_paused_at) return { paused: true, reason: project.writer_pause_reason ?? "paused" };

  // 35 settled days cover the collapse window; the streak rule reads further
  // back so an article indexed 6 weeks ago still has its days in hand.
  const since = new Date(now.getTime() - 120 * DAY_MS).toISOString().slice(0, 10);
  const [gscRes, draftsRes] = await Promise.all([
    db()
      .from("gsc_stats")
      .select("date, impressions, top_pages")
      .eq("project_id", project.id)
      .gte("date", since)
      .order("date", { ascending: true }),
    db()
      .from("article_drafts")
      .select("published_url, published_at, created_at")
      .eq("project_id", project.id)
      .eq("client_kind", CLIENT_KIND)
      .eq("status", "published")
      .not("published_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  // A read failure is not evidence of anything: never pause on it. No rows at
  // all (Google not connected yet) never pauses either - gscCollapse answers
  // "no data" and the streak needs 14 observed days.
  if (gscRes.error) return { paused: false, reason: `could not read Search Console rows: ${gscRes.error.message}` };
  const gsc = (gscRes.data ?? []) as GscDay[];

  if (!withinResumeGrace(project.writer_resumed_at, now)) {
    const collapse = gscCollapse(gsc.filter((d) => Date.parse(d.date) >= now.getTime() - 45 * DAY_MS), now);
    if (collapse.collapsed) {
      await pauseWriter(
        project.id,
        `Auto-paused: ${collapse.reason}. That pattern usually means a Google update or a manual action - more articles now would not help. Check Search Console, then resume.`,
        { auto: true, slug: project.slug, rule: "collapse" },
      );
      return { paused: true, reason: collapse.reason };
    }
  }

  const drafts = (draftsRes.data ?? []) as { published_url: string; published_at: string | null; created_at: string }[];
  if (drafts.length >= 3) {
    const { data: pages } = await db()
      .from("pages")
      .select("url, indexed_at")
      .eq("project_id", project.id)
      .in("url", drafts.map((d) => d.published_url));
    const indexed = new Map(((pages ?? []) as { url: string; indexed_at: string | null }[]).map((p) => [p.url, p.indexed_at]));
    const articles: HostedArticleStat[] = drafts.map((d) => ({
      url: d.published_url,
      publishedAt: d.published_at ?? d.created_at,
      indexedAt: indexed.get(d.published_url) ?? null,
    }));
    const streak = zeroImpressionStreak(articles, gsc, now, project.writer_resumed_at);
    if (streak.triggered && (await confirmedZero(project, articles.filter((a) => streak.urls.includes(a.url))))) {
      await pauseWriter(
        project.id,
        `Auto-paused: ${streak.reason}. Google is indexing the pages but showing them to no one; check Search Console for a manual action or a quality issue before writing more.`,
        { auto: true, slug: project.slug, rule: "zero-impressions" },
      );
      return { paused: true, reason: streak.reason };
    }
  }
  return { paused: false };
}

/** Ask Search Console directly, per page, before stopping a site on "no
 *  impressions". Any doubt - no property, no access, an API error, a single
 *  impression - answers false: a wrong pause costs a paying customer their
 *  articles, a missed one costs one more article. */
async function confirmedZero(project: Project, articles: HostedArticleStat[]): Promise<boolean> {
  if (!project.gsc_site_url || articles.length === 0) return false;
  try {
    const ready = await gscCronReadiness(project);
    if (!ready.ready) return false;
    const sc = await gscClientForProject(project, { afterReadinessCheck: true });
    for (const a of articles) {
      let path: string;
      try {
        path = new URL(a.url).pathname.replace(/\/+$/, "");
      } catch {
        return false;
      }
      if (!path || path === "/") return false;
      const start = (a.indexedAt ?? a.publishedAt).slice(0, 10);
      if ((await gscPageImpressions(project.gsc_site_url, path, start, sc)) > 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Has this rule already paged the owner within the grace window? */
async function announcedRecently(job: string, rule: PauseRule): Promise<boolean> {
  const since = new Date(Date.now() - RESUME_GRACE_DAYS * DAY_MS).toISOString();
  const { data, error } = await db()
    .from("cron_runs")
    .select("errors")
    .eq("job", job)
    .eq("ok", false)
    .gte("created_at", since)
    .limit(20);
  if (error) return false;
  return ((data ?? []) as { errors: unknown }[]).some((r) => JSON.stringify(r.errors ?? []).includes(`[${rule}]`));
}

/** Stop the autopilot for one site. Idempotent: an already-paused site keeps
 *  its original reason and timestamp (the first cause is the useful one). */
export async function pauseWriter(
  projectId: string,
  reason: string,
  opts: { auto?: boolean; slug?: string; rule?: PauseRule } = {},
): Promise<void> {
  const text = reason.trim().slice(0, 500) || "Paused by the owner.";
  const { data, error } = await db()
    .from("projects")
    .update({ writer_paused_at: new Date().toISOString(), writer_pause_reason: text })
    .eq("id", projectId)
    .is("writer_paused_at", null)
    .select("slug")
    .maybeSingle();
  if (error) throw new Error(`could not pause the writer: ${error.message}`);
  if (!data || !opts.auto) return;
  const slug = opts.slug ?? (data as { slug: string }).slug;
  const job = `autopilot-pause--${slug}`;
  const rule: PauseRule = opts.rule ?? "collapse";
  // Once per rule per 28 days. The pause itself still happens; the dashboard
  // shows its reason either way.
  if (await announcedRecently(job, rule)) return;
  // "paused:" leads so the run log and the banner say what happened before
  // they say why; the [rule] tag is what the dedupe above reads.
  await reportCronRun(job, { error: `paused: ${text} [${rule}]` }, true);
}

/** Start the autopilot again. Only ever called by the owner (dashboard or
 *  MCP) - nothing in the crons resumes a site. */
export async function resumeWriter(projectId: string): Promise<void> {
  const resumedAt = new Date().toISOString();
  let { data, error } = await db()
    .from("projects")
    .update({ writer_paused_at: null, writer_pause_reason: null, writer_resumed_at: resumedAt })
    .eq("id", projectId)
    .select("slug")
    .maybeSingle();
  if (error && /writer_resumed_at/.test(error.message)) {
    ({ data, error } = await db()
      .from("projects")
      .update({ writer_paused_at: null, writer_pause_reason: null })
      .eq("id", projectId)
      .select("slug")
      .maybeSingle());
  }
  if (error) throw new Error(`could not resume the writer: ${error.message}`);
  const slug = (data as { slug: string } | null)?.slug;
  if (!slug) return;
  // Clears an auto-pause from the banner: the newest row of the job becomes
  // ok. Only when there IS a failed row to clear - a manual pause never
  // logged one, and an ok row nobody needed would just add a job to the run
  // log.
  const job = `autopilot-pause--${slug}`;
  const { data: last } = await db()
    .from("cron_runs")
    .select("ok")
    .eq("job", job)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && (last as { ok: boolean }).ok === false) await reportCronRun(job, { resumed: true }, false);
}
