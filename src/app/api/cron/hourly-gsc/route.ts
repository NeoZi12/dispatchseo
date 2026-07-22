import { db } from "@/lib/db";
import { planGate } from "@/lib/billing";
import { getFreshSnapshots, inspectIndexStatus } from "@/lib/gsc";
import { gscCronReadiness } from "@/lib/gsc-readiness";
import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { recoverStuckBuilds } from "@/lib/build-recovery";
import { listProjectsChecked, type Project } from "@/lib/projects";

// Hourly GSC refresh, triggered by the hourly-gsc GitHub Action (Vercel Hobby
// crons cap at once/day, so the hourly schedule lives outside Vercel). This is
// the fresh-data counterpart of the daily cron's GSC half: it re-upserts the
// last few dates using dataState ALL, so today's provisional numbers flow into
// gsc_stats intraday and each trailing row converges to its final values as
// Google finalizes it. SERP rank checks stay on the daily cron only - ranks do
// not move hourly and the SERP calls are the paid part.

export const maxDuration = 60;

// Verified-index sweep: ask the read-only URL Inspection API about pages not
// yet confirmed indexed and stamp pages.indexed_at on a PASS verdict
// (migration 0010). Oldest-checked first so the budget rotates through any
// backlog; at this schedule the worst case is ~80 calls/day per property,
// far under the 2000/day quota. Best-effort accelerator: any failure here
// (missing 0010 columns, quota, permissions) is reported in the run log but
// never fails the snapshot half.
const INSPECT_BUDGET = 10;

async function verifyIndexing(project: Project): Promise<Record<string, unknown>> {
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
  for (const row of rows) {
    const now = new Date().toISOString();
    try {
      const result = await inspectIndexStatus(project.gsc_site_url!, row.url);
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
  return { checked: rows.length, newly_indexed: newlyIndexed, failed };
}

async function runProject(project: Project): Promise<Record<string, unknown>> {
  // Setup gate (gsc-readiness.ts): a project whose owner hasn't finished the
  // Search Console step skips as information, not as a failure - a mid-setup
  // project must never 500 the run, fail the GitHub Action, or email the
  // owner. The index sweep below is gated too: it reads with the same
  // service account, so without access it could only burn quota on failures.
  // Plan gate (cloud only): downgraded-past or lapsed accounts pause instead
  // of consuming service. Informational skip, same as the setup gate.
  const gate = await planGate(project.id);
  if (!gate.allowed) return { skipped: `plan: ${gate.reason}` };
  const readiness = await gscCronReadiness(project.id, project.gsc_site_url);
  if (!readiness.ready) return { skipped: readiness.skipped };
  const snaps = await getFreshSnapshots(project.gsc_site_url!);
  // No snapshot data is no reason to skip index verification - a brand-new
  // site with zero impressions is exactly where it matters most.
  if (snaps.length === 0) {
    return { skipped: "no GSC data in window", indexing: await verifyIndexing(project) };
  }

  for (const snap of snaps) {
    const { error } = await db().from("gsc_stats").upsert(
      {
        project_id: project.id,
        date: snap.date,
        clicks: snap.clicks,
        impressions: snap.impressions,
        ctr: snap.ctr,
        avg_position: snap.avg_position,
        top_queries: snap.top_queries,
        top_pages: snap.top_pages,
      },
      { onConflict: "project_id,date" },
    );
    if (error) throw new Error(`${snap.date}: ${error.message}`);
  }
  const indexing = await verifyIndexing(project);
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
    } else {
      hadError = true;
      result[slug] = { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    }
  });

  // Piggybacked maintenance: this is the most frequent backend heartbeat,
  // so it also runs the stuck-build recovery sweep (see build-recovery.ts).
  // Best-effort by contract - it must never affect the GSC result.
  await recoverStuckBuilds();

  console.log("[hourly-gsc]", JSON.stringify(result));
  await reportCronRun("hourly-gsc", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
