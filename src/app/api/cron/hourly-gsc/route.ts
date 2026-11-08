import { db } from "@/lib/db";
import { isFreeProject, planGate } from "@/lib/billing";
import { getFreshSnapshots, inspectIndexStatus, gscClientForProject, type GscClient } from "@/lib/gsc";
import { applyDetectedLaunch, launchDateLooksDefaulted } from "@/lib/site-launch";
import { gscCronReadiness } from "@/lib/gsc-readiness";
import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { recoverStuckBuilds } from "@/lib/build-recovery";
import { refillEmptyGuideQueues } from "@/lib/queue-refill";
import { listProjectsChecked, type Project } from "@/lib/projects";

// Hourly GSC refresh, triggered by the hourly-gsc GitHub Action (Vercel Hobby
// crons cap at once/day, so the hourly schedule lives outside Vercel). This is
// the fresh-data counterpart of the daily cron's GSC half: it re-upserts the
// last few dates using dataState ALL, so today's provisional numbers flow into
// gsc_stats intraday and each trailing row converges to its final values as
// Google finalizes it. SERP rank checks stay on the daily cron only - ranks do
// not move hourly and the SERP calls are the paid part.

// 300, not the 60 this ran on until 2026-08-04. The inspection sweep below
// costs a network round trip per unindexed page, so the run time scales with
// how much each project has published - and once ClockedCode and DispatchSEO
// crossed ~6 unindexed pages each, a 48s run became a 60s timeout and every
// scheduled run 504'd. A timeout is the worst possible failure here: it kills
// the request before reportCronRun(), so the break never reaches cron_runs,
// the banner or the alert email, and recoverStuckBuilds + refillEmptyGuideQueues
// below never run either. Headroom is what keeps this loud when it does break.
export const maxDuration = 300;

// Verified-index sweep: ask the read-only URL Inspection API about pages not
// yet confirmed indexed and stamp pages.indexed_at on a PASS verdict
// (migration 0010). Oldest-checked first so the budget rotates through any
// backlog; at this schedule the worst case is ~80 calls/day per property,
// far under the 2000/day quota. Best-effort accelerator: any failure here
// (missing 0010 columns, quota, permissions) is reported in the run log but
// never fails the snapshot half.
const INSPECT_BUDGET = 10;

// The inspections are independent reads, so running them one after another
// only made the ceiling scale with page count (see maxDuration above). A small
// pool keeps the whole batch inside a couple of round trips' time without
// hammering the URL Inspection quota, which is per-property and per-minute as
// well as per-day.
const INSPECT_CONCURRENCY = 4;

async function verifyIndexing(project: Project, sc: GscClient): Promise<Record<string, unknown>> {
  const { data, error } = await db()
    .from("pages")
    .select("id, url")
    .eq("project_id", project.id)
    .is("indexed_at", null)
    .order("index_checked_at", { ascending: true, nullsFirst: true })
    .limit(INSPECT_BUDGET);
  if (error) return { skipped: error.message };
  const rows = data ?? [];
  if (rows.length === 0) return { checked: 0 };

  let newlyIndexed = 0;
  let failed = 0;
  // Workers pull from one shared cursor rather than being handed fixed slices,
  // so one slow inspection can't leave the other workers idle. The counters are
  // safe to share: this is a single-threaded event loop, and each += runs to
  // completion between awaits.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (let i = cursor++; i < rows.length; i = cursor++) {
      const row = rows[i];
      const now = new Date().toISOString();
      try {
        const result = await inspectIndexStatus(project.gsc_site_url!, row.url, sc);
        const isIndexed = result.verdict === "PASS";
        const { error: upErr } = await db()
          .from("pages")
          .update(
            isIndexed
              ? { indexed_at: now, index_checked_at: now }
              : { index_checked_at: now },
          )
          .eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        if (isIndexed) newlyIndexed += 1;
      } catch {
        failed += 1;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(INSPECT_CONCURRENCY, rows.length) }, () => worker()),
  );
  // A single failed inspection is routine (quota edge, transient API hiccup)
  // and must stay best-effort. But every one of the batch failing (lost URL
  // Inspection permission, broken creds) is a systemic break that previously
  // had no way to surface: `failed` was returned but nothing ever read it, so
  // this could stay broken forever while cron_runs/the banner/get_cron_health
  // kept reporting success (2026-07-27 audit).
  //
  // Loud only if it has ever worked. URL Inspection is a SEPARATE grant from
  // Search Analytics, and gscAccessProbe only proves the latter - so a project
  // whose stats sync perfectly can still 403 every inspection (property is
  // apex but pages are www, a docs subdomain outside the property, the grant
  // never given). That is unmet setup, not a regression: informational, per
  // the "crons never run what setup hasn't finished" rule. One stamped
  // indexed_at anywhere in this project is the proof it once worked, and from
  // then on a total failure is a real regression worth the banner.
  const allFailed = rows.length > 0 && failed === rows.length;
  if (!allFailed) return { checked: rows.length, newly_indexed: newlyIndexed, failed, allFailed };
  const { count: everIndexed } = await db()
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .not("indexed_at", "is", null);
  const provenBefore = (everIndexed ?? 0) > 0;
  return {
    checked: rows.length,
    newly_indexed: newlyIndexed,
    failed,
    allFailed: provenBefore,
    ...(provenBefore
      ? {}
      : { skipped: "URL Inspection has never succeeded here - check that the service account has it on this property" }),
  };
}

async function runProject(project: Project): Promise<Record<string, unknown>> {
  // Setup gate (gsc-readiness.ts): a project whose owner hasn't finished the
  // Search Console step skips as information, not as a failure - a mid-setup
  // project must never 500 the run, fail the GitHub Action, or email the
  // owner. The index sweep below is gated too: it reads with the same
  // service account, so without access it could only burn quota on failures.
  // Plan gate (cloud only): downgraded-past or lapsed accounts pause instead
  // of consuming service. Informational skip, same as the setup gate.
  // A free-tier site is the exception: Search Console costs nothing, and its
  // numbers are what the free dashboard (and every upgrade line on it) shows.
  const gate = await planGate(project.id);
  if (!gate.allowed && !(await isFreeProject(project.id))) return { skipped: `plan: ${gate.reason}` };
  const readiness = await gscCronReadiness(project);
  if (!readiness.ready) return { skipped: readiness.skipped };
  // Resolve the client once: OAuth for a connected cloud project, service
  // account otherwise. Both the snapshot and index-inspection calls share it.
  // readiness checked immediately above - safe to fall back to the service
  // account for a project that has demonstrably synced through it before.
  const sc = await gscClientForProject(project, { afterReadinessCheck: true });
  // One-time launch-date backfill, now that a GSC client provably works for
  // this project: while the row still holds its creation default, detect the
  // real launch from GSC history + the Wayback Machine (site-launch.ts).
  // RDAP at creation covers gTLDs, but plenty of ccTLDs have no RDAP at all
  // (.co.il surfaced this), and "joined DispatchSEO today" then poses an
  // established site as a newborn - wrong Journey stage, wrong pacing, wrong
  // research difficulty posture. Best-effort: never fails the snapshot run.
  if (launchDateLooksDefaulted(project)) {
    try {
      await applyDetectedLaunch(project, sc);
    } catch {
      /* detection is a bonus, the snapshot is the job */
    }
  }
  const snaps = await getFreshSnapshots(project.gsc_site_url!, 3, sc);
  // No snapshot data is no reason to skip index verification - a brand-new
  // site with zero impressions is exactly where it matters most.
  if (snaps.length === 0) {
    return { skipped: "no GSC data in window", indexing: await verifyIndexing(project, sc) };
  }

  // One upsert for the whole window, not one per date. Row-at-a-time with a
  // throw on the first error committed the earlier dates and dropped every
  // later one, then failed the project's whole run so verifyIndexing never
  // got to go - a partial write plus a hard stop. The upsert is idempotent on
  // (project_id, date), so a batch is a straight improvement: all or nothing,
  // one round trip, and a re-run heals it either way.
  const { error: upsertError } = await db()
    .from("gsc_stats")
    .upsert(
      snaps.map((snap) => ({
        project_id: project.id,
        date: snap.date,
        clicks: snap.clicks,
        impressions: snap.impressions,
        ctr: snap.ctr,
        avg_position: snap.avg_position,
        top_queries: snap.top_queries,
        top_pages: snap.top_pages,
      })),
      { onConflict: "project_id,date" },
    );
  if (upsertError) throw new Error(`gsc_stats upsert: ${upsertError.message}`);
  const indexing = await verifyIndexing(project, sc);
  return { upserted: snaps.map((s) => s.date), indexing };
}

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  const { projects, degraded } = await listProjectsChecked();
  const runs = await Promise.allSettled(projects.map((p) => runProject(p)));

  const result: Record<string, unknown> = {};
  let hadError = false;
  if (degraded) {
    // Non-schema projects-query failure: only the synthetic fallback ran, so
    // real tenants may have been skipped. Alert instead of a false success.
    hadError = true;
    result._projects_degraded = degraded;
  }
  runs.forEach((r, i) => {
    const slug = projects[i].slug;
    if (r.status === "fulfilled") {
      result[slug] = r.value;
      const indexing = (r.value as { indexing?: { allFailed?: boolean } }).indexing;
      if (indexing?.allFailed) hadError = true;
    } else {
      hadError = true;
      result[slug] = { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    }
  });

  // Piggybacked maintenance: this is the most frequent backend heartbeat,
  // so it also runs the stuck-build recovery sweep (see build-recovery.ts).
  // Best-effort by contract - it must never affect the GSC result.
  await recoverStuckBuilds();

  // ...and the queue-empty refill (see queue-refill.ts): a project whose guide
  // queue has run dry gets research fired for it, instead of the daily builder
  // finding nothing and exiting "success" until the next weekly cron happens to
  // land. Reported under the sweep's own per-project marker rows, so a failure
  // is loud on the banner without failing the GSC result around it.
  result._queue_refill = await refillEmptyGuideQueues();

  console.log("[hourly-gsc]", JSON.stringify(result));
  await reportCronRun("hourly-gsc", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
