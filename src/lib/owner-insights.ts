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

// The engines the owner asks about by name. Every AI crawler, AI referrer and
// citation check folds into one of these rows, so "how often did ChatGPT read
// us, send someone, name us" is one line on the page.
export type EngineKey = "chatgpt" | "claude" | "perplexity" | "google" | "other";

export const ENGINES: Array<{ key: EngineKey; name: string; who: string }> = [
  { key: "chatgpt", name: "ChatGPT", who: "OpenAI" },
  { key: "claude", name: "Claude", who: "Anthropic" },
  { key: "perplexity", name: "Perplexity", who: "Perplexity AI" },
  { key: "google", name: "Google AI", who: "AI Overviews and Gemini" },
  { key: "other", name: "Other AI", who: "Meta, Mistral, Amazon, Exa and the rest" },
];

/** Which engine a crawler belongs to; null for a bot that is not AI at all. */
export function engineOfBot(name: string): EngineKey | null {
  if (!isAi(botClass(name))) return null;
  if (/^(GPTBot|OpenAI search|ChatGPT user)/i.test(name)) return "chatgpt";
  if (/^Claude/i.test(name)) return "claude";
  if (/^Perplexity/i.test(name)) return "perplexity";
  if (/^Google Vertex AI$/i.test(name)) return "google";
  return "other";
}

export function engineOfReferrer(name: string): EngineKey {
  if (name === "ChatGPT") return "chatgpt";
  if (name === "Claude") return "claude";
  if (name === "Perplexity") return "perplexity";
  if (name === "Gemini") return "google";
  return "other";
}

export function engineOfSnapshot(engine: string): EngineKey {
  if (engine === "chatgpt") return "chatgpt";
  if (engine === "claude") return "claude";
  if (engine === "perplexity") return "perplexity";
  if (engine === "google_ai_overview" || engine === "gemini") return "google";
  return "other";
}

// The hosts aiReferrer() names, as PostgREST filters, so the referral read
// pulls only the handful of rows that can be an AI assistant.
const AI_REFERRER_HOSTS = ["chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "gemini.google.com", "bard.google.com", "copilot.microsoft.com", "you.com", "phind.com", "deepseek.com", "grok.com"];

export type EngineRow = {
  key: EngineKey;
  name: string;
  who: string;
  /** Crawler hits on pages and files, all three AI classes. */
  reads: number;
  /** Of those, fetched live because a person asked the assistant something. */
  live: number;
  /** People who clicked through from this assistant's answer. */
  people: number;
  /** Citation checks in the range, and how many named us. */
  checks: number;
  cited: number;
  /** Latest citation check in the range, null when none ran. */
  lastChecked: string | null;
  /** This engine's crawlers seen in the range, most hits first. */
  bots: string[];
};

export type AiReport = {
  days: string[];
  /** Per day, aligned with days. */
  live: number[];
  aiSearch: number[];
  training: number[];
  /** All AI crawler hits per day (the three classes summed), and the period before. */
  reads: number[];
  prevReads: number[];
  /** People who arrived from an AI answer, per day, and the period before. */
  peopleDaily: number[];
  prevPeopleDaily: number[];
  /** Citation checks per day and how many of them named us. */
  checksDaily: number[];
  citedDaily: number[];
  /** llms.txt / llms-full.txt reads by AI crawlers per day. */
  llms: number[];
  totals: Record<BotClass, number>;
  /** Range totals the chart tabs compare against. */
  people: number;
  prev: { reads: number; people: number };
  engines: EngineRow[];
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

type BotDay = { day: string; bot_name: string; area: string; hits: number };

export async function aiReport(range: Range, productProjectId: string | null, now = Date.now()): Promise<AiReport> {
  const w = windows(range, now);
  const [daily, prevDaily, feedRes, firstRes, refRes, citeRes] = await Promise.all([
    db().rpc("owner_bots_daily", { p_from: ISO(w.from), p_to: ISO(w.to) }),
    db().rpc("owner_bots_daily", { p_from: ISO(w.prevFrom), p_to: ISO(w.prevTo) }),
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
    // Human visits whose referrer can be an AI assistant, this range and the
    // one before (aiReferrer() does the exact match below).
    db()
      .from("web_visits")
      .select("at, referrer")
      .eq("bot", false)
      .in("kind", ["beacon", "import"])
      .eq("area", "site")
      .gte("at", ISO(w.prevFrom))
      .lt("at", ISO(w.to))
      .or(AI_REFERRER_HOSTS.map((h) => `referrer.ilike.%${h}%`).join(","))
      .limit(5000),
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
  const prevDays: string[] = [];
  for (let t = w.prevFrom; t < w.prevTo; t += DAY) prevDays.push(ISO(t).slice(0, 10));
  const idx = new Map(days.map((d, i) => [d, i]));
  const prevIdx = new Map(prevDays.map((d, i) => [d, i]));
  const zeros = () => days.map(() => 0);
  const live = zeros();
  const aiSearch = zeros();
  const training = zeros();
  const reads = zeros();
  const llms = zeros();
  const peopleDaily = zeros();
  const checksDaily = zeros();
  const citedDaily = zeros();
  const prevReads = prevDays.map(() => 0);
  const prevPeopleDaily = prevDays.map(() => 0);
  const totals: Record<BotClass, number> = { live: 0, "ai-search": 0, training: 0, search: 0, seo: 0, social: 0, other: 0 };
  const byBot = new Map<string, number>();
  let llmsReads = 0;

  const engines = new Map<EngineKey, EngineRow & { botHits: Map<string, number> }>(
    ENGINES.map((e) => [e.key, { ...e, reads: 0, live: 0, people: 0, checks: 0, cited: 0, lastChecked: null, bots: [], botHits: new Map() }]),
  );

  for (const r of (daily.data ?? []) as BotDay[]) {
    const name = r.bot_name || "unknown";
    const cls = botClass(name);
    const hits = Number(r.hits) || 0;
    totals[cls] += hits;
    byBot.set(name, (byBot.get(name) ?? 0) + hits);
    const ai = isAi(cls);
    if (r.area === "file" && ai) llmsReads += hits;
    const engine = engineOfBot(name);
    if (engine) {
      const e = engines.get(engine)!;
      e.reads += hits;
      if (cls === "live") e.live += hits;
      e.botHits.set(name, (e.botHits.get(name) ?? 0) + hits);
    }
    const i = idx.get(String(r.day));
    if (i == null) continue;
    if (r.area === "file" && ai) llms[i] += hits;
    if (ai) reads[i] += hits;
    if (cls === "live") live[i] += hits;
    else if (cls === "ai-search") aiSearch[i] += hits;
    else if (cls === "training") training[i] += hits;
  }
  let prevReadsTotal = 0;
  for (const r of ((prevDaily.data ?? []) as BotDay[])) {
    if (!isAi(botClass(r.bot_name || "unknown"))) continue;
    const hits = Number(r.hits) || 0;
    prevReadsTotal += hits;
    const i = prevIdx.get(String(r.day));
    if (i != null) prevReads[i] += hits;
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
  let people = 0;
  let prevPeople = 0;
  const fromIso = ISO(w.from);
  for (const r of (refRes.data ?? []) as Array<{ at: string; referrer: string | null }>) {
    const name = aiReferrer(String(r.referrer ?? ""));
    if (!name) continue;
    const day = r.at.slice(0, 10);
    if (r.at >= fromIso) {
      people += 1;
      referrals.set(name, (referrals.get(name) ?? 0) + 1);
      engines.get(engineOfReferrer(name))!.people += 1;
      const i = idx.get(day);
      if (i != null) peopleDaily[i] += 1;
    } else {
      prevPeople += 1;
      const i = prevIdx.get(day);
      if (i != null) prevPeopleDaily[i] += 1;
    }
  }

  let citations: AiReport["citations"] = null;
  if (citeRes && !citeRes.error && citeRes.data) {
    const list = citeRes.data as Array<{ engine: string; query: string; cited: boolean; cited_url: string | null; checked_at: string }>;
    const perEngine = new Map<string, { checks: number; cited: number }>();
    for (const c of list) {
      const e = perEngine.get(c.engine) ?? { checks: 0, cited: 0 };
      e.checks += 1;
      if (c.cited) e.cited += 1;
      perEngine.set(c.engine, e);
      const row = engines.get(engineOfSnapshot(c.engine))!;
      row.checks += 1;
      if (c.cited) row.cited += 1;
      // The list is newest first, so the first row seen per engine is its latest check.
      if (!row.lastChecked) row.lastChecked = c.checked_at;
      const i = idx.get(c.checked_at.slice(0, 10));
      if (i != null) {
        checksDaily[i] += 1;
        if (c.cited) citedDaily[i] += 1;
      }
    }
    citations = {
      checks: list.length,
      cited: list.filter((c) => c.cited).length,
      byEngine: [...perEngine].map(([engine, v]) => ({ engine, ...v })).sort((a, b) => b.checks - a.checks),
      latest: list.filter((c) => c.cited).slice(0, 8).map((c) => ({ at: c.checked_at, engine: c.engine, query: c.query, url: c.cited_url })),
    };
  }

  return {
    days,
    live,
    aiSearch,
    training,
    reads,
    prevReads,
    peopleDaily,
    prevPeopleDaily,
    checksDaily,
    citedDaily,
    llms,
    totals,
    people,
    prev: { reads: prevReadsTotal, people: prevPeople },
    engines: [...engines.values()]
      .map(({ botHits, ...e }) => ({ ...e, bots: [...botHits].sort((a, b) => b[1] - a[1]).map(([name]) => name) }))
      // The named four always show, even at zero: a zero is the answer to
      // "did ChatGPT read us". The catch-all row shows only when it has something.
      .filter((e) => e.key !== "other" || e.reads || e.people || e.checks),
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
