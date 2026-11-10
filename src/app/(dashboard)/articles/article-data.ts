import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { gscTag } from "@/lib/autopilot/report";
import { normalizePageUrl, type GscPageStat } from "@/lib/metrics";
import { isKnownGone } from "@/lib/page-liveness";
import { credsForProject, keywordOverview } from "@/lib/dataforseo";
import { cachedBulkKeywordDifficulty } from "@/lib/keyword-research-cache";
import { keywordKey, keywordStatsBulk, type KeywordStats } from "@/lib/article-keyword-stats";
import type { Project } from "@/lib/projects";
import type { AutopilotArticle } from "@/lib/autopilot/report";

// Server-only reads behind the article list (Home and Articles) and the
// article page. Nothing here writes, and nothing here is new data: Google's
// per-page numbers come from the daily top-100 pages already stored on
// gsc_stats, the research ledger from the draft's own validation, the
// step times from the writer's model_calls log.
//
// Speed: the per-page history is ~530 KB of JSON (400 days x 100 pages), so
// it is never read per request. What the screens need from it - each URL's
// position now and at best, one article's day series - is derived once and
// cached 10 minutes per project (tag gsc:<id>; Google syncs hourly at most).
// Liveness ("gone") likewise. A failed read is never cached.

export type ArticleKey = string;
export const keyOf = (a: Pick<AutopilotArticle, "draftId" | "runId" | "createdAt">): ArticleKey => a.draftId || a.runId || a.createdAt;

export type Source = { url: string; host: string; title: string | null };

/** What the list shows about an article beyond the report's own row: only
 *  whether the page is known not to load any more (isKnownGone). The
 *  position and sources it once carried moved to the article's page, and
 *  the list stopped reading them - so they are no longer computed or sent. */
export type ArticleGlance = {
  gone: boolean;
  /** The target keyword's monthly searches and difficulty (0-100), as
   *  research measured them (article-keyword-stats.ts); null = unmeasured. */
  volume: number | null;
  difficulty: number | null;
};

export type PageDay = { date: string; clicks: number; impressions: number; position: number | null };

/** One checked claim: the sentence, what its best source passage said
 *  about it, and that source when it is one we kept. */
export type Check = { claim: string; verdict: "supports" | "contradicts" | "says_nothing"; source: Source | null };

export type Ledger = {
  angle: string | null;
  score: number | null;
  claims: number;
  supported: number;
  maxOverlap: number | null;
  sources: Source[];
  checks: Check[];
  /** /api/cover/<id> draws this draft (it 404s for rejected or discarded
   *  ones, so the page shows a placeholder instead of a broken image). */
  cover: boolean;
};

// The cover route's own allowlist (src/app/api/cover/[draftId]/route.ts).
const COVER_STATUSES = new Set(["accepted", "finished", "published", "blocked_setup"]);

const HISTORY_DAYS = 400;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Google's daily top-100 pages, newest first. One read serves every
 *  article on a screen. A day the page wasn't in the top 100 has no row
 *  for it - on a young site that means it simply had no search traffic. */
async function pageHistory(projectId: string): Promise<Array<{ date: string; pages: GscPageStat[] }>> {
  const { data, error } = await db()
    .from("gsc_stats")
    .select("date, top_pages")
    .eq("project_id", projectId)
    .order("date", { ascending: false })
    .limit(HISTORY_DAYS);
  // Thrown, not swallowed: an empty result here would be cached for 10
  // minutes. Callers fall back themselves.
  if (error) throw new Error(`could not read page history: ${error.message}`);
  return ((data ?? []) as Array<{ date: string; top_pages: GscPageStat[] | null }>).map((r) => ({ date: r.date, pages: r.top_pages ?? [] }));
}

/** One page's day, folding URL variants (trailing slash, case) together. */
function dayFor(pages: GscPageStat[], key: string): { clicks: number; impressions: number; position: number | null } | null {
  let clicks = 0;
  let impressions = 0;
  let posWeight = 0;
  let found = false;
  for (const p of pages) {
    if (normalizePageUrl(p.page) !== key) continue;
    found = true;
    const impr = p.impressions ?? 0;
    clicks += p.clicks ?? 0;
    impressions += impr;
    posWeight += (p.position ?? 0) * Math.max(impr, 1);
  }
  if (!found) return null;
  return { clicks, impressions, position: posWeight > 0 ? posWeight / Math.max(impressions, 1) : null };
}

async function ledgerRows(projectId: string, draftIds: string[]) {
  if (!draftIds.length) return [];
  // "page:<id>" rows (articles from before autopilot) have no draft, and
  // the id isn't a uuid: never let one into the filter.
  draftIds = draftIds.filter((id) => id && !id.startsWith("page:"));
  if (!draftIds.length) return [];
  const { data } = await db().from("article_drafts").select("id, status, validation, sources").eq("project_id", projectId).in("id", draftIds);
  return (data ?? []) as Array<{ id: string; status: string | null; validation: unknown; sources: unknown }>;
}

function sourcesOf(raw: unknown): Source[] {
  return (Array.isArray(raw) ? (raw as Array<{ url?: string; title?: string }>) : [])
    .map((s) => ({ url: String(s.url ?? ""), title: s.title ? String(s.title) : null }))
    .filter((s) => /^https?:\/\//.test(s.url))
    .map((s) => ({ ...s, host: hostOf(s.url) }));
}

/** URLs (normalized) of this site's registered pages that are known not to
 *  load any more. Only pages we track; anything else is unknown, not dead. */
export async function loadGoneUrls(projectId: string): Promise<Set<string>> {
  // Unknown is not dead: a failed read marks nothing gone.
  return new Set(await goneUrlsCached(projectId).catch(() => []));
}

async function loadGoneUrlsRaw(projectId: string): Promise<Set<string>> {
  const { data, error } = await db().from("pages").select("url, live_at, live_checked_at").eq("project_id", projectId);
  if (error) throw new Error(`could not read pages: ${error.message}`);
  const now = Date.now();
  return new Set(
    ((data ?? []) as Array<{ url: string; live_at: string | null; live_checked_at: string | null }>)
      .filter((r) => isKnownGone({ id: r.url, url: r.url, live_at: r.live_at, live_checked_at: r.live_checked_at }, now))
      .map((r) => normalizePageUrl(r.url)),
  );
}

function goneUrlsCached(projectId: string): Promise<string[]> {
  return unstable_cache(async () => [...(await loadGoneUrlsRaw(projectId))], ["gone-urls", projectId], { revalidate: 600, tags: [gscTag(projectId)] })();
}

/** The list's glance facts for every article on screen: one cached read
 *  (the project's dead pages) and one bulk keyword read, nothing per
 *  article. A failed keyword read just leaves the numbers off. */
export async function loadGlances(projectId: string, articles: Pick<AutopilotArticle, "draftId" | "runId" | "createdAt" | "url" | "keyword">[]): Promise<Record<ArticleKey, ArticleGlance>> {
  const [gone, stats] = await Promise.all([
    articles.some((a) => a.url) ? loadGoneUrls(projectId) : Promise.resolve(new Set<string>()),
    keywordStatsBulk(projectId, articles.map((a) => a.keyword)).catch(() => new Map<string, KeywordStats>()),
  ]);
  const out: Record<ArticleKey, ArticleGlance> = {};
  for (const a of articles) {
    const s = a.keyword ? stats.get(keywordKey(a.keyword)) : undefined;
    out[keyOf(a)] = { gone: a.url ? gone.has(normalizePageUrl(a.url)) : false, volume: s?.volume ?? null, difficulty: s?.difficulty ?? null };
  }
  return out;
}

/** One article's Google numbers, day by day, oldest first. Cached per page. */
export function loadPageDays(projectId: string, url: string): Promise<PageDay[]> {
  return unstable_cache(() => pageDaysRaw(projectId, url), ["article-page-days", projectId, normalizePageUrl(url)], { revalidate: 600, tags: [gscTag(projectId)] })();
}

async function pageDaysRaw(projectId: string, url: string): Promise<PageDay[]> {
  const key = normalizePageUrl(url);
  const history = await pageHistory(projectId);
  const days: PageDay[] = [];
  let seen = false;
  for (const day of [...history].reverse()) {
    const d = dayFor(day.pages, key);
    // Start the series on the first day Google listed the page: before
    // that it didn't exist on Google, which isn't the same as zero.
    if (!d && !seen) continue;
    seen = true;
    days.push({ date: day.date, clicks: d?.clicks ?? 0, impressions: d?.impressions ?? 0, position: d?.position ?? null });
  }
  return days;
}

/** The research ledger for one draft. */
export async function loadLedger(projectId: string, draftId: string): Promise<Ledger | null> {
  // No draft (in flight) or no ledger at all (written before autopilot).
  if (!draftId || draftId.startsWith("page:")) return null;
  const [row] = await ledgerRows(projectId, [draftId]);
  if (!row) return null;
  const v = (row.validation ?? {}) as {
    score?: number;
    plan?: { angle?: string };
    writer?: { ledger?: Array<{ claim?: string; verdict?: string; source?: number | null }>; overlap?: Array<{ fraction?: number }> };
  };
  const ledger = Array.isArray(v.writer?.ledger) ? v.writer!.ledger! : [];
  const overlap = Array.isArray(v.writer?.overlap) ? v.writer!.overlap!.map((o) => Number(o.fraction ?? 0)) : [];
  const sources = sourcesOf(row.sources);
  // A claim's source is the research sheet's 1-based number, and the draft's
  // sources column is that sheet in order - so look it up by position in the
  // RAW column (sourcesOf drops unusable rows, which would shift indices).
  const raw = Array.isArray(row.sources) ? (row.sources as Array<{ url?: string }>) : [];
  const byUrl = new Map(sources.map((src) => [src.url, src]));
  const checks: Check[] = ledger
    .filter((l) => typeof l.claim === "string" && l.claim.trim())
    .map((l) => {
      const n = typeof l.source === "number" ? l.source : 0;
      const url = n >= 1 ? raw[n - 1]?.url : undefined;
      const verdict = l.verdict === "supports" || l.verdict === "contradicts" ? l.verdict : "says_nothing";
      return { claim: l.claim!, verdict, source: url ? (byUrl.get(String(url)) ?? null) : null };
    });
  return {
    angle: v.plan?.angle ?? null,
    score: typeof v.score === "number" ? v.score : null,
    claims: ledger.length,
    supported: ledger.filter((l) => l.verdict === "supports").length,
    maxOverlap: overlap.length ? Math.max(...overlap) : null,
    sources,
    checks,
    cover: COVER_STATUSES.has(String(row.status ?? "")),
  };
}

/** When each writer step last ran for a run, from the model-call log (the
 *  run row itself only keeps its current stage). Slots map to steps:
 *  extractor = research, planner = plan, writer = write, judge = check. */
export async function loadStepTimes(projectId: string, runId: string | null): Promise<{ started: string | null; research: string | null; plan: string | null; write: string | null; check: string | null }> {
  const empty = { started: null, research: null, plan: null, write: null, check: null };
  if (!runId) return empty;
  const [runRes, callsRes] = await Promise.all([
    db().from("writer_runs").select("created_at").eq("project_id", projectId).eq("id", runId).maybeSingle(),
    db().from("model_calls").select("slot, created_at").eq("project_id", projectId).eq("run_id", runId).order("created_at", { ascending: true }),
  ]);
  const last = (slot: string) => {
    const rows = ((callsRes.data ?? []) as Array<{ slot: string; created_at: string }>).filter((r) => r.slot === slot);
    return rows.length ? rows[rows.length - 1].created_at : null;
  };
  return {
    started: (runRes.data as { created_at?: string } | null)?.created_at ?? null,
    research: last("extractor"),
    plan: last("planner"),
    write: last("writer"),
    check: last("judge"),
  };
}

/** The target keyword's monthly searches and difficulty, as research
 *  measured them: the tracked keyword's row, else the idea it was written
 *  from. Null when neither has the numbers (or a read fails). */
export async function loadKeywordStats(projectId: string, keyword: string | null): Promise<{ volume: number | null; difficulty: number | null } | null> {
  const k = keyword?.trim();
  if (!k) return null;
  // Exact, case-insensitive: ilike with its wildcards escaped.
  const pattern = k.replace(/[\\%_]/g, (c) => `\\${c}`);
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  try {
    const [kw, sug] = await Promise.all([
      db().from("keywords").select("search_volume, keyword_difficulty").eq("project_id", projectId).ilike("keyword", pattern).limit(1).maybeSingle(),
      db()
        .from("suggestions")
        .select("keyword_volume, keyword_difficulty")
        .eq("project_id", projectId)
        .ilike("primary_keyword", pattern)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const a = (kw.data ?? null) as { search_volume: unknown; keyword_difficulty: unknown } | null;
    const b = (sug.data ?? null) as { keyword_volume: unknown; keyword_difficulty: unknown } | null;
    const volume = num(a?.search_volume) ?? num(b?.keyword_volume);
    const difficulty = num(a?.keyword_difficulty) ?? num(b?.keyword_difficulty);
    return volume == null && difficulty == null ? null : { volume, difficulty };
  } catch {
    return null;
  }
}

/** loadKeywordStats, and when research never measured the keyword (pages
 *  the site's coding agent wrote before autopilot), measure it once through
 *  the site's DataForSEO - the same Labs keyword_overview + KD fallback an
 *  owner's suggested topic gets - and keep the numbers on the tracked
 *  keyword's row. The measurement, "unknown" included, is cached a week per
 *  keyword, so a keyword DataForSEO doesn't know isn't paid for on every
 *  view; an error is never cached. No DataForSEO for the site: null. */
export async function keywordStatsFor(project: Project, keyword: string | null): Promise<{ volume: number | null; difficulty: number | null } | null> {
  const stored = await loadKeywordStats(project.id, keyword);
  const k = keyword?.trim().toLowerCase().replace(/\s+/g, " ");
  if (stored || !k) return stored;
  try {
    return await unstable_cache(
      async () => {
        const creds = await credsForProject(project);
        if (!creds) return null;
        const overview = await keywordOverview([k], creds, project.location_code, project.language_code);
        const idea = overview.ideas.find((i) => i.keyword.trim().toLowerCase() === k) ?? overview.ideas[0];
        const volume = typeof idea?.search_volume === "number" ? idea.search_volume : null;
        let difficulty = typeof idea?.keyword_difficulty === "number" ? idea.keyword_difficulty : null;
        if (volume !== null && difficulty === null) {
          const r = await cachedBulkKeywordDifficulty([k], creds, project.location_code, project.language_code);
          difficulty = r.kd.get(k) ?? null;
        }
        if (volume === null && difficulty === null) return null;
        const pattern = k.replace(/[\\%_]/g, (c) => `\\${c}`);
        await db().from("keywords").update({ search_volume: volume, keyword_difficulty: difficulty }).eq("project_id", project.id).ilike("keyword", pattern);
        return { volume, difficulty };
      },
      ["article-keyword-measure", project.id, k],
      { revalidate: 7 * 86_400 },
    )();
  } catch (e) {
    console.warn(`[article] could not measure "${k}" for ${project.slug}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
