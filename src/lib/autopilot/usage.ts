import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";
import { planGate, polarConfigured, projectPlan } from "@/lib/billing";
import { writerMode, type Project } from "@/lib/projects";
import { missingCredentials } from "@/lib/writer/models";
import { cadence, weekStartUtc, spacingDaysFor } from "./math";

// What a site has used of its weekly article quota, and the one gate every
// writer start passes (startWriterRun calls writerStartGate - so the MCP
// write_article tool, the dashboard's Retry and the scheduler are all held
// to the same plan, pause, quota and spacing rules; there is no side door).
//
// Kept apart from scheduler.ts on purpose: writer/runs.ts imports this, and
// the scheduler imports runs.ts.

const CLIENT_KIND = "dispatchseo-writer";

export type WeekUsage = {
  /** Articles counted against this ISO week's quota. */
  count: number;
  published: number;
  inFlight: number;
  /** Runs this week that failed after pick: they spent real money, so they
   *  use a slot (otherwise a failing pipeline retries all week for free).
   *  Infra failures (ours, not the article's) are excluded. */
  failed: number;
  lastStartedAt: string | null;
};

const ZERO: WeekUsage = { count: 0, published: 0, inFlight: 0, failed: 0, lastStartedAt: null };

/**
 * The projects whose articles share one quota. On cloud that is every project
 * of the same owner on the same domain: deleting a site and adding it again
 * (or adding it twice) must not reset the week. Self-host and ownerless rows
 * are their own bucket. Note: a deleted project's rows are gone (ON DELETE
 * CASCADE), so this closes the duplicate-project hole, not a delete made in
 * the same week; the plan's site count and the daily start cap still bound it.
 */
async function quotaBucket(projectId: string): Promise<string[]> {
  if (!isCloudMode()) return [projectId];
  const { data: p } = await db().from("projects").select("owner_user_id, domain").eq("id", projectId).maybeSingle();
  const row = p as { owner_user_id: string | null; domain: string | null } | null;
  if (!row?.owner_user_id || !row.domain) return [projectId];
  const { data } = await db().from("projects").select("id").eq("owner_user_id", row.owner_user_id).eq("domain", row.domain);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  return ids.includes(projectId) ? ids : [projectId, ...ids];
}

/** Articles counted against this ISO week, and when the last one started.
 *  A read error answers zeros rather than throwing: the dashboard report
 *  renders from this and must not fail on a blip. */
export async function weekUsage(projectId: string, now: Date): Promise<WeekUsage> {
  try {
    const ids = await quotaBucket(projectId);
    const since = weekStartUtc(now).toISOString();
    const [draftsRes, runsRes, lastRunsRes, lastDraftRes] = await Promise.all([
      db()
        .from("article_drafts")
        .select("status")
        .in("project_id", ids)
        .eq("client_kind", CLIENT_KIND)
        .gte("created_at", since)
        .not("status", "in", "(rejected,discarded)"),
      // Runs with no draft: still writing (holds a slot), or failed after
      // pick (spent a slot). Runs that produced a draft are counted above.
      db()
        .from("writer_runs")
        .select("status, stage, failure_kind:stage_outputs->>failure_kind")
        .in("project_id", ids)
        .is("draft_id", null)
        .gte("created_at", since),
      // Spacing counts every run that got past pick, failed ones included: a
      // failing pipeline must not start a fresh (paid) run every morning. A
      // run that died AT pick spent next to nothing and must not delay a try.
      db().from("writer_runs").select("created_at, status, stage, failure_kind:stage_outputs->>failure_kind").in("project_id", ids).order("created_at", { ascending: false }).limit(10),
      db()
        .from("article_drafts")
        .select("created_at")
        .in("project_id", ids)
        .eq("client_kind", CLIENT_KIND)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (draftsRes.error || runsRes.error) return ZERO;
    const drafts = (draftsRes.data ?? []) as { status: string }[];
    const runs = (runsRes.data ?? []) as { status: string; stage: string; failure_kind: string | null }[];
    const published = drafts.filter((d) => d.status === "published").length;
    const running = runs.filter((r) => r.status === "running").length;
    // A run stopped by OUR side (failure_kind "infra": DataForSEO ceiling,
    // a model vendor outage, a stage the queue gave up on) is not the
    // customer's article: charging it to their week meant a vendor outage on
    // Monday cost a Starter site its only article of the week (audit C2).
    // It neither counts against the quota nor delays the next try.
    const ours = (r: { status: string; failure_kind: string | null }) => r.status === "failed" && r.failure_kind === "infra";
    const failed = runs.filter((r) => r.status === "failed" && r.stage !== "pick" && !ours(r)).length;
    const recent = ((lastRunsRes.data ?? []) as { created_at: string; status: string; stage: string; failure_kind: string | null }[]).filter(
      (r) => !(r.status === "failed" && r.stage === "pick") && !ours(r),
    );
    const lastStartedAt =
      [recent[0]?.created_at, (lastDraftRes.data as { created_at: string } | null)?.created_at]
        .filter((x): x is string => Boolean(x))
        .sort()
        .at(-1) ?? null;
    return {
      count: drafts.length + running + failed,
      published,
      inFlight: drafts.length - published + running,
      failed,
      lastStartedAt,
    };
  } catch {
    return ZERO;
  }
}

/**
 * May a writer run start for this project now? null = yes; otherwise the
 * sentence that says why not.
 *
 *   paused          writer_paused_at set (owner or auto-pause)
 *   no keys         the deploy has no model credentials
 *   plan            cloud fails CLOSED: billing not configured, a plan the
 *                   gate does not cover, or a plan that buys 0 articles.
 *                   Self-host has no plan and is not gated here.
 *   quota/spacing   hosted projects only: the weekly quota and the spacing
 *                   between starts (math.ts cadence / spacingDaysFor). `gated` skips ONLY this part,
 *                   for the scheduler, which just evaluated the same rule.
 */
export async function writerStartGate(project: Project, opts: { gated?: boolean } = {}, now = new Date()): Promise<string | null> {
  if (project.writer_paused_at) return "The autopilot is paused for this site. Resume it first.";
  const missing = missingCredentials();
  if (missing.length) return `The hosted writer has no model credentials on this deploy (${missing.join("; ")}).`;
  if (isCloudMode()) {
    if (!polarConfigured()) return "plan inactive: billing is not configured on this deploy, so no article can be started.";
    const gate = await planGate(project.id);
    if (!gate.allowed) return `plan inactive: ${gate.reason}.`;
  }
  const plan = await projectPlan(project.id);
  if (isCloudMode() && plan.articlesPerWeek === 0) return "plan inactive: this site's plan includes no articles right now.";
  if (writerMode(project) === "hosted" && !opts.gated) {
    const usage = await weekUsage(project.id, now);
    const verdict = cadence({ now, quota: plan.articlesPerWeek, countThisWeek: usage.count, lastStartedAt: usage.lastStartedAt });
    if (!verdict.write) {
      const when = verdict.nextAt ? ` The next one can start ${verdict.nextAt.toISOString().slice(0, 10)}.` : "";
      return verdict.reason === "quota met"
        ? `This site has used its ${plan.articlesPerWeek} article${plan.articlesPerWeek === 1 ? "" : "s"} for this week.${when}`
        : verdict.reason === "spacing"
          ? `Articles for one site start at least ${spacingDaysFor(plan.articlesPerWeek) === 1 ? "a day" : `${spacingDaysFor(plan.articlesPerWeek)} days`} apart.${when}`
          : "This site's plan includes no articles right now.";
    }
  }
  return null;
}
