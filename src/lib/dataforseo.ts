// Minimal DataForSEO REST wrapper. Only the endpoints the crons use:
// - SERP Google organic (live) for rank tracking
// - Labs keyword_ideas + related_keywords for opportunity discovery
// - Backlinks summary for Domain Rating
// Auth is HTTP Basic with login (account email) + API password, PER PROJECT
// (free-tier DIY: each project brings its own DataForSEO account, so every
// call bills the project owner). credsForProject resolves a project's
// credentials; only the default project falls back to the env pair. We do NOT
// proxy or meter DataForSEO here - the crons call it directly, the agent uses
// DataForSEO's own MCP for ad-hoc research.

import { DEFAULT_PROJECT_SLUG } from "./projects";
import { decryptSecret } from "./crypto";

const BASE = "https://api.dataforseo.com/v3";

// Default market: United States, English. Rank tracking passes each
// project's own location/language; the Labs helpers below still use the
// defaults (only the retired weekly cron calls them).
const LOCATION_CODE = 2840;
const LANGUAGE_CODE = "en";

export type DataforseoCreds = { login: string; password: string };

// A project's DataForSEO identity. Explicit-creds first; ONLY the default
// project may ride the platform env credentials - a free-tier project without
// its own account gets null, and callers skip the paid features gracefully.
export function credsForProject(project: {
  slug: string;
  dataforseo_login: string | null;
  dataforseo_password: string | null;
}): DataforseoCreds | null {
  if (project.dataforseo_login && project.dataforseo_password) {
    // The password is stored encrypted at rest; the login (an email) is not.
    // A missing/rotated key must not 500 the dashboard or a cron, so a decrypt
    // failure degrades to "not connected" - the paid features just skip.
    try {
      return { login: project.dataforseo_login, password: decryptSecret(project.dataforseo_password) };
    } catch (err) {
      console.error(`DataForSEO password decrypt failed for project ${project.slug}:`, err);
      return null;
    }
  }
  if (
    project.slug === DEFAULT_PROJECT_SLUG &&
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD
  ) {
    return { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD };
  }
  return null;
}

function authHeader(creds: DataforseoCreds): string {
  return "Basic " + Buffer.from(`${creds.login}:${creds.password}`).toString("base64");
}

async function post<T = unknown>(
  path: string,
  tasks: unknown[],
  creds: DataforseoCreds,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tasks),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DataForSEO ${path} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    status_code: number;
    status_message: string;
    cost: number;
    tasks?: Array<{ status_code: number; status_message: string; result?: unknown }>;
  };
  // Top-level 20000 = ok. Task-level errors surface per task below.
  if (json.status_code !== 20000) {
    throw new Error(`DataForSEO ${path} error ${json.status_code}: ${json.status_message}`);
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

// One live SERP call: the organic results for a keyword, top-down. Shared by
// rank tracking (find the target domain) and the check_serp MCP tool (show the
// agent who's on page 1). Stays on the REGULAR endpoint: DataForSEO bills per
// 10 results, so depth 100 here is $0.006 - the advanced endpoint (the only
// one that returns ai_overview) would be $0.02 for the same depth. AI
// Overview checks therefore live in serpAiOverview below, a separate
// depth-10 advanced call at $0.002.
export async function serpOrganic(
  keyword: string,
  creds: DataforseoCreds,
  locationCode: number = LOCATION_CODE,
  languageCode: string = LANGUAGE_CODE,
): Promise<{ results: OrganicResult[]; cost: number }> {
  const json = await post<{
    cost: number;
    tasks: Array<{
      result?: Array<{
        items?: SerpItem[];
      }>;
    }>;
  }>("/serp/google/organic/live/regular", [
    {
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      depth: 100,
    },
  ], creds);

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
