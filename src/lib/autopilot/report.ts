import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { projectPlan } from "@/lib/billing";
import { credsForProject } from "@/lib/dataforseo";
import { loadSiteProfile } from "@/lib/site-profile";
import { normalizeContentPrefs } from "@/lib/content-prefs";
import { aggregatePageTraffic, aggregateQueries, normalizePageUrl, type GscPageStat, type GscQueryStat, type PageTraffic } from "@/lib/metrics";
import { getProjectById, publishTarget, writerMode, type Project } from "@/lib/projects";
import { deltaPct } from "./math";
import { blockedTopicsOf } from "./prefs";
import { weekUsage } from "./scheduler";

// The autopilot report: the ONE data shape the hosted dashboard renders and
// the get_autopilot MCP tool returns (the parity rule, satisfied by
// construction - both doors call this function). Read-only; every number here
// is derived from rows other modules write.

export type AutopilotArticleStatus =
  | "writing"
  | "verifying"
  | "held"
  | "scheduled"
  | "published"
  | "failed"
  | "needs_setup";

export type AutopilotArticle = {
  /** The article_drafts id. EMPTY STRING for a run that has not produced a
   *  draft yet (still writing, or failed before handoff) - key such rows by
   *  runId. "page:<pages.id>" for an article published before autopilot
   *  (source "agent"). */
  draftId: string;
  /** Who wrote it: the hosted writer, or the site's coding agent before the
   *  switch to autopilot (a `pages` row with no draft behind it). */
  source: "writer" | "agent";
  runId: string | null;
  title: string;
  keyword: string | null;
  status: AutopilotArticleStatus;
  /** The writer stage while a run is in flight (pick/research/plan/write/verify). */
  stage: string | null;
  url: string | null;
  publishedAt: string | null;
  createdAt: string;
  costUsd: number;
  /** The plan's information gain: what this article has that page one lacks. */
  gain: string | null;
  clicks28d: number;
  impressions28d: number;
  position: number | null;
  error: string | null;
  /** The writer run's own status, when there is a run: "failed" is the only
   *  state a retry makes sense from (a rejected draft's run is "done"). */
  runStatus: "running" | "held" | "done" | "failed" | null;
  /** Why a held run is held (stage_outputs.verify.handoff.reason): the
   *  first-article read, or a publish cap. */
  holdReason: string | null;
};

export type AutopilotReport = {
  mode: "hosted" | "agent";
  paused: { at: string; reason: string } | null;
  plan: { tier: string; articlesPerWeek: number; status: string };
  nextArticleAt: string | null;
  thisWeek: { published: number; inFlight: number; quota: number };
  articles: AutopilotArticle[];
  traffic: {
    days: Array<{ date: string; clicks: number; impressions: number }>;
    clicks28d: number;
    impressions28d: number;
    deltaClicksPct: number | null;
    topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  };
  ideas: { approved: number; nextTitles: string[] };
  setup: {
    google: boolean;
    publish: "github" | "wordpress" | "hosted" | "manual" | "none";
    hostedLive: boolean | null;
    profile: boolean;
    keywordSource: boolean;
  };
  controls: {
    brand: { name: string; tagline: string; short: string; long: string; categories: string[] };
    tone: string;
    blockedTopics: string[];
    author: { name: string | null; bio: string | null; url: string | null };
  };
  spend: { monthUsd: number };
};

type RunRow = {
  id: string;
  suggestion_id: string | null;
  keyword: string | null;
  title_hint: string | null;
  stage: string;
  status: string;
  draft_id: string | null;
  error: string | null;
  cost_usd: number | string;
  created_at: string;
  hold_reason: string | null;
};

type DraftRow = {
  id: string;
  title: string;
  primary_keyword: string | null;
  status: string;
  published_url: string | null;
  published_at: string | null;
  created_at: string;
  cost_usd: number | string;
  plan: { gain?: { type?: string; where?: string } } | null;
};

// The list holds every writer article and every earlier guide; the writer's
// own rows are read in a bounded window, the merged list is capped higher.
const DRAFT_LIMIT = 100;
const ARTICLE_LIMIT = 300;

/** Tag on every cached Google-derived read for a project; a GSC sync (or
 *  anything else that changes Google numbers) can revalidateTag it. */
export const gscTag = (projectId: string) => `gsc:${projectId}`;

/** The last 28 days of Google's per-page and per-search numbers, folded to
 *  what the report shows. The raw rows are ~450 KB (a top-100 pages and
 *  top-100 searches list per day) and change only when Google syncs, so the
 *  FOLDED result is cached for 10 minutes - never the raw rows, never past
 *  a failed read (unstable_cache doesn't store a throw). */
function gsc28Folded(projectId: string) {
  return unstable_cache(
    async () => {
      const res = await db().from("gsc_stats").select("date, top_queries, top_pages").eq("project_id", projectId).order("date", { ascending: false }).limit(28);
      if (res.error) throw new Error(`could not read searches: ${res.error.message}`);
      const rows = (res.data ?? []) as { date: string; top_queries: GscQueryStat[] | null; top_pages: GscPageStat[] | null }[];
      return {
        pages: [...aggregatePageTraffic(rows)] as Array<[string, PageTraffic]>,
        topQueries: aggregateQueries(rows, 10).map((q) => ({ ...q, position: q.position == null ? 0 : Math.round(q.position * 10) / 10 })),
      };
    },
    ["autopilot-gsc28", projectId],
    { revalidate: 600, tags: [gscTag(projectId)] },
  )();
}
const CHART_DAYS = 90;

/** The status one article shows, from its run and its draft (spec A5). A held
 *  run outranks the draft (a held draft sits at 'submitted'); otherwise the
 *  draft, once it exists, is the truth. */
export function articleStatus(run: Pick<RunRow, "status" | "stage"> | null, draft: Pick<DraftRow, "status"> | null): AutopilotArticleStatus {
  if (run?.status === "held") return "held";
  if (draft) {
    switch (draft.status) {
      case "published": return "published";
      case "blocked_setup": return "needs_setup";
      case "rejected": return "failed";
      default: return "scheduled"; // submitted / accepted / finished
    }
  }
  if (run?.status === "failed") return "failed";
  if (run && (run.stage === "write" || run.stage === "verify")) return "verifying";
  return "writing";
}

function gainText(plan: DraftRow["plan"]): string | null {
  const g = plan?.gain;
  if (!g?.where && !g?.type) return null;
  const kind = g.type ? g.type.replace(/_/g, " ") : null;
  return [kind, g.where].filter(Boolean).join(": ");
}

function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getAutopilotReport(projectId: string): Promise<AutopilotReport> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("no such project");
  const now = new Date();

  const [plan, usage, runsRes, draftsRes, gscLightRes, gsc28, ideas, profile, setup, spend, earlier] = await Promise.all([
    projectPlan(project.id),
    weekUsage(project.id, now),
    db()
      .from("writer_runs")
      .select("id, suggestion_id, keyword, title_hint, stage, status, draft_id, error, cost_usd, created_at, hold_reason:stage_outputs->verify->handoff->>reason")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(DRAFT_LIMIT + 20),
    db()
      .from("article_drafts")
      .select("id, title, primary_keyword, status, published_url, published_at, created_at, cost_usd, plan:validation->plan")
      .eq("project_id", project.id)
      .neq("status", "discarded")
      .order("created_at", { ascending: false })
      .limit(DRAFT_LIMIT),
    // Newest first with a limit, then re-sorted: ascending + limit would pin
    // the window to the oldest days ever collected.
    db().from("gsc_stats").select("date, clicks, impressions").eq("project_id", project.id).order("date", { ascending: false }).limit(CHART_DAYS),
    gsc28Folded(project.id),
    ideaSummary(project.id),
    loadSiteProfile(project),
    setupSummary(project),
    monthSpend(project.id, now),
    earlierArticles(project.id),
  ]);

  // A failed read must surface as "the report didn't load", never as an
  // empty report: an owner shown "no articles yet" for a database hiccup
  // would reasonably conclude the product stopped working.
  for (const [what, res] of [["writer runs", runsRes], ["articles", draftsRes], ["traffic", gscLightRes]] as const) {
    if (res.error) throw new Error(`could not read ${what}: ${res.error.message}`);
  }

  // --- traffic
  const days = ((gscLightRes.data ?? []) as { date: string; clicks: number | null; impressions: number | null }[])
    .map((d) => ({ date: d.date, clicks: Number(d.clicks) || 0, impressions: Number(d.impressions) || 0 }))
    .reverse();
  const last28 = days.slice(-28);
  const prev28 = days.slice(-56, -28);
  const clicks28d = last28.reduce((s, d) => s + d.clicks, 0);
  const impressions28d = last28.reduce((s, d) => s + d.impressions, 0);
  const prevClicks = prev28.reduce((s, d) => s + d.clicks, 0);
  const pageTraffic = new Map(gsc28.pages);
  const topQueries = gsc28.topQueries;

  // --- articles: every draft, joined to its run; plus runs with no draft yet
  const runs = (runsRes.data ?? []) as RunRow[];
  const drafts = (draftsRes.data ?? []) as DraftRow[];
  const runByDraft = new Map(runs.filter((r) => r.draft_id).map((r) => [r.draft_id!, r]));
  const articles: AutopilotArticle[] = drafts.map((d) => {
    const run = runByDraft.get(d.id) ?? null;
    const t = d.published_url ? pageTraffic.get(normalizePageUrl(d.published_url)) : undefined;
    return {
      draftId: d.id,
      source: "writer" as const,
      runId: run?.id ?? null,
      title: d.title,
      keyword: d.primary_keyword,
      status: articleStatus(run, d),
      stage: null,
      url: d.published_url,
      publishedAt: d.published_at,
      createdAt: d.created_at,
      costUsd: Number(run?.cost_usd ?? d.cost_usd) || 0,
      gain: gainText(d.plan),
      clicks28d: t?.clicks ?? 0,
      impressions28d: t?.impressions ?? 0,
      position: t?.avgPosition == null ? null : Math.round(t.avgPosition * 10) / 10,
      error: d.status === "rejected" ? "The article failed the quality gate." : null,
      runStatus: runStatusOf(run),
      holdReason: run?.status === "held" ? run.hold_reason : null,
    };
  });
  for (const r of runs) {
    if (r.draft_id) continue;
    // A run refused at pick never became an article (nothing approved, an
    // off-topic idea parked): bookkeeping, not something to show the owner.
    if (r.status === "failed" && r.stage === "pick") continue;
    if (r.status === "done") continue;
    articles.push({
      draftId: "",
      source: "writer",
      runId: r.id,
      title: r.title_hint ?? r.keyword ?? "Choosing a topic",
      keyword: r.keyword,
      status: articleStatus(r, null),
      stage: r.status === "running" ? r.stage : null,
      url: null,
      publishedAt: null,
      createdAt: r.created_at,
      costUsd: Number(r.cost_usd) || 0,
      gain: null,
      clicks28d: 0,
      impressions28d: 0,
      position: null,
      error: r.status === "failed" ? r.error : null,
      runStatus: runStatusOf(r),
      holdReason: r.status === "held" ? r.hold_reason : null,
    });
  }
  // Articles from before autopilot: every guide the site's coding agent
  // published (the `pages` table), unless a writer draft already stands for
  // the same URL.
  const drafted = new Set(drafts.map((d) => d.published_url).filter(Boolean).map((u) => normalizePageUrl(u!)));
  for (const pg of earlier) {
    const key = normalizePageUrl(pg.url);
    if (drafted.has(key)) continue;
    const t = pageTraffic.get(key);
    const at = pg.published_at ?? pg.live_at ?? pg.created_at;
    articles.push({
      draftId: `page:${pg.id}`,
      source: "agent",
      runId: null,
      title: pg.title?.trim() || pg.url,
      keyword: pg.primary_keyword,
      status: "published",
      stage: null,
      url: pg.url,
      publishedAt: at,
      createdAt: at,
      costUsd: 0,
      gain: null,
      clicks28d: t?.clicks ?? 0,
      impressions28d: t?.impressions ?? 0,
      position: t?.avgPosition == null ? null : Math.round(t.avgPosition * 10) / 10,
      error: null,
      runStatus: null,
      holdReason: null,
    });
  }
  // Newest first by the date that matters: when it went live, else when it
  // was started.
  const when = (a: AutopilotArticle) => Date.parse(a.publishedAt ?? a.createdAt);
  articles.sort((a, b) => when(b) - when(a));

  const prefs = normalizeContentPrefs(project.content_prefs);
  return {
    mode: writerMode(project),
    paused: project.writer_paused_at ? { at: project.writer_paused_at, reason: project.writer_pause_reason ?? "Paused." } : null,
    plan: { tier: plan.tier ?? "none", articlesPerWeek: plan.articlesPerWeek, status: plan.status },
    nextArticleAt: project.writer_paused_at ? null : project.next_article_at,
    thisWeek: { published: usage.published, inFlight: usage.inFlight, quota: plan.articlesPerWeek },
    articles: articles.slice(0, ARTICLE_LIMIT),
    traffic: { days, clicks28d, impressions28d, deltaClicksPct: prev28.length >= 14 ? deltaPct(clicks28d, prevClicks) : null, topQueries },
    ideas,
    setup: { ...setup, profile: profile.fromDb },
    controls: {
      brand: {
        name: profile.profile.name || project.name,
        tagline: profile.profile.tagline,
        short: profile.profile.short,
        long: profile.profile.long,
        categories: profile.profile.categories,
      },
      tone: prefs.house_rules,
      blockedTopics: blockedTopicsOf(project),
      author: { name: project.author_name, bio: project.author_bio, url: project.author_url },
    },
    spend: { monthUsd: spend },
  };
}

type EarlierPage = { id: string; url: string; title: string | null; type: string | null; primary_keyword: string | null; published_at: string | null; live_at: string | null; created_at: string };

/** Guides the site's coding agent published before autopilot (pages rows of
 *  type "guide"; untyped legacy rows only when they sit under /blog/). Tools
 *  are the Tools page's. One project-scoped read of a few columns, cached
 *  10 minutes with the Google numbers (tag gsc:<id>); a failed read throws
 *  like the report's other reads and is never cached. */
function earlierArticles(projectId: string): Promise<EarlierPage[]> {
  return unstable_cache(
    async () => {
      const { data, error } = await db()
        .from("pages")
        .select("id, url, title, type, primary_keyword, published_at, live_at, created_at")
        .eq("project_id", projectId)
        .or("type.eq.guide,type.is.null");
      if (error) throw new Error(`could not read earlier articles: ${error.message}`);
      return ((data ?? []) as EarlierPage[]).filter((p) => p.type === "guide" || /\/blog\//.test(p.url));
    },
    ["autopilot-earlier-articles", projectId],
    { revalidate: 600, tags: [gscTag(projectId)] },
  )();
}

function runStatusOf(run: Pick<RunRow, "status"> | null): AutopilotArticle["runStatus"] {
  const s = run?.status;
  return s === "running" || s === "held" || s === "done" || s === "failed" ? s : null;
}

async function ideaSummary(projectId: string): Promise<AutopilotReport["ideas"]> {
  const [{ data: rows, error: rowsError }, { data: busy, error: busyError }] = await Promise.all([
    db()
      .from("suggestions")
      .select("id, title")
      .eq("project_id", projectId)
      .eq("type", "guide")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(100),
    db().from("writer_runs").select("suggestion_id").eq("project_id", projectId).in("status", ["running", "held"]).not("suggestion_id", "is", null),
  ]);
  if (rowsError || busyError) throw new Error(`could not read the idea queue: ${(rowsError ?? busyError)!.message}`);
  const taken = new Set(((busy ?? []) as { suggestion_id: string }[]).map((r) => r.suggestion_id));
  // Oldest first: the order the writer's pick stage takes them in.
  const free = ((rows ?? []) as { id: string; title: string }[]).filter((r) => !taken.has(r.id));
  return { approved: free.length, nextTitles: free.slice(0, 3).map((r) => r.title) };
}

async function setupSummary(project: Project): Promise<Omit<AutopilotReport["setup"], "profile">> {
  const target = publishTarget(project);
  // "github" is also what an unset target resolves to: without a repo it is
  // nowhere at all, which is what the setup card needs to say.
  // "manual" (copy it over yourself) is a route for an agent-mode owner who
  // wants the files; on a hosted site nothing reaches the site that way, so
  // it is a setup gap like having no route at all.
  const publish: AutopilotReport["setup"]["publish"] =
    target === "github" && !project.github_repo
      ? "none"
      : target === "wordpress" && !project.wp_app_password
        ? "none"
        : target === "manual" && writerMode(project) === "hosted"
          ? "none"
          : target;
  const [gscRows, creds] = await Promise.all([
    project.gsc_oauth_refresh_token
      ? Promise.resolve(1)
      : db().from("gsc_stats").select("id", { count: "exact", head: true }).eq("project_id", project.id).then((r) => r.count ?? 0),
    credsForProject(project, { skipBudgetGate: true }).catch(() => null),
  ]);
  return {
    google: Boolean(project.gsc_site_url) && gscRows > 0,
    publish,
    hostedLive: target === "hosted" ? Boolean(project.hosted_rewrite_live_at) : null,
    keywordSource: creds != null,
  };
}

/** Model spend (model_calls) plus platform-billed DataForSEO spend for this
 *  project, this calendar month, in USD. */
async function monthSpend(projectId: string, now: Date): Promise<number> {
  const since = monthStartIso(now);
  const [models, dfs] = await Promise.all([
    db().from("model_calls").select("cost_microusd").eq("project_id", projectId).gte("created_at", since).limit(20000),
    db().from("dataforseo_usage").select("cost_microusd").eq("project_id", projectId).gte("day", since.slice(0, 10)).gt("cost_microusd", 0),
  ]);
  const sum = (rows: unknown) => ((rows ?? []) as { cost_microusd: number | null }[]).reduce((s, r) => s + (Number(r.cost_microusd) || 0), 0);
  return Math.round((sum(models.data) + sum(dfs.data)) / 10_000) / 100;
}
