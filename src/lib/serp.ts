// The SERP provider layer - the single place that answers "how does this
// project check live Google results". Three keyword_source modes:
//
//   'dataforseo'  paid, per-project creds (dataforseo.ts) - daily rank checks
//   'serpapi'     free BYO key (250 searches/mo on SerpApi's free tier) -
//                 WEEKLY rank checks so ~60 tracked keywords fit the free quota
//   'gsc'         no SERP provider at all - positions come from Search Console
//                 (see gscQueryPositions in gsc.ts), live SERP checks disabled
//
// Callers ask serpProviderForProject() for a provider and treat null as "skip
// live SERP features gracefully" - the same tolerance posture as
// credsForProject. Nothing here is ever imported into client components.

import {
  credsForProject,
  serpOrganic,
  type AiOverviewData,
  type DataforseoCreds,
  type OrganicResult,
  type SerpRank,
} from "./dataforseo";
import { decryptSecret } from "./crypto";
import type { Project } from "./projects";

export type SerpProvider =
  | { kind: "dataforseo"; creds: DataforseoCreds }
  | { kind: "serpapi"; apiKey: string };

// DataForSEO location_code -> SerpApi gl country code, for the markets a
// project can realistically be set to. Unknown codes fall back to "us" -
// wrong-market results are still far better than no results.
const LOCATION_TO_GL: Record<number, string> = {
  2840: "us",
  2826: "gb",
  2124: "ca",
  2036: "au",
  2276: "de",
  2250: "fr",
  2724: "es",
  2380: "it",
  2528: "nl",
  2376: "il",
  2356: "in",
  2076: "br",
  2616: "pl",
  2752: "se",
};

export async function serpProviderForProject(project: Project): Promise<SerpProvider | null> {
  if (project.keyword_source === "serpapi") {
    if (!project.serpapi_key) return null;
    try {
      return { kind: "serpapi", apiKey: await decryptSecret(project.serpapi_key) };
    } catch (err) {
      console.error(`SerpApi key decrypt failed for project ${project.slug}:`, err);
      return null;
    }
  }
  if (project.keyword_source === "dataforseo") {
    const creds = await credsForProject(project);
    return creds ? { kind: "dataforseo", creds } : null;
  }
  return null; // 'gsc' - Search Console only, no live SERP
}

// SerpApi google engine: one GET returns the full top-100 in a single credit
// (verified mid-2026: SerpApi kept native top-100 after Google removed num=100
// in Sept 2025 - it's exactly why it's the recommended free key). If SerpApi
// ever drops to page-1-only, position null degrades from "not in top 100" to
// "not on page 1" - revisit the quota math before adding pagination.
// organic_results carry 1-based positions.
async function serpapiOrganic(
  keyword: string,
  apiKey: string,
  locationCode: number,
  languageCode: string,
): Promise<{ results: OrganicResult[]; ai: AiOverviewData }> {
  const params = new URLSearchParams({
    engine: "google",
    q: keyword,
    num: "100",
    gl: LOCATION_TO_GL[locationCode] ?? "us",
    hl: languageCode || "en",
    api_key: apiKey,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SerpApi HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    error?: string;
    organic_results?: Array<{ position?: number; title?: string; link?: string; source?: string }>;
    ai_overview?: {
      references?: Array<{ title?: string; link?: string; source?: string }>;
      page_token?: string;
    };
  };
  if (json.error) throw new Error(`SerpApi: ${json.error}`);
  const results = (json.organic_results ?? []).map((r, i) => {
    let domain: string | null = null;
    try {
      domain = r.link ? new URL(r.link).hostname : null;
    } catch {
      domain = null;
    }
    return {
      position: r.position ?? i + 1,
      title: r.title ?? null,
      url: r.link ?? null,
      domain,
    };
  });
  // SerpApi surfaces the AI Overview inline when Google rendered one. A
  // page_token-only overview would need a second (paid) request - we don't
  // spend the quota; it reads as "present, citations unknown".
  let ai: AiOverviewData = { present: false, references: [] };
  if (json.ai_overview) {
    const references = (json.ai_overview.references ?? []).flatMap((r) => {
      try {
        return r.link
          ? [{ domain: new URL(r.link).hostname, url: r.link, title: r.title ?? r.source ?? null }]
          : [];
      } catch {
        return [];
      }
    });
    ai = { present: true, references };
  }
  return { results, ai };
}

// Provider-agnostic: the organic results for a keyword, top-down, plus the
// AI Overview citation state when this call happened to carry it. SerpApi
// includes the overview inline at no extra credit; DataForSEO's regular
// endpoint never returns it (ai: null = "not measured on this call" - the
// daily cron makes the separate cheap serpAiOverview call instead).
export async function providerOrganic(
  provider: SerpProvider,
  keyword: string,
  locationCode: number,
  languageCode: string,
): Promise<{ results: OrganicResult[]; ai: AiOverviewData }> {
  if (provider.kind === "dataforseo") {
    const { results } = await serpOrganic(keyword, provider.creds, locationCode, languageCode);
    return { results, ai: null };
  }
  return serpapiOrganic(keyword, provider.apiKey, locationCode, languageCode);
}

// Provider-agnostic rank check: the target domain's best position, or null if
// absent from the results. Mirrors dataforseo.ts serpRank.
export async function providerRank(
  provider: SerpProvider,
  keyword: string,
  targetDomain: string,
  locationCode: number,
  languageCode: string,
): Promise<SerpRank & { ai: AiOverviewData }> {
  const { results, ai } = await providerOrganic(provider, keyword, locationCode, languageCode);
  const norm = (d?: string | null) => (d ?? "").replace(/^www\./, "").toLowerCase();
  const target = norm(targetDomain);
  // Exact domain or a real subdomain - a bare endsWith would let
  // "notclockedcode.com" match "clockedcode.com".
  const isTarget = (d: string) => d === target || d.endsWith(`.${target}`);
  let best: { position: number; url: string | null } | null = null;
  for (const it of results) {
    if (isTarget(norm(it.domain))) {
      if (!best || it.position < best.position) best = { position: it.position, url: it.url };
    }
  }
  return { keyword, position: best?.position ?? null, url: best?.url ?? null, cost: 0, ai };
}

// Live key check against SerpApi's account endpoint - free, burns no search
// credits. Returns the remaining monthly searches so the UI can show it.
export async function validateSerpapiKey(
  apiKey: string,
): Promise<{ ok: true; searchesLeft: number | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "SerpApi rejected this key. Copy it from serpapi.com/manage-api-key." };
    }
    if (!res.ok) return { ok: false, error: `SerpApi answered HTTP ${res.status} - try again.` };
    const json = (await res.json()) as { error?: string; total_searches_left?: number };
    if (json.error) return { ok: false, error: `SerpApi: ${json.error}` };
    return { ok: true, searchesLeft: json.total_searches_left ?? null };
  } catch {
    return { ok: false, error: "Could not reach SerpApi - try again." };
  }
}
