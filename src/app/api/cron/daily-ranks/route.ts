import { db } from "@/lib/db";
import { planGate } from "@/lib/billing";
import { credsForProject, takeDecryptFailure } from "@/lib/dataforseo";
import { queueDailyRankTasks } from "@/lib/dataforseo-tasks";
import { platformPacingState, type PacingLevel } from "@/lib/dataforseo-usage";
import { serpProviderForProject, providerRank, takeSerpapiDecryptFailure } from "@/lib/serp";
import { refreshDomainRatingIfStale } from "@/lib/domain-rating";
import { getLatestSnapshot, gscQueryPositions, gscClientForProject } from "@/lib/gsc";
import { gscCronReadiness, type GscReadiness } from "@/lib/gsc-readiness";
import { dataforseoCronReadiness } from "@/lib/dataforseo-readiness";
import { checkCron } from "@/lib/cron-auth";
import {
  buildGoogleAiSnapshot,
  recordAiSnapshots,
  type AiSnapshotInput,
} from "@/lib/ai-visibility";
import { reportCronRun } from "@/lib/cron-alerts";
import { detectRefreshCandidates } from "@/lib/refresh-detect";
import { listProjectsChecked, publishTarget, writerMode, type Project } from "@/lib/projects";
import { enqueue } from "@/lib/jobs";
import { isCloudMode } from "@/lib/cloud";
import { platformBalanceAlert } from "@/lib/dataforseo-balance";

// Daily cron, now per project: for EVERY project, three independent halves - one
// failing must not kill the other, and one project failing must not kill the
// next project.
//  1. Ranks: for every tracking keyword, find the project domain's position and
//     record a rank_checks row. The source follows the project's keyword_source:
//     - DataForSEO: POSTs cheap standard-queue tasks (dataforseo-tasks.ts) and
//       returns; the serp-collect cron writes the actual rank_checks rows
//       ~30-60 min later. Daily depth-30 tasks for keywords seen in the top
//       30, a Monday full-depth sweep (+ AI Overview) for everything, and the
//       pacing governor thins the cadence before the monthly budget can run
//       out (2026-07-27 cost cut - this replaced two live calls per keyword
//       per day).
//     - SerpApi: live checks weekly (Mondays - so ~60 keywords fit the free
//       250/mo quota), AI Overview carried inline for free.
//     - GSC: average position daily (free, but only for queries that actually
//       got impressions).
//  2. GSC: snapshot the most recent date with data into gsc_stats (skipped
//     until the project has a GSC property connected).
//  3. Domain Rating: refresh the domain_ratings snapshot when it has aged past
//     the weekly TTL, so the dashboard reads it without ever paying for the
//     DataForSEO call on render. DataForSEO-only - free modes skip.
//  4. Refresh detection: fold the stored GSC queries and flag published guides
//     sitting at position 5-20 for their primary keyword as type:"update"
//     suggestions (refresh-detect.ts) - the supply half of the builder's
//     UPDATE MODE. Free (no API calls), capped, cooldown-guarded.
// 300s: task posting is fast, but the SerpApi Monday path still chains live
// calls and the GSC halves can be slow on big properties; the route bills
// nothing for idle wall clock.

export const maxDuration = 300;

/** How old a site digest may get before it is re-read. A week: long enough
 *  that we are not a load on anyone's site, short enough that a page
 *  published last week can already be linked to. */
const CRAWL_MAX_AGE_DAYS = 7;

// SerpApi free tier = 250 searches/month. Weekly checks keep ~60 tracked
// keywords inside that budget; Monday is arbitrary but stable.
function isSerpapiCheckDay(): boolean {
  return new Date().getUTCDay() === 1;
}

async function runRanks(
  project: Project,
  gscReady: GscReadiness,
): Promise<Record<string, unknown>> {
  // Oldest first, and that ORDER IS LOAD-BEARING: the platform-billed sweep
  // cap (SWEEP_MAX_PLATFORM in dataforseo-tasks.ts) keeps the first N of this
  // list, so an unordered query would silently rotate which keywords get
  // checked from run to run and leave every one of them with a broken history.
  const { data: keywords, error } = await db()
    .from("keywords")
    .select("id, keyword")
    .eq("project_id", project.id)
    .eq("status", "tracking")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const tracked = keywords ?? [];
  if (tracked.length === 0) return { skipped: "no tracked keywords" };

  // --- GSC mode: positions from Search Console, no SERP provider ---
  if (project.keyword_source === "gsc") {
    // Same setup gate as the GSC snapshot half - a GSC-mode project whose
    // owner hasn't granted the service account yet skips, never errors.
    if (!gscReady.ready) return { skipped: gscReady.skipped };
    const positions = await gscQueryPositions(
      project.gsc_site_url!,
      tracked.map((k) => k.keyword),
      7,
      // gscReady checked above - safe to fall back to the service account.
      await gscClientForProject(project, { afterReadinessCheck: true }),
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

  // --- DataForSEO: post cheap standard-queue tasks; serp-collect writes the
  // rows. Creds are resolved with the monthly budget gate BYPASSED on
  // purpose: the pacing governor is what enforces spend here (its terminal
  // "weekly" level keeps only the bounded Monday sweep), so an owner who
  // crossed the budget mid-month degrades to weekly tracking instead of
  // losing rank tracking entirely - the gate still hard-stops every other
  // paid feature (keyword_ideas, check_serp, DR refresh).
  if (project.keyword_source === "dataforseo") {
    const creds = await credsForProject(project, { skipBudgetGate: true });
    if (!creds) {
      // A decrypt failure (rotated ENCRYPTION_KEY, corrupted ciphertext)
      // means creds that worked before are now broken - a regression, not a
      // normal "not connected yet" state. Report it as a failed check
      // (populating `failed` trips hadError below, same as any other
      // rank-check error) instead of a silent informational skip
      // (2026-07-27 audit).
      const decryptErr = takeDecryptFailure(project.id);
      if (decryptErr) return { failed: [decryptErr] };
      return { skipped: "no DataForSEO connected" };
    }
    // Credentials saved is not the same as an account that can pay. An unfunded
    // BYO account is a normal mid-setup state (Home's "Fund DataForSEO" card
    // owns it), and without this gate it threw a non-transient error that 500'd
    // the run and emailed on the first failure, every night.
    const dfsReady = await dataforseoCronReadiness(project, creds);
    if (!dfsReady.ready) return { skipped: dfsReady.skipped };
    // The governor only ever throttles platform-billed projects - BYO
    // accounts spend their own money at full cadence.
    let pacing: PacingLevel = "normal";
    if (creds.billedTo === "platform") {
      pacing = (await platformPacingState(project.id)).level;
    }
    // Hosted sites: the Monday sweep only, never the daily depth-30 pass
    // (audit 2026-10-24, cost). Their keywords are tracked only once the
    // article is live (autopilot/tracking.ts) and an autopilot article
    // moves on a weekly scale; a daily check buys six repeats of one number.
    // "weekly" is the governor's own terminal level, so the sweep, its cap
    // and the dormant-keyword decay all apply unchanged.
    if (writerMode(project) === "hosted") pacing = "weekly";
    const queued = await queueDailyRankTasks(project, creds, tracked, pacing);
    return { source: "dataforseo", ...queued };
  }

  // --- SerpApi: live checks via the provider layer, weekly ---
  const provider = await serpProviderForProject(project);
  if (!provider) {
    const decryptErr = takeSerpapiDecryptFailure(project.id);
    if (decryptErr) return { failed: [decryptErr] };
    return { skipped: "no SerpApi key connected" };
  }
  if (!isSerpapiCheckDay()) {
    return { skipped: "SerpApi runs weekly (Mondays) to stay inside the free quota" };
  }

  const aiRows: AiSnapshotInput[] = [];
  const checks = await Promise.allSettled(
    // Wrapped so every failure names its keyword - a bare provider error
    // in the alert email gives the owner nothing to act on.
    tracked.map((kw) => (async () => {
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
      if (insErr) throw new Error(insErr.message);
      // SerpApi carries the Google AI Overview inline in the rank pull, free.
      if (rank.ai) aiRows.push(buildGoogleAiSnapshot(kw.keyword, project.domain, rank.ai));
      return { keyword: kw.keyword, position: rank.position };
    })().catch((e: unknown) => {
      throw new Error(`"${kw.keyword}": ${e instanceof Error ? e.message : String(e)}`);
    })),
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

  // Plan gate (cloud only): a project beyond its owner's site allowance -
  // e.g. after a Scale -> Starter downgrade - pauses instead of burning paid
  // SERP checks. Informational skip, never an error; data stays, upgrading
  // resumes it on the next run.
  const gate = await planGate(project.id);
  if (!gate.allowed) return { skipped: `plan: ${gate.reason}` };

  // A paused hosted site writes nothing new; paying for its rank checks and
  // Domain Rating meanwhile buys numbers nobody acts on. The free halves
  // (Search Console snapshot, refresh detection, the weekly crawl) still run:
  // the owner reading their dashboard during a pause wants current traffic.
  const pausedHosted = writerMode(project) === "hosted" && Boolean(project.writer_paused_at);

  // Setup gate, computed once and shared by the two GSC consumers below
  // (GSC-mode ranks + the snapshot half): a project whose owner hasn't
  // finished the Search Console step skips as information, not as a failure
  // that 500s the run and emails the owner. See gsc-readiness.ts.
  const gscReady = await gscCronReadiness(project);

  // --- 1. Ranks (source follows the project's keyword_source) ---
  try {
    const ranks = pausedHosted ? { skipped: "autopilot paused" } : await runRanks(project, gscReady);
    result.ranks = ranks;
    if (Array.isArray(ranks.failed) && ranks.failed.length) result.hadError = true;
  } catch (e) {
    result.hadError = true;
    result.ranks = { error: e instanceof Error ? e.message : String(e) };
  }

  // --- 2. GSC snapshot ---
  try {
    if (!gscReady.ready) {
      result.gsc = { skipped: gscReady.skipped };
    } else {
      const snap = await getLatestSnapshot(
        project.gsc_site_url!,
        // gscReady checked at the top of this branch.
        await gscClientForProject(project, { afterReadinessCheck: true }),
      );
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

  // --- 3. Domain Rating (weekly refresh, billed like the project's other
  // DataForSEO calls). Independent of keyword_source: any project with
  // DataForSEO creds gets DR; free modes without creds skip - there is no
  // free backlink index.
  const creds = pausedHosted ? null : await credsForProject(project);
  if (pausedHosted) {
    result.dr = { skipped: "autopilot paused" };
  } else if (!creds) {
    // Same regression-vs-not-configured distinction as the ranks half above:
    // a decrypt failure means DR was working and just broke.
    const decryptErr = takeDecryptFailure(project.id);
    if (decryptErr) {
      result.hadError = true;
      result.dr = { error: decryptErr };
    } else {
      result.dr = { skipped: "no DataForSEO connected" };
    }
  } else if (!(await dataforseoCronReadiness(project, creds)).ready) {
    // Same funding gate as the ranks half. DR is the other call that turned an
    // unfunded account into a nightly 500 + email: refreshDomainRatingIfStale
    // reports failed:true, which sets hadError directly.
    result.dr = { skipped: "setup incomplete: DataForSEO account has no funds yet" };
  } else {
    try {
      const { rating, refreshed, failed } = await refreshDomainRatingIfStale(
        project.id,
        project.domain,
        creds,
      );
      if (failed) {
        result.hadError = true;
        result.dr = { error: "DataForSEO returned no backlinks summary" };
      } else if (refreshed && rating) {
        result.dr = { dr: rating.dr, referringDomains: rating.referringDomains };
      } else {
        result.dr = { fresh: true, dr: rating?.dr ?? null };
      }
    } catch (e) {
      result.hadError = true;
      result.dr = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // --- 4. Refresh detection: guides at position 5-20 for their primary
  // keyword become type:"update" suggestions for the builder's UPDATE MODE.
  // Reads only stored gsc_stats rows (no live GSC call), so it needs no
  // readiness gate - a project without data reads as {skipped}, and the
  // detector's own caps keep it from ever flooding a queue.
  try {
    result.refresh = await detectRefreshCandidates(project);
  } catch (e) {
    result.hadError = true;
    result.refresh = { error: e instanceof Error ? e.message : String(e) };
  }

  // --- 5. Keep what we know about the site from going stale. The digest is
  // what a chat AI reads INSTEAD of crawling the site itself, and the link
  // candidates are what the finisher inserts internal links from - both go
  // wrong quietly as a site grows, because a stale digest still looks like a
  // digest. Weekly is the cadence: often enough that a month-old page is
  // linkable, rare enough that nobody's site is hit daily by us.
  //
  // Queued, never run here: this cron has three other halves waiting on it,
  // and a 150-page crawl inside one of them would push the whole run past its
  // wall clock. Only queued for projects that publish through us; a project
  // with neither a repo nor a WordPress connection has nothing to link into.
  try {
    result.crawl = await queueCrawlIfStale(project);
  } catch (e) {
    result.hadError = true;
    result.crawl = { error: e instanceof Error ? e.message : String(e) };
  }

  return result;
}

/** Weekly re-read of the customer's own site. Returns what it decided, so a
 *  run log answers "why is this digest three weeks old" without a query. */
async function queueCrawlIfStale(project: Project): Promise<Record<string, unknown>> {
  // Nothing to read. Not an error: a project can exist before its domain does.
  if (!project.domain) return { skipped: "no domain yet" };

  // Skip only a project that genuinely publishes nowhere: target github with
  // no repo connected. WordPress and manual both count - a manual-target
  // owner's own AI is exactly who reads the digest, and their finished
  // articles still get internal links inserted from it.
  const publishes = publishTarget(project) !== "github" || Boolean(project.github_repo);
  if (!publishes) return { skipped: "site does not publish through us yet" };

  const { data } = await db()
    .from("site_digests")
    .select("crawled_at")
    .eq("project_id", project.id)
    .maybeSingle();
  const crawledAt = (data as { crawled_at: string | null } | null)?.crawled_at ?? null;
  const ageDays = crawledAt ? (Date.now() - Date.parse(crawledAt)) / 86_400_000 : Infinity;
  if (ageDays < CRAWL_MAX_AGE_DAYS) return { fresh: true, age_days: Math.round(ageDays) };

  // Dated key: today's crawl is queued once no matter how often this cron
  // fires, and tomorrow's is not blocked by today's still sitting there.
  const day = new Date().toISOString().slice(0, 10);
  const job = await enqueue({
    projectId: project.id,
    kind: "crawl",
    payload: { isWordPress: publishTarget(project) === "wordpress", maxPages: 150 },
    idempotencyKey: `crawl:${project.id}:${day}`,
  });
  return { queued: Boolean(job), age_days: crawledAt ? Math.round(ageDays) : null };
}

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  const { projects, degraded } = await listProjectsChecked();
  const runs = await Promise.allSettled(projects.map((p) => runProject(p)));

  const result: Record<string, unknown> = {};
  let hadError = false;
  if (degraded) {
    // The projects query failed for a non-schema reason: we're running only the
    // synthetic fallback and may be skipping real tenants. Fail loudly so it
    // alerts instead of reporting a false success. (2026-07-21 audit.)
    hadError = true;
    result._projects_degraded = degraded;
  }
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

  // Once per run, not per project: the shared account bundled cloud
  // DataForSEO bills against. A low balance here would silently starve every
  // platform-billed project's rank checks at once, so it's loud like a real
  // regression - never an informational skip.
  if (isCloudMode()) {
    const alert = await platformBalanceAlert();
    if (alert) {
      hadError = true;
      result._platform = { error: alert };
    }
  }

  console.log("[daily-ranks]", JSON.stringify(result));
  await reportCronRun("daily-ranks", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
