import { db } from "./db";
import { windows, type Range } from "./owner-analytics";

// The two "outside world" panels of /owner:
//   - AI: which AI crawlers read dispatchseo.com, which read it live because a
//     person asked an assistant something, which pages they read, the people
//     AI answers sent over, and the citation checks stored in ai_snapshots.
//   - Google: Search Console clicks and impressions for every site, the
//     product's own site day by day, and the queries it is found for.
// Both read our own tables only.

const DAY = 86_400_000;
const ISO = (t: number) => new Date(t).toISOString();

export type BotClass = "live" | "ai-search" | "training" | "search" | "seo" | "social" | "other";

export const BOT_CLASS_LABEL: Record<BotClass, string> = {
  live: "Read for a person",
  "ai-search": "AI search index",
  training: "AI training",
  search: "Search engines",
  seo: "SEO tools",
  social: "Link previews",
  other: "Scripts and other",
};

const TRAINING = new Set(["GPTBot (OpenAI)", "ClaudeBot", "Common Crawl", "Bytespider (TikTok)", "Meta AI", "Amazonbot", "Cohere", "Diffbot", "Google Vertex AI"]);
const SEARCH = new Set(["Googlebot", "Google Ads", "Bingbot", "Applebot", "DuckDuckGo", "Yandex", "Baidu", "PetalBot"]);
const SEO = new Set(["Ahrefs", "Semrush", "DataForSEO", "Majestic", "Moz"]);
const SOCIAL = new Set(["X / Twitter", "LinkedIn", "Slack", "Discord", "Telegram", "WhatsApp", "Facebook"]);

export function botClass(name: string): BotClass {
  if (/ user$/i.test(name)) return "live";
  if (/ search$/i.test(name) || /^Exa(Search)?Bot$/i.test(name)) return "ai-search";
  if (TRAINING.has(name)) return "training";
  if (SEARCH.has(name)) return "search";
  if (SEO.has(name)) return "seo";
  if (SOCIAL.has(name)) return "social";
  return "other";
}

export function isAi(c: BotClass): boolean {
  return c === "live" || c === "ai-search" || c === "training";
}

// Referrer hosts that are AI assistants: a visit from one is a person who
// clicked a link in an AI answer.
const AI_REFERRERS: Array<[RegExp, string]> = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/, "Gemini"],
  [/(^|\.)copilot\.microsoft\.com$/, "Copilot"],
  [/(^|\.)you\.com$/, "You.com"],
  [/(^|\.)phind\.com$/, "Phind"],
  [/(^|\.)deepseek\.com$/, "DeepSeek"],
  [/(^|\.)grok\.com$/, "Grok"],
];

export function aiReferrer(host: string): string | null {
  for (const [re, name] of AI_REFERRERS) if (re.test(host)) return name;
  return null;
}

export type AiReport = {
  days: string[];
  /** Per day, aligned with days. */
  live: number[];
  aiSearch: number[];
  training: number[];
  /** llms.txt / llms-full.txt reads by AI crawlers per day. */
  llms: number[];
  totals: Record<BotClass, number>;
  bots: Array<{ name: string; cls: BotClass; hits: number }>;
  /** Pages AI crawlers read most (all three AI classes). */
  pages: Array<{ path: string; hits: number }>;
  /** Latest AI reads, newest first. */
  feed: Array<{ at: string; bot: string; cls: BotClass; path: string }>;
  /** llms.txt / llms-full.txt reads by AI crawlers. */
  llmsReads: number;
  referrals: Array<{ name: string; visits: number }>;
  citations: {
    checks: number;
    cited: number;
    byEngine: Array<{ engine: string; checks: number; cited: number }>;
    latest: Array<{ at: string; engine: string; query: string; url: string | null }>;
  } | null;
  /** First crawler row on record: how far back these numbers go. */
  since: string | null;
};

export async function aiReport(range: Range, productProjectId: string | null, now = Date.now()): Promise<AiReport> {
  const w = windows(range, now);
  const [daily, feedRes, firstRes, refRes, citeRes] = await Promise.all([
    db().rpc("owner_bots_daily", { p_from: ISO(w.from), p_to: ISO(w.to) }),
    db()
      .from("web_visits")
      .select("at, bot_name, path")
      .eq("bot", true)
      .eq("kind", "server")
      .in("area", ["site", "file"])
      .gte("at", ISO(w.from))
      .order("at", { ascending: false })
      .limit(1500),
    db().from("web_visits").select("at").eq("bot", true).order("at", { ascending: true }).limit(1),
    db().rpc("owner_visits_top", { p_from: ISO(w.from), p_to: ISO(w.to), p_area: "site", p_dim: "referrer", p_bots: false, p_limit: 200 }),
    productProjectId
      ? db()
          .from("ai_snapshots")
          .select("engine, query, cited, cited_url, checked_at")
          .eq("project_id", productProjectId)
          .gte("checked_at", ISO(w.from))
          .order("checked_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (daily.error) throw daily.error;

  const days: string[] = [];
  for (let t = w.from; t < w.to; t += DAY) days.push(ISO(t).slice(0, 10));
  const idx = new Map(days.map((d, i) => [d, i]));
  const live = days.map(() => 0);
  const aiSearch = days.map(() => 0);
  const training = days.map(() => 0);
  const llms = days.map(() => 0);
  const totals: Record<BotClass, number> = { live: 0, "ai-search": 0, training: 0, search: 0, seo: 0, social: 0, other: 0 };
  const byBot = new Map<string, number>();
  let llmsReads = 0;
  for (const r of (daily.data ?? []) as Array<{ day: string; bot_name: string; area: string; hits: number }>) {
    const name = r.bot_name || "unknown";
    const cls = botClass(name);
    const hits = Number(r.hits) || 0;
    totals[cls] += hits;
    byBot.set(name, (byBot.get(name) ?? 0) + hits);
    if (r.area === "file" && isAi(cls)) llmsReads += hits;
    const i = idx.get(String(r.day));
    if (i == null) continue;
    if (r.area === "file" && isAi(cls)) llms[i] += hits;
    if (cls === "live") live[i] += hits;
    else if (cls === "ai-search") aiSearch[i] += hits;
    else if (cls === "training") training[i] += hits;
  }

  const rows = ((feedRes.data ?? []) as Array<{ at: string; bot_name: string | null; path: string }>).map((r) => ({
    at: r.at,
    bot: r.bot_name ?? "unknown",
    cls: botClass(r.bot_name ?? "unknown"),
    path: r.path,
  }));
  const aiRows = rows.filter((r) => isAi(r.cls));
  const pageHits = new Map<string, number>();
  for (const r of aiRows) pageHits.set(r.path, (pageHits.get(r.path) ?? 0) + 1);

  const referrals = new Map<string, number>();
  for (const r of (refRes.data ?? []) as Array<{ key: string; views: number }>) {
    const name = aiReferrer(String(r.key ?? ""));
    if (name) referrals.set(name, (referrals.get(name) ?? 0) + Number(r.views || 0));
  }

  let citations: AiReport["citations"] = null;
  if (citeRes && !citeRes.error && citeRes.data) {
    const list = citeRes.data as Array<{ engine: string; query: string; cited: boolean; cited_url: string | null; checked_at: string }>;
    const engines = new Map<string, { checks: number; cited: number }>();
    for (const c of list) {
      const e = engines.get(c.engine) ?? { checks: 0, cited: 0 };
      e.checks += 1;
      if (c.cited) e.cited += 1;
      engines.set(c.engine, e);
    }
    citations = {
      checks: list.length,
      cited: list.filter((c) => c.cited).length,
      byEngine: [...engines].map(([engine, v]) => ({ engine, ...v })).sort((a, b) => b.checks - a.checks),
      latest: list.filter((c) => c.cited).slice(0, 8).map((c) => ({ at: c.checked_at, engine: c.engine, query: c.query, url: c.cited_url })),
    };
  }

  return {
    days,
    live,
    aiSearch,
    training,
    llms,
    totals,
    bots: [...byBot]
      .map(([name, hits]) => ({ name, cls: botClass(name), hits }))
      .sort((a, b) => b.hits - a.hits),
    pages: [...pageHits].map(([path, hits]) => ({ path, hits })).sort((a, b) => b.hits - a.hits).slice(0, 8),
    feed: aiRows.slice(0, 14),
    llmsReads,
    referrals: [...referrals].map(([name, visits]) => ({ name, visits })).sort((a, b) => b.visits - a.visits),
    citations,
    since: (firstRes.data as Array<{ at: string }> | null)?.[0]?.at ?? null,
  };
}

export type GoogleReport = {
  days: string[];
  /** The product site's own Search Console line. */
  clicks: number[];
  impressions: number[];
  /** Average position per day, 0 where Google had no data. */
  positions: number[];
  previousClicks: number[];
  totals: { clicks: number; impressions: number; prevClicks: number; prevImpressions: number; position: number | null };
  queries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  sites: Array<{ projectId: string; domain: string; owner: string | null; clicks: number; impressions: number; prevClicks: number }>;
};

type GscRow = {
  project_id: string;
  date: string;
  clicks: number | null;
  impressions: number | null;
  avg_position: number | null;
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }> | null;
};

export async function googleReport(
  range: Range,
  productProjectId: string | null,
  sites: Array<{ id: string; domain: string; owner: string | null }>,
  now = Date.now(),
): Promise<GoogleReport> {
  const w = windows(range, now);
  const from = ISO(w.prevFrom).slice(0, 10);
  const { data, error } = await db()
    .from("gsc_stats")
    .select("project_id, date, clicks, impressions, avg_position, top_queries")
    .gte("date", from)
    .lt("date", ISO(w.to).slice(0, 10))
    .limit(50_000);
  if (error) throw error;
  const rows = (data ?? []) as GscRow[];
  const start = ISO(w.from).slice(0, 10);

  const days: string[] = [];
  for (let t = w.from; t < w.to; t += DAY) days.push(ISO(t).slice(0, 10));
  const prevDays: string[] = [];
  for (let t = w.prevFrom; t < w.prevTo; t += DAY) prevDays.push(ISO(t).slice(0, 10));

  const mine = rows.filter((r) => r.project_id === productProjectId);
  const byDay = new Map(mine.map((r) => [r.date, r]));
  const clicks = days.map((d) => byDay.get(d)?.clicks ?? 0);
  const impressions = days.map((d) => byDay.get(d)?.impressions ?? 0);
  const positions = days.map((d) => Math.round(Number(byDay.get(d)?.avg_position ?? 0) * 10) / 10);
  const previousClicks = prevDays.map((d) => byDay.get(d)?.clicks ?? 0);
  const prevImpressions = prevDays.reduce((a, d) => a + (byDay.get(d)?.impressions ?? 0), 0);
  let posW = 0;
  let posSum = 0;
  const q = new Map<string, { clicks: number; impressions: number; posW: number }>();
  for (const r of mine) {
    if (r.date < start) continue;
    if (r.avg_position != null && r.impressions) {
      posSum += Number(r.avg_position) * r.impressions;
      posW += r.impressions;
    }
    for (const t of r.top_queries ?? []) {
      const e = q.get(t.query) ?? { clicks: 0, impressions: 0, posW: 0 };
      e.clicks += t.clicks || 0;
      e.impressions += t.impressions || 0;
      e.posW += (t.position || 0) * (t.impressions || 0);
      q.set(t.query, e);
    }
  }

  const per = new Map<string, { clicks: number; impressions: number; prevClicks: number }>();
  for (const r of rows) {
    const e = per.get(r.project_id) ?? { clicks: 0, impressions: 0, prevClicks: 0 };
    if (r.date >= start) {
      e.clicks += r.clicks ?? 0;
      e.impressions += r.impressions ?? 0;
    } else e.prevClicks += r.clicks ?? 0;
    per.set(r.project_id, e);
  }

  return {
    days,
    clicks,
    impressions,
    positions,
    previousClicks,
    totals: {
      clicks: clicks.reduce((a, v) => a + v, 0),
      impressions: impressions.reduce((a, v) => a + v, 0),
      prevClicks: previousClicks.reduce((a, v) => a + v, 0),
      prevImpressions,
      position: posW ? posSum / posW : null,
    },
    queries: [...q]
      .map(([query, v]) => ({ query, clicks: v.clicks, impressions: v.impressions, position: v.impressions ? v.posW / v.impressions : 0 }))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 10),
    sites: sites
      .map((s) => ({ projectId: s.id, domain: s.domain, owner: s.owner, ...(per.get(s.id) ?? { clicks: 0, impressions: 0, prevClicks: 0 }) }))
      .filter((s) => s.impressions > 0 || s.clicks > 0)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
  };
}

/** The product's own site among the projects (dispatchseo.com, or PRODUCT_DOMAIN on another deployment). */
export async function productProjectId(): Promise<string | null> {
  const want = (process.env.PRODUCT_DOMAIN ?? "dispatchseo.com").replace(/^www\./, "").toLowerCase();
  const { data } = await db().from("projects").select("id, domain");
  const hit = ((data ?? []) as Array<{ id: string; domain: string | null }>).find(
    (p) => (p.domain ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") === want,
  );
  return hit?.id ?? null;
}
