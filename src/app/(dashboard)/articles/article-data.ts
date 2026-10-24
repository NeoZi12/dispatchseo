import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { gscTag } from "@/lib/autopilot/report";
import { normalizePageUrl, type GscPageStat } from "@/lib/metrics";
import { isKnownGone } from "@/lib/page-liveness";
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

/** What the list's expand panel shows for one article. */
export type ArticleGlance = {
  /** Position on the newest day Google listed the page. */
  now: number | null;
  /** Best daily position ever seen, and the day. */
  best: { position: number; date: string } | null;
  sources: Source[];
  /** The page is known not to load any more (isKnownGone). */
  gone: boolean;
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

// The cover route's own allowlist (src/app/api/cover/[draftId]/route.tsx).
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

type UrlSummary = Record<string, { now: number | null; best: { position: number; date: string } | null }>;

/** Each URL's position on the newest day Google listed it, and its best
 *  day, for every page in the history. */
function urlSummaries(projectId: string): Promise<UrlSummary> {
  return unstable_cache(
    async () => {
      const out: UrlSummary = {};
      for (const day of await pageHistory(projectId)) {
        const seen = new Set<string>();
        for (const p of day.pages) {
          const key = normalizePageUrl(p.page);
          if (seen.has(key)) continue;
          seen.add(key);
          const d = dayFor(day.pages, key);
          if (!d || d.position == null) continue;
          const u = (out[key] ??= { now: null, best: null });
          if (u.now == null) u.now = d.position; // history is newest first
          if (!u.best || d.position < u.best.position) u.best = { position: d.position, date: day.date };
        }
      }
      return out;
    },
    ["article-url-summaries", projectId],
    { revalidate: 600, tags: [gscTag(projectId)] },
  )();
}

function goneUrlsCached(projectId: string): Promise<string[]> {
  return unstable_cache(async () => [...(await loadGoneUrlsRaw(projectId))], ["gone-urls", projectId], { revalidate: 600, tags: [gscTag(projectId)] })();
}

/** Only the sources column - the validation JSON beside it is the heavy part
 *  and the list never shows it. */
async function sourceRows(projectId: string, draftIds: string[]) {
  // "page:<id>" rows (articles from before autopilot) have no draft.
  draftIds = draftIds.filter((id) => !id.startsWith("page:"));
  if (!draftIds.length) return [];
  const { data } = await db().from("article_drafts").select("id, sources").eq("project_id", projectId).in("id", draftIds);
  return (data ?? []) as Array<{ id: string; sources: unknown }>;
}

/** The list's glance facts for every article on screen. */
export async function loadGlances(projectId: string, articles: AutopilotArticle[]): Promise<Record<ArticleKey, ArticleGlance>> {
  const live = articles.filter((a) => a.url);
  const [summary, rows, gone] = await Promise.all([
    live.length ? urlSummaries(projectId).catch(() => ({}) as UrlSummary) : Promise.resolve({} as UrlSummary),
    sourceRows(projectId, articles.map((a) => a.draftId).filter(Boolean)),
    live.length ? loadGoneUrls(projectId) : Promise.resolve(new Set<string>()),
  ]);
  const sources = new Map(rows.map((r) => [r.id, sourcesOf(r.sources)]));
  const out: Record<ArticleKey, ArticleGlance> = {};
  for (const a of articles) {
    const u = a.url ? summary[normalizePageUrl(a.url)] : undefined;
    const now = u?.now ?? null;
    const best = u?.best ?? null;
    out[keyOf(a)] = { now, best, sources: sources.get(a.draftId) ?? [], gone: a.url ? gone.has(normalizePageUrl(a.url)) : false };
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
