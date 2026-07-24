// Minimal DataForSEO REST wrapper. Only the endpoints the crons use:
// - SERP Google organic (live) for rank tracking
// - Labs keyword_ideas + related_keywords for opportunity discovery
// - Backlinks summary for Domain Rating
// Auth is HTTP Basic with login (account email) + API password, PER PROJECT
// (free-tier DIY: each project brings its own DataForSEO account, so every
// call bills the project owner). credsForProject resolves a project's
// credentials; only the default project falls back to the env pair. A third
// branch (cloud only) resolves DATAFORSEO_PLATFORM_LOGIN/PASSWORD for paid
// projects with no account of their own - see the billedTo field below and
// dataforseo-usage.ts, which meters that spend. Those platform credentials
// are server-side only: never written to a customer repo, never returned to
// a client. We do NOT proxy or meter BYO DataForSEO here - the crons call it
// directly, the agent uses DataForSEO's own MCP for ad-hoc research.

import { DEFAULT_PROJECT_ID } from "./projects";
import { decryptSecret } from "./crypto";
import { isCloudMode } from "./cloud";
import { planGate } from "./billing";
import { platformBudgetGate, platformDataforseoEnv, recordDataforseoUsage } from "./dataforseo-usage";

const BASE = "https://api.dataforseo.com/v3";

// Default market: United States, English. Rank tracking passes each
// project's own location/language; the Labs helpers below still use the
// defaults (only the retired weekly cron calls them).
const LOCATION_CODE = 2840;
const LANGUAGE_CODE = "en";

export type DataforseoCreds = {
  login: string;
  password: string;
  // "own" = the project's (or the instance's default-project env fallback's)
  // own DataForSEO account - never metered here. "platform" = this backend's
  // bundled account, billed to a paid cloud project with no account of its
  // own; meterProjectId is who to charge (see the postOnce hook below and
  // dataforseo-usage.ts).
  billedTo: "own" | "platform";
  meterProjectId?: string;
};

// A project's DataForSEO identity. Explicit-creds first, then (default
// project only) the instance env fallback - both billed "own". Only then,
// for CLOUD_MODE paid projects still without an account, the platform
// credentials - gated by plan coverage and this month's shared budget so a
// free-tier or over-budget project still gets null and skips the paid
// features gracefully, exactly like before.
export async function credsForProject(project: {
  id: string;
  slug: string;
  dataforseo_login: string | null;
  dataforseo_password: string | null;
}): Promise<DataforseoCreds | null> {
  if (project.dataforseo_login && project.dataforseo_password) {
    // The password is stored encrypted at rest; the login (an email) is not.
    // A missing/rotated key must not 500 the dashboard or a cron, so a decrypt
    // failure degrades to "not connected" - the paid features just skip.
    try {
      return {
        login: project.dataforseo_login,
        password: await decryptSecret(project.dataforseo_password),
        billedTo: "own",
      };
    } catch (err) {
      console.error(`DataForSEO password decrypt failed for project ${project.slug}:`, err);
      return null;
    }
  }
  if (
    // Default project id - and match hasDataforseo() on the id, NOT the slug.
    // Self-host reuses the default project row under a RENAMED slug, so
    // `slug === "clockedcode"` never fired on self-host and left env DataForSEO
    // (DATAFORSEO_LOGIN/PASSWORD, as .env.docker.example documents) silently
    // dead - rank tracking / keyword ideas / Domain Rating all skipped, and
    // get_project's dataforseo_repo_mcp (id-based) contradicted its own
    // dataforseo_connected (slug-based) in one call (2026-07-24).
    project.id === DEFAULT_PROJECT_ID &&
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
  ) {
    return { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD, billedTo: "own" };
  }
  // Bundled cloud DataForSEO. These credentials are server-side ONLY: never
  // written into a customer repo's secrets (the pipeline pack's dataforseo
  // block only ships for hasDataforseo() projects, see pipeline-pack.ts) and
  // never returned to a client - every consumer of this return value runs on
  // the server. platformDataforseoEnv resolves a dedicated DATAFORSEO_PLATFORM_*
  // pair, else falls back to the base DATAFORSEO_* account (one funded account
  // can serve every tenant - no second env pair to maintain).
  const platform = platformDataforseoEnv();
  if (
    isCloudMode() &&
    platform &&
    (await planGate(project.id)).allowed &&
    (await platformBudgetGate(project.id)).allowed
  ) {
    return {
      login: platform.login,
      password: platform.password,
      billedTo: "platform",
      meterProjectId: project.id,
    };
  }
  return null;
}

function authHeader(creds: DataforseoCreds): string {
  return "Basic " + Buffer.from(`${creds.login}:${creds.password}`).toString("base64");
}

// Vendor failures come in two kinds and must not be treated alike. Transient:
// DataForSEO's upstream search-engine fetch broke (task 40101 "Internal SE
// Server Error" - the 2026-07-21 morning email), their API had an internal
// error (task/top-level 50xxx), the HTTP layer 5xx'd, or the network dropped.
// Their documented remedy is "retry the task", and failed tasks are not
// billed, so post() retries these in-call before giving up. Fatal: bad creds,
// negative balance, malformed request - retrying cannot help, throw at once.
// Errors that survive the retries carry TRANSIENT_MARKER in their message so
// cron-alerts can require two consecutive failed runs before emailing (the
// banner still shows the first one) - a one-off vendor blip must not wake the
// owner, a sustained outage must.
export const TRANSIENT_MARKER = "[transient]";

export function isTransientErrorMessage(message: string): boolean {
  return message.includes(TRANSIENT_MARKER);
}

class DataforseoError extends Error {
  readonly transient: boolean;
  constructor(message: string, transient: boolean) {
    super(transient ? `${message} ${TRANSIENT_MARKER}` : message);
    this.transient = transient;
  }
}

const TRANSIENT_TASK_CODES = new Set([40101]); // Internal SE Server Error

// Backoff kept short on purpose: daily-ranks chains two ~6s live calls per
// keyword inside a 60s function budget, so the retries must fit alongside
// the calls themselves, not double the wall clock.
const RETRY_DELAYS_MS = [1000, 3000];

async function post<T = unknown>(
  path: string,
  tasks: unknown[],
  creds: DataforseoCreds,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postOnce<T>(path, tasks, creds);
    } catch (e) {
      const transient = e instanceof DataforseoError && e.transient;
      if (!transient || attempt >= RETRY_DELAYS_MS.length) throw e;
      console.warn(
        `[dataforseo] transient ${path} failure (attempt ${attempt + 1} of ${RETRY_DELAYS_MS.length + 1}), retrying:`,
        e instanceof Error ? e.message : e,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function postOnce<T = unknown>(
  path: string,
  tasks: unknown[],
  creds: DataforseoCreds,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tasks),
      // A hung call previously ate the whole 60s function budget and killed
      // the project's entire run with it; cap it so it becomes a retryable
      // failure instead. Live SERP calls typically answer in ~6s.
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    throw new DataforseoError(
      `DataForSEO ${path} network error: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new DataforseoError(
      `DataForSEO ${path} HTTP ${res.status}: ${body.slice(0, 300)}`,
      res.status >= 500,
    );
  }
  const json = (await res.json()) as {
    status_code: number;
    status_message: string;
    cost: number;
    tasks?: Array<{ status_code: number; status_message: string; result?: unknown }>;
  };
  // Top-level 20000 = ok. Task-level errors surface per task below.
  if (json.status_code !== 20000) {
    throw new DataforseoError(
      `DataForSEO ${path} error ${json.status_code}: ${json.status_message}`,
      json.status_code >= 50000,
    );
  }
  // Task-level failures (40xxx: negative balance, rate limit, bad request)
  // arrive wrapped in an overall-OK envelope. Before this check, every
  // caller read a failed task's missing result as legitimate empty data -
  // an exhausted account looked like "keyword fell out of the top 100" and
  // "0 keyword ideas" instead of an error. Fabricated data is worse than a
  // loud failure: throw, so crons report it and the dashboard shows it.
  const task = json.tasks?.[0];
  if (task && task.status_code >= 40000) {
    throw new DataforseoError(
      `DataForSEO ${path} task error ${task.status_code}: ${task.status_message}`,
      TRANSIENT_TASK_CODES.has(task.status_code) || task.status_code >= 50000,
    );
  }
  // Meter platform-billed spend against the owner's monthly budget. This is
  // the single HTTP chokepoint every caller goes through - including
  // serpOrganic's depth-ladder, which calls postOnce directly and bypasses
  // post() - so hooking here (not post()) catches every real paid call
  // exactly once. Fire-and-forget: a ledger failure must never fail or slow
  // down the call it's recording.
  if (creds.billedTo === "platform" && creds.meterProjectId) {
    recordDataforseoUsage(creds.meterProjectId, path, json.cost).catch(console.error);
  }
  return json as T;
}

export type SerpRank = {
  keyword: string;
  position: number | null; // absolute rank of the target domain, null if not found in results
  url: string | null;
  cost: number;
};

export type OrganicResult = {
  position: number;
  title: string | null;
  url: string | null;
  domain: string | null;
};

// Google AI Overview state for a SERP: was one shown, and who did it cite?
// null = the provider/mode cannot tell (e.g. GSC mode), distinct from
// {present: false} which is a real "no AI answer for this query".
export type AiOverviewData = {
  present: boolean;
  references: Array<{ domain: string; url: string | null; title: string | null }>;
} | null;

type SerpItem = {
  type: string;
  rank_absolute?: number;
  title?: string;
  domain?: string;
  url?: string;
  references?: Array<{ domain?: string; url?: string; title?: string; source?: string }>;
  items?: Array<{
    references?: Array<{ domain?: string; url?: string; title?: string; source?: string }>;
  }>;
};

// AI Overview references can sit on the ai_overview item itself or on its
// nested elements; collect both, dedupe by url-or-domain. Shape verified
// against a live advanced-endpoint response 2026-07-17.
function parseAiOverview(items: SerpItem[]): NonNullable<AiOverviewData> {
  const overview = items.find((it) => it.type === "ai_overview");
  if (!overview) return { present: false, references: [] };
  const raw = [
    ...(overview.references ?? []),
    ...(overview.items ?? []).flatMap((el) => el.references ?? []),
  ];
  const seen = new Set<string>();
  const references: NonNullable<AiOverviewData>["references"] = [];
  for (const r of raw) {
    const domain = r.domain ?? (r.url ? safeHostname(r.url) : null);
    if (!domain) continue;
    const key = r.url ?? domain;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ domain, url: r.url ?? null, title: r.title ?? r.source ?? null });
  }
  return { present: true, references };
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const SERP_REGULAR_PATH = "/serp/google/organic/live/regular";

type SerpRegularJson = {
  cost: number;
  tasks: Array<{
    result?: Array<{
      items?: SerpItem[];
    }>;
  }>;
};

// Depth ladder for the rank check: 40101 correlates with paginating past
// Google's real last page - an ultra-niche query with only a page or two of
// results makes the deep fetch fail near-deterministically, not as a one-off
// blip (verified live 2026-07-21: one sparse query failed 6/6 at depth 100
// across ~10 minutes while depths 10 and 30 succeeded). So a second depth-100
// try covers pure blips, then the depth steps down: a query that only fails
// deep has few results, so the shallow fetch is the whole SERP and the rank
// check loses nothing. Single attempt per rung with a short fixed pause
// (postOnce, not post - post's own backoff ladder on top of this one pushed
// the slowest keyword chains past the function budget and 504'd the run).
const SERP_DEPTH_LADDER = [100, 100, 30, 10];
const SERP_LADDER_PAUSE_MS = 1000;

// One live SERP call: the organic results for a keyword, top-down. Shared by
// rank tracking (find the target domain) and the check_serp MCP tool (show the
// agent who's on page 1). Stays on the REGULAR endpoint: DataForSEO bills per
// 10 results, so depth 100 here is $0.006 - the advanced endpoint (the only
// one that returns ai_overview) would be $0.02 for the same depth. AI
// Overview checks therefore live in serpAiOverview below, a separate
// depth-10 advanced call at $0.002. On a transient failure the depth steps
// down (see SERP_DEPTH_LADDER) - a rank from a shallow rescue means "position
// within the fallback depth", which for the sparse queries that trigger it is
// the full SERP anyway.
export async function serpOrganic(
  keyword: string,
  creds: DataforseoCreds,
  locationCode: number = LOCATION_CODE,
  languageCode: string = LANGUAGE_CODE,
): Promise<{ results: OrganicResult[]; cost: number }> {
  const task = { keyword, location_code: locationCode, language_code: languageCode };
  let json: SerpRegularJson | null = null;
  for (let i = 0; json === null; i++) {
    try {
      json = await postOnce<SerpRegularJson>(
        SERP_REGULAR_PATH,
        [{ ...task, depth: SERP_DEPTH_LADDER[i] }],
        creds,
      );
    } catch (e) {
      const transient = e instanceof DataforseoError && e.transient;
      if (!transient || i >= SERP_DEPTH_LADDER.length - 1) throw e;
      console.warn(
        `[dataforseo] SERP fetch at depth ${SERP_DEPTH_LADDER[i]} failed transiently for ${JSON.stringify(keyword)}, trying depth ${SERP_DEPTH_LADDER[i + 1]}:`,
        e instanceof Error ? e.message : e,
      );
      await new Promise((r) => setTimeout(r, SERP_LADDER_PAUSE_MS));
    }
  }

  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  const results = items
    .filter((it) => it.type === "organic")
    .map((it) => ({
      position: it.rank_absolute ?? 0,
      title: it.title ?? null,
      url: it.url ?? null,
      domain: it.domain ?? null,
    }))
    .filter((it) => it.position > 0);
  return { results, cost: json.cost };
}

// Google's AI Overview for a keyword: one depth-10 advanced call ($0.002,
// verified live 2026-07-17 - the overview renders at the top of the page, so
// depth 10 always captures it; load_async_ai_overview matters because real
// SERPs render the overview asynchronously and the response omits it without
// the flag). Billed to the project's own account, like every SERP call.
export async function serpAiOverview(
  keyword: string,
  creds: DataforseoCreds,
  locationCode: number = LOCATION_CODE,
  languageCode: string = LANGUAGE_CODE,
): Promise<{ ai: NonNullable<AiOverviewData>; cost: number }> {
  const json = await post<{
    cost: number;
    tasks: Array<{
      result?: Array<{
        items?: SerpItem[];
      }>;
    }>;
  }>("/serp/google/organic/live/advanced", [
    {
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      depth: 10,
      load_async_ai_overview: true,
    },
  ], creds);
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return { ai: parseAiOverview(items), cost: json.cost };
}

// One live SERP call per keyword. Returns the target domain's best (lowest)
// absolute position among organic results, or null if not present.
export async function serpRank(
  keyword: string,
  targetDomain: string,
  creds: DataforseoCreds,
  locationCode: number = LOCATION_CODE,
  languageCode: string = LANGUAGE_CODE,
): Promise<SerpRank> {
  const { results, cost } = await serpOrganic(keyword, creds, locationCode, languageCode);
  const norm = (d?: string | null) => (d ?? "").replace(/^www\./, "").toLowerCase();
  const target = norm(targetDomain);
  // Exact domain or a real subdomain - a bare endsWith would let
  // "notclockedcode.com" match "clockedcode.com".
  const isTarget = (d: string) => d === target || d.endsWith(`.${target}`);
  let best: { position: number; url: string | null } | null = null;
  for (const it of results) {
    if (isTarget(norm(it.domain))) {
      if (!best || it.position < best.position) {
        best = { position: it.position, url: it.url };
      }
    }
  }
  return {
    keyword,
    position: best?.position ?? null,
    url: best?.url ?? null,
    cost,
  };
}

export type KeywordIdea = {
  keyword: string;
  search_volume: number | null;
  keyword_difficulty: number | null;
  cpc: number | null;
  competition: number | null;
};

function mapLabsItems(items: unknown[]): KeywordIdea[] {
  return (items as Array<{
    keyword?: string;
    keyword_data?: {
      keyword?: string;
      keyword_info?: { search_volume?: number; cpc?: number; competition?: number };
      keyword_properties?: { keyword_difficulty?: number };
    };
    keyword_info?: { search_volume?: number; cpc?: number; competition?: number };
    keyword_properties?: { keyword_difficulty?: number };
  }>).map((it) => {
    // related_keywords nests under keyword_data; keyword_ideas is flat.
    const kd = it.keyword_data ?? it;
    const kw = it.keyword ?? it.keyword_data?.keyword ?? kd.keyword ?? "";
    const info = kd.keyword_info ?? it.keyword_info;
    const props = kd.keyword_properties ?? it.keyword_properties;
    return {
      keyword: kw,
      search_volume: info?.search_volume ?? null,
      keyword_difficulty: props?.keyword_difficulty ?? null,
      cpc: info?.cpc ?? null,
      competition: info?.competition ?? null,
    };
  });
}

// Labs keyword_ideas: keywords semantically related to the seeds.
export async function keywordIdeas(
  seeds: string[],
  creds: DataforseoCreds,
  limit = 100,
): Promise<{ ideas: KeywordIdea[]; cost: number }> {
  const json = await post<{
    cost: number;
    tasks: Array<{ result?: Array<{ items?: unknown[] }> }>;
  }>("/dataforseo_labs/google/keyword_ideas/live", [
    {
      keywords: seeds,
      location_code: LOCATION_CODE,
      language_code: LANGUAGE_CODE,
      limit,
    },
  ], creds);
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return { ideas: mapLabsItems(items), cost: json.cost };
}

// Labs related_keywords: the "searches related to" graph around one seed.
export async function relatedKeywords(
  seed: string,
  creds: DataforseoCreds,
  limit = 100,
): Promise<{ ideas: KeywordIdea[]; cost: number }> {
  const json = await post<{
    cost: number;
    tasks: Array<{ result?: Array<{ items?: unknown[] }> }>;
  }>("/dataforseo_labs/google/related_keywords/live", [
    {
      keyword: seed,
      location_code: LOCATION_CODE,
      language_code: LANGUAGE_CODE,
      limit,
    },
  ], creds);
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return { ideas: mapLabsItems(items), cost: json.cost };
}

export type BacklinksSummary = {
  // DataForSEO's Ahrefs-DR-equivalent, 0-1000. Divide by 10 for a 0-100 DR.
  rank: number | null;
  backlinks: number | null;
  referring_domains: number | null;
  referring_main_domains: number | null;
  spam_score: number | null; // 0-100
  cost: number;
};

// Backlinks summary for a domain - the source of the dashboard's Domain Rating.
// This is a pricier endpoint than SERP/Labs, so callers MUST cache it (see
// src/lib/domain-rating.ts, which wraps this in a 24h cache). A null result =
// the domain has no backlink profile indexed yet = effectively DR 0.
export async function backlinksSummary(
  target: string,
  creds: DataforseoCreds,
): Promise<BacklinksSummary> {
  const json = await post<{
    cost: number;
    tasks: Array<{
      result?: Array<{
        rank?: number;
        backlinks?: number;
        referring_domains?: number;
        referring_main_domains?: number;
        backlinks_spam_score?: number;
      }>;
    }>;
  }>("/backlinks/summary/live", [
    {
      target,
      internal_list_limit: 10,
      backlinks_status_type: "live",
      include_subdomains: true,
    },
  ], creds);
  const r = json.tasks?.[0]?.result?.[0];
  // The call SUCCEEDED (post() throws on any non-20000 status), so reaching here
  // with no result means DataForSEO's backlink index simply has nothing for this
  // target yet (a new domain). That is a real "zero authority" answer - DR 0,
  // 0 referring domains, 0 backlinks - NOT missing/unavailable data. Only a
  // thrown error (caught in domain-rating.ts) should read as "-".
  if (!r) {
    return {
      rank: 0,
      backlinks: 0,
      referring_domains: 0,
      referring_main_domains: 0,
      spam_score: null,
      cost: json.cost,
    };
  }
  return {
    rank: r.rank ?? 0,
    backlinks: r.backlinks ?? 0,
    referring_domains: r.referring_domains ?? 0,
    referring_main_domains: r.referring_main_domains ?? 0,
    spam_score: r.backlinks_spam_score ?? null,
    cost: json.cost,
  };
}
