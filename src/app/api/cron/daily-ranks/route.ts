import { db } from "@/lib/db";
import { credsForProject, serpAiOverview } from "@/lib/dataforseo";
import { serpProviderForProject, providerRank } from "@/lib/serp";
import { refreshDomainRating } from "@/lib/domain-rating";
import { getLatestSnapshot, gscQueryPositions } from "@/lib/gsc";
import { checkCron } from "@/lib/cron-auth";
import {
  buildGoogleAiSnapshot,
  recordAiSnapshots,
  type AiSnapshotInput,
} from "@/lib/ai-visibility";
import { reportCronRun } from "@/lib/cron-alerts";
import { listProjects, type Project } from "@/lib/projects";

// Daily cron, now per project: for EVERY project, three independent halves - one
// failing must not kill the other, and one project failing must not kill the
// next project.
//  1. Ranks: for every tracking keyword, find the project domain's position and
//     record a rank_checks row. The source follows the project's keyword_source:
//     DataForSEO daily, SerpApi weekly (Mondays - so ~60 keywords fit the free
//     250/mo quota), or GSC average position daily (free, but only for queries
//     that actually got impressions).
//  2. GSC: snapshot the most recent date with data into gsc_stats (skipped
//     until the project has a GSC property connected).
//  3. Domain Rating: refresh the domain_ratings snapshot so the dashboard reads
//     it without ever paying for the DataForSEO call on render (the row stays
//     under 24h old between daily runs). DataForSEO-only - free modes skip.
// SERP calls run in parallel across keywords, but a DataForSEO keyword now
// makes TWO sequential live calls (~6s each): the rank check plus the depth-10
// AI Overview check - ~12s per keyword chain, still fine inside the 60s
// function limit since chains run concurrently. If the combined keyword set
// grows past ~30, move to task-based SERP - see LATER.md.

export const maxDuration = 60;

// SerpApi free tier = 250 searches/month. Weekly checks keep ~60 tracked
// keywords inside that budget; Monday is arbitrary but stable.
function isSerpapiCheckDay(): boolean {
  return new Date().getUTCDay() === 1;
}

async function runRanks(project: Project): Promise<Record<string, unknown>> {
  const { data: keywords, error } = await db()
    .from("keywords")
    .select("id, keyword")
    .eq("project_id", project.id)
    .eq("status", "tracking");
  if (error) throw new Error(error.message);
  const tracked = keywords ?? [];
  if (tracked.length === 0) return { skipped: "no tracked keywords" };

  // --- GSC mode: positions from Search Console, no SERP provider ---
  if (project.keyword_source === "gsc") {
    if (!project.gsc_site_url) return { skipped: "GSC mode but no GSC property connected" };
    const positions = await gscQueryPositions(
      project.gsc_site_url,
      tracked.map((k) => k.keyword),
    );
    // No impressions in the window = unknown, not "not ranking" - skip those
    // rows so the dashboard keeps the last known value instead of lying.
    const rows = tracked
      .filter((kw) => positions.has(kw.keyword))
      .map((kw) => ({
        keyword_id: kw.id,
        project_id: project.id,
        position: Math.round(positions.get(kw.keyword)!.position),
        url: null,
      }));
    const failed: string[] = [];
    if (rows.length > 0) {
      const { error: insErr } = await db().from("rank_checks").insert(rows);
      if (insErr) failed.push(insErr.message);
    }
    return {
      source: "gsc",
      checked: failed.length ? 0 : rows.length,
      no_gsc_data: tracked.length - rows.length,
      failed,
    };
  }

  // --- DataForSEO / SerpApi modes: live SERP via the provider layer ---
  const provider = serpProviderForProject(project);
  if (!provider) {
    return {
      skipped:
        project.keyword_source === "serpapi"
          ? "no SerpApi key connected"
          : "no DataForSEO connected",
    };
  }
  if (provider.kind === "serpapi" && !isSerpapiCheckDay()) {
    return { skipped: "SerpApi runs weekly (Mondays) to stay inside the free quota" };
  }

  const aiRows: AiSnapshotInput[] = [];
  const checks = await Promise.allSettled(
    tracked.map(async (kw) => {
      const rank = await providerRank(
        provider,
        kw.keyword,
        project.domain,
        project.location_code,
        project.language_code,
      );
      const { error: insErr } = await db().from("rank_checks").insert({
        keyword_id: kw.id,
        project_id: project.id,
        position: rank.position,
        url: rank.url,
      });
      if (insErr) throw new Error(`${kw.keyword}: ${insErr.message}`);
      // Google AI Overview snapshot. SerpApi carries it inline in the rank
      // pull (free); DataForSEO needs a separate depth-10 advanced call
      // ($0.002, vs $0.02 to fold it into the depth-100 rank call). Best
      // effort: an AI-check failure must never fail the rank it rides with.
      let ai = rank.ai;
      if (!ai && provider.kind === "dataforseo") {
        try {
          ai = (
            await serpAiOverview(
              kw.keyword,
              provider.creds,
              project.location_code,
              project.language_code,
            )
          ).ai;
        } catch (e) {
          console.error(`[daily-ranks] AI Overview check failed for "${kw.keyword}":`, e);
        }
      }
      if (ai) aiRows.push(buildGoogleAiSnapshot(kw.keyword, project.domain, ai));
      return { keyword: kw.keyword, position: rank.position };
    }),
  );
  const succeeded = checks.filter((c) => c.status === "fulfilled").length;
  const failed = checks
    .filter((c) => c.status === "rejected")
    .map((c) => (c as PromiseRejectedResult).reason?.message ?? "unknown");
  // AI-visibility write is best-effort: a missing 0025 migration or a bad
  // insert must never fail the rank half it rides on.
  let aiVisibility: Record<string, unknown> = { snapshots: 0 };
  if (aiRows.length > 0) {
    const rec = await recordAiSnapshots(project.id, aiRows);
    aiVisibility =
      "error" in rec
        ? { error: rec.error }
        : { snapshots: rec.inserted, cited: aiRows.filter((r) => r.cited).length };
  }
  return { source: provider.kind, checked: succeeded, failed, ai_overview: aiVisibility };
}

async function runProject(project: Project): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // --- 1. Ranks (source follows the project's keyword_source) ---
  try {
    const ranks = await runRanks(project);
    result.ranks = ranks;
    if (Array.isArray(ranks.failed) && ranks.failed.length) result.hadError = true;
  } catch (e) {
    result.hadError = true;
    result.ranks = { error: e instanceof Error ? e.message : String(e) };
  }

  // --- 2. GSC snapshot ---
  try {
    if (!project.gsc_site_url) {
      result.gsc = { skipped: "no GSC property connected" };
    } else {
      const snap = await getLatestSnapshot(project.gsc_site_url);
      if (!snap) {
        result.gsc = { skipped: "no GSC data in window" };
      } else {
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
        if (error) throw new Error(error.message);
        result.gsc = { date: snap.date, clicks: snap.clicks, impressions: snap.impressions };
      }
    }
  } catch (e) {
    result.hadError = true;
    result.gsc = { error: e instanceof Error ? e.message : String(e) };
  }

  // --- 3. Domain Rating (billed to the project's own DataForSEO account).
  // Independent of keyword_source: any project with DataForSEO creds gets DR;
  // free modes without creds skip - there is no free backlink index.
  const creds = credsForProject(project);
  if (!creds) {
    result.dr = { skipped: "no DataForSEO connected" };
  } else {
    try {
      const dr = await refreshDomainRating(project.id, project.domain, creds);
      if (dr) {
        result.dr = { dr: dr.dr, referringDomains: dr.referringDomains };
      } else {
        result.hadError = true;
        result.dr = { error: "DataForSEO returned no backlinks summary" };
      }
    } catch (e) {
      result.hadError = true;
      result.dr = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return result;
}

export async function GET(req: Request): Promise<Response> {
  const denied = checkCron(req);
  if (denied) return denied;

  const projects = await listProjects();
  const runs = await Promise.allSettled(projects.map((p) => runProject(p)));

  const result: Record<string, unknown> = {};
  let hadError = false;
  runs.forEach((r, i) => {
    const slug = projects[i].slug;
    if (r.status === "fulfilled") {
      if (r.value.hadError) hadError = true;
      delete r.value.hadError;
      result[slug] = r.value;
    } else {
      hadError = true;
      result[slug] = { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    }
  });

  console.log("[daily-ranks]", JSON.stringify(result));
  await reportCronRun("daily-ranks", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
