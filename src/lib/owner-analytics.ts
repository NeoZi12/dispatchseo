import { db } from "./db";
import { isCloudMode } from "./cloud";
import { TIER_LIMITS, TIER_NAMES, polar, polarConfigured, type Tier } from "./billing";
import { isOperator } from "./autopilot/operator";
import { ordersByUser, polarOrders, polarOrdersError, summarize, revenueUsd, type MoneySummary, type PolarOrder } from "./owner-money";
import { memoMinute } from "./owner-memo";
import { claudeCredit, type ClaudeCredit } from "./claude-credit";
import { siteSetupProgress, type SetupProgress } from "./owner-setup";

// Everything /owner shows, in two reads: the site's traffic and funnel
// (web_visits + app_events, migration 0073) and the customer ledger (auth
// users x subscriptions x projects x the per-project rollup). Operator-only
// telemetry across every tenant - no MCP counterpart on purpose (an MCP
// token IS one tenant; see autopilot/operator.ts).

export type Range = 7 | 30 | 90 | 365;
export const RANGES: Range[] = [7, 30, 90, 365];

export function parseRange(raw: string | undefined): Range {
  const n = Number(raw);
  return (RANGES as number[]).includes(n) ? (n as Range) : 30;
}

const DAY = 86_400_000;

function utcMidnight(t: number): number {
  return Math.floor(t / DAY) * DAY;
}

/** [from, to) for the range ending today (today included, partial), plus the
 *  window of the same length just before it. */
export function windows(range: Range, now = Date.now()) {
  const to = utcMidnight(now) + DAY;
  const from = to - range * DAY;
  return { from, to, prevFrom: from - range * DAY, prevTo: from };
}

export type DayRow = { day: string; botHits: number; browserHits: number; humanViews: number; humanVisitors: number };
export type TopRow = { key: string; views: number; visitors: number };
export type Totals = { visitors: number; views: number; botHits: number; browserHits: number; checkouts: number; signups: number; trials: number; paid: number };
export type FunnelStep = { label: string; count: number; note?: string };
/** `who` is the raw distinct id (a user id, a project id, or setup:<nonce>); the page resolves it. */
export type RecentEvent = { at: string; event: string; who: string; detail: string | null };

export type TrafficReport = {
  range: Range;
  from: number;
  to: number;
  days: DayRow[];
  /** The window before this one, same length, for the dotted comparison line. */
  previousDays: DayRow[];
  totals: Totals;
  previous: Totals;
  /** Per-day counts aligned with `days` (app_events; recorded since 2026-11-06). */
  checkoutsByDay: number[];
  signupEventsByDay: number[];
  pages: TopRow[];
  referrers: TopRow[];
  countries: TopRow[];
  devices: TopRow[];
  sources: TopRow[];
  crawlers: TopRow[];
  crawlerPages: TopRow[];
  fileReaders: TopRow[];
  funnel: FunnelStep[];
  recent: RecentEvent[];
  /** Human views of the dashboard (signed-in product use) in the range. */
  appViews: number;
  appVisitors: number;
  /** Articles published per UTC day across every project, every day in the range. */
  published: Array<{ day: string; count: number }>;
  /** The oldest visit on record (an imported one counts): before it there is no traffic data at all. */
  since: string | null;
};

type EventRow = { at: string; distinct_id: string; event: string; props: Record<string, unknown> | null };

const ISO = (t: number) => new Date(t).toISOString();

async function daily(from: number, to: number, area: string): Promise<DayRow[]> {
  const { data, error } = await db().rpc("owner_visits_daily", { p_from: ISO(from), p_to: ISO(to), p_area: area });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    day: String(r.day),
    botHits: Number(r.bot_hits ?? 0),
    browserHits: Number(r.browser_hits ?? 0),
    humanViews: Number(r.human_views ?? 0),
    humanVisitors: Number(r.human_visitors ?? 0),
  }));
}

async function top(from: number, to: number, area: string, dim: string, bots: boolean, limit = 10): Promise<TopRow[]> {
  const { data, error } = await db().rpc("owner_visits_top", {
    p_from: ISO(from),
    p_to: ISO(to),
    p_area: area,
    p_dim: dim,
    p_bots: bots,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({ key: String(r.key ?? ""), views: Number(r.views ?? 0), visitors: Number(r.visitors ?? 0) }))
    .filter((r) => r.key !== "" || dim === "referrer");
}

async function count(from: number, to: number, area: string, paths: string[]): Promise<{ views: number; visitors: number }> {
  const { data, error } = await db().rpc("owner_visits_count", { p_from: ISO(from), p_to: ISO(to), p_area: area, p_paths: paths });
  if (error) throw error;
  const r = ((data ?? []) as Array<Record<string, unknown>>)[0] ?? {};
  return { views: Number(r.views ?? 0), visitors: Number(r.visitors ?? 0) };
}

type DailyEvent = { day: string; event: string; n: number; actors: number };

async function eventsDaily(from: number, to: number): Promise<DailyEvent[]> {
  const { data, error } = await db().rpc("owner_events_daily", { p_from: ISO(from), p_to: ISO(to) });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    day: String(r.day),
    event: String(r.event),
    n: Number(r.n ?? 0),
    actors: Number(r.actors ?? 0),
  }));
}

function seriesFor(rows: DailyEvent[], event: string, days: DayRow[]): number[] {
  const by = new Map<string, number>();
  for (const r of rows) if (r.event === event) by.set(r.day, r.actors);
  return days.map((d) => by.get(d.day) ?? 0);
}

async function events(from: number, to: number): Promise<EventRow[]> {
  const { data, error } = await db()
    .from("app_events")
    .select("at, distinct_id, event, props")
    .gte("at", ISO(from))
    .lt("at", ISO(to))
    .order("at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

async function publishedByDay(from: number, to: number): Promise<Array<{ day: string; count: number }>> {
  const { data, error } = await db()
    .from("article_drafts")
    .select("published_at")
    .eq("status", "published")
    .gte("published_at", ISO(from))
    .lt("published_at", ISO(to))
    .limit(5000);
  if (error) throw error;
  const by = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ published_at: string | null }>) {
    if (!r.published_at) continue;
    const key = r.published_at.slice(0, 10);
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  const out: Array<{ day: string; count: number }> = [];
  for (let t = from; t < to; t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push({ day: key, count: by.get(key) ?? 0 });
  }
  return out;
}

function actors(rows: EventRow[], event: string, where?: (p: Record<string, unknown>) => boolean): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if (r.event === event && (!where || where(r.props ?? {}))) out.add(r.distinct_id);
  return out;
}

// Sum a daily series; visitors are per-day uniques (the hash rotates daily),
// so the range total is "visitor-days" - the same arithmetic Plausible uses.
function sum(days: DayRow[]) {
  return days.reduce(
    (a, d) => ({
      visitors: a.visitors + d.humanVisitors,
      views: a.views + d.humanViews,
      botHits: a.botHits + d.botHits,
      browserHits: a.browserHits + d.browserHits,
    }),
    { visitors: 0, views: 0, botHits: 0, browserHits: 0 },
  );
}

function totalsFor(days: DayRow[], ev: EventRow[]): Totals {
  const trialing = (p: Record<string, unknown>) => p.status === "trialing";
  const active = (p: Record<string, unknown>) => p.status === "active";
  const trials = new Set([...actors(ev, "setup_trial_started"), ...actors(ev, "subscription_activated", trialing)]);
  return {
    ...sum(days),
    checkouts: actors(ev, "checkout_started").size,
    signups: actors(ev, "user_signed_up").size,
    trials: trials.size,
    paid: actors(ev, "subscription_activated", active).size,
  };
}

// Every day in [from, to) present, zeros where nothing was recorded, so the
// chart shows the quiet days too.
function fill(days: DayRow[], from: number, to: number): DayRow[] {
  const by = new Map(days.map((d) => [d.day, d]));
  const out: DayRow[] = [];
  for (let t = from; t < to; t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push(by.get(key) ?? { day: key, botHits: 0, browserHits: 0, humanViews: 0, humanVisitors: 0 });
  }
  return out;
}

const FUNNEL_PATHS = ["/plans", "/signup", "/onboarding", "/qualify"];

/** The site's traffic and funnel. Memoised a minute per range (owner-memo.ts). */
export const trafficReport: (range: Range, now?: number) => Promise<TrafficReport> = memoMinute((range) => `traffic:${range}`, trafficReportFresh);

async function trafficReportFresh(range: Range, now = Date.now()): Promise<TrafficReport> {
  const w = windows(range, now);
  const [days, prevDays, appDays, ev, prevEv, pricing, pages, referrers, countries, devices, sources, crawlers, crawlerPages, fileReaders, published, dailyEvents] =
    await Promise.all([
      daily(w.from, w.to, "site"),
      daily(w.prevFrom, w.prevTo, "site"),
      daily(w.from, w.to, "app"),
      events(w.from, w.to),
      events(w.prevFrom, w.prevTo),
      count(w.from, w.to, "site", FUNNEL_PATHS),
      top(w.from, w.to, "site", "path", false, 12),
      top(w.from, w.to, "site", "referrer", false, 10),
      top(w.from, w.to, "site", "country", false, 10),
      top(w.from, w.to, "site", "device", false, 4),
      top(w.from, w.to, "site", "utm_source", false, 8),
      top(w.from, w.to, "site", "bot_name", true, 12),
      top(w.from, w.to, "site", "path", true, 8),
      top(w.from, w.to, "file", "bot_name", true, 8),
      publishedByDay(w.from, w.to),
      eventsDaily(w.from, w.to).catch(() => [] as DailyEvent[]),
    ]);
  const first = await db().from("web_visits").select("at").order("at", { ascending: true }).limit(1);
  const filled = fill(days, w.from, w.to);
  const prevFilled = fill(prevDays, w.prevFrom, w.prevTo);
  const totals = totalsFor(filled, ev);
  const previous = totalsFor(prevFilled, prevEv);
  const app = sum(appDays);
  const funnel: FunnelStep[] = [
    { label: "Visited the site", count: totals.visitors, note: "people, by day" },
    { label: "Saw pricing or signup", count: pricing.visitors, note: "/plans, /signup, /onboarding" },
    { label: "Opened checkout", count: totals.checkouts, note: "clicked a plan's button" },
    { label: "Created an account", count: totals.signups },
    { label: "Started a trial", count: totals.trials },
    { label: "Became paying", count: totals.paid, note: "first paid charge in this window" },
  ];
  const recent: RecentEvent[] = ev.slice(0, 40).map((r) => {
    const p = r.props ?? {};
    const parts = ["tier", "status", "interval", "method", "domain", "repo", "step", "reason", "number", "flow"]
      .filter((k) => p[k] != null && p[k] !== "")
      .map((k) => `${k} ${String(p[k])}`);
    return {
      at: r.at,
      event: r.event,
      who: r.distinct_id,
      detail: parts.length ? parts.join(" · ") : null,
    };
  });
  return {
    range,
    from: w.from,
    to: w.to,
    days: filled,
    previousDays: prevFilled,
    totals,
    previous,
    checkoutsByDay: seriesFor(dailyEvents, "checkout_started", filled),
    signupEventsByDay: seriesFor(dailyEvents, "user_signed_up", filled),
    pages,
    referrers: referrers.map((r) => (r.key === "" ? { ...r, key: "Direct / none" } : r)),
    countries,
    devices,
    sources,
    crawlers,
    crawlerPages,
    fileReaders,
    funnel,
    recent,
    appViews: app.views,
    appVisitors: app.visitors,
    published,
    since: (first.data as Array<{ at: string }> | null)?.[0]?.at ?? null,
  };
}

// ---------- customers ----------

export type PlanTone = "ok" | "active" | "warn" | "danger" | "neutral";

export type CustomerSite = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  hosted: boolean;
  articles: number;
  articlesRecent: number;
  lastArticleAt: string | null;
  clicks28d: number;
  impressions28d: number;
  blogViewsRecent: number;
  costUsd: number;
  costRecentUsd: number;
  llmCostUsd: number;
  dfsCostUsd: number;
  llmRecentUsd: number;
  dfsRecentUsd: number;
  /** Free Claude API credit already taken off the AI cost above (claude-credit.ts). */
  claudeCreditRecentUsd: number;
  claudeCreditUsd: number;
};

export type Customer = {
  userId: string;
  email: string;
  createdAt: string;
  operator: boolean;
  plan: {
    tier: Tier | null;
    status: string;
    label: string;
    tone: PlanTone;
    cancelAtPeriodEnd: boolean;
    periodEnd: string | null;
    interval: "month" | "year" | null;
    /** What one charge is, in USD, when Polar told us. */
    chargeUsd: number | null;
    /** Normalised to a month: the plan's monthly rate (yearly plans at their per-month rate). */
    monthlyUsd: number;
    trialEnd: string | null;
    /** When the subscription started and when it was cancelled, from Polar. */
    startedAt: string | null;
    canceledAt: string | null;
    /** Cancelled: ended, or set to end (a trial cancelled in its first hour is this). */
    cancelled: boolean;
    source: "polar" | "plan" | "none";
  };
  sites: CustomerSite[];
  articles: number;
  articlesRecent: number;
  clicks28d: number;
  impressions28d: number;
  blogViewsRecent: number;
  costUsd: number;
  costRecentUsd: number;
  /** Real charges from Polar (owner-money.ts); null when Polar did not answer. */
  money: { recent: MoneySummary; all: MoneySummary } | null;
  /** What they paid in the range, tax excluded, minus refunds. From Polar's
   *  real payments when readable; otherwise the plan price (revenueEstimated). */
  revenueRecentUsd: number;
  /** All time; null when Polar's payments are not readable. */
  revenueAllUsd: number | null;
  revenueEstimated: boolean;
  /** Everything they cost: AI calls + DataForSEO + Polar's fee on their payments. */
  totalCostRecentUsd: number;
  totalCostAllUsd: number;
  feesRecentUsd: number;
  marginRecentUsd: number;
  marginAllUsd: number | null;
  llmRecentUsd: number;
  dfsRecentUsd: number;
  /** Free Claude API credit already taken off their cost. */
  claudeCreditRecentUsd: number;
  lastSeen: string | null;
  viewsRecent: number;
  daysActiveRecent: number;
  /** Where they stand in setup, for accounts with a site and no article yet
   *  (owner-setup.ts); null once an article is out, or for accounts with no site. */
  setup: SetupProgress | null;
};

export type CustomersReport = {
  customers: Customer[];
  /** Sites nobody owns (self-host rows, pre-cloud projects) - shown apart. */
  orphanSites: CustomerSite[];
  totals: {
    customers: number;
    paying: number;
    trialing: number;
    cancelled: number;
    mrr: number;
    /** Revenue in the range: real payments, or plan prices when not readable. */
    revenueRecent: number;
    feesRecent: number;
    /** null when Polar's payments are not readable. */
    revenueAllTime: number | null;
    /** Cost after the free Claude credit. */
    costRecent: number;
    costAllTime: number;
    /** The free Claude credit already taken off costRecent / costAllTime. */
    claudeCreditRecent: number;
    claudeCreditAllTime: number;
    /** The monthly credit in USD; 0 when it is off. */
    claudeCreditMonthly: number;
    articles: number;
    articlesRecent: number;
  };
  polarChecked: boolean;
  /** Real charges were read from Polar for this report. */
  ordersRead: boolean;
  /** Why they were not, in plain words. */
  ordersError: string | null;
  /** Revenue per UTC day in the range (Polar payments), aligned with signupsByDay. */
  revenueByDay: Array<{ day: string; usd: number }>;
  /** Accounts created per UTC day in the range (auth users: real history). */
  signupsByDay: Array<{ day: string; count: number }>;
  /** What the range cost per day, USD (LLM + platform DataForSEO); empty when 0074 is not applied. */
  costByDay: Array<{ day: string; usd: number }>;
};

type SubRow = {
  user_id: string;
  provider_customer_id: string | null;
  tier: Tier | null;
  status: string;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  created_at: string | null;
};

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  owner_user_id: string | null;
  writer_mode: string | null;
  created_at: string;
};

type RollupRow = Record<string, unknown>;

type PolarFacts = { amountUsd: number; interval: "month" | "year"; trialEnd: string | null; startedAt: string | null; canceledAt: string | null };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }, (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

// Polar is the only place the interval and the real charge live (the table
// stores tier + status). ONE paginated list of the organisation's
// subscriptions, capped: it used to be one read per subscription, which at
// ten subscriptions was the slowest thing on every /owner page (up to two
// seconds). A slow Polar costs a column, never the page.
async function polarFacts(subs: SubRow[]): Promise<Map<string, PolarFacts>> {
  const out = new Map<string, PolarFacts>();
  if (!polarConfigured()) return out;
  const wanted = new Set(subs.filter((s) => s.provider_subscription_id).map((s) => s.provider_subscription_id as string));
  if (!wanted.size) return out;
  try {
    await withTimeout(
      (async () => {
        const pages = await polar().subscriptions.list({ limit: 100 });
        for await (const page of pages) {
          for (const s of page.result.items) {
            if (!wanted.has(s.id)) continue;
            out.set(s.id, {
              amountUsd: (s.amount ?? 0) / 100,
              interval: s.recurringInterval === "year" ? "year" : "month",
              trialEnd: s.trialEnd ? new Date(s.trialEnd).toISOString() : null,
              startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null,
              canceledAt: s.canceledAt ? new Date(s.canceledAt).toISOString() : null,
            });
          }
          if (out.size === wanted.size) break;
        }
      })(),
      4000,
    );
  } catch (e) {
    console.warn(`[owner] Polar subscriptions not read: ${e instanceof Error ? e.message : String(e)}`);
  }
  return out;
}

function planOf(sub: SubRow | undefined, facts: PolarFacts | undefined): Customer["plan"] {
  const tier = sub?.tier && sub.tier in TIER_LIMITS ? sub.tier : null;
  const status = sub?.status ?? "none";
  const cancel = Boolean(sub?.cancel_at_period_end);
  const interval = facts?.interval ?? null;
  const planMonthly = tier ? (interval === "year" ? TIER_LIMITS[tier].annual : TIER_LIMITS[tier].price) : 0;
  const billed = status === "active" || status === "past_due";
  const monthlyUsd = billed ? (facts ? (interval === "year" ? facts.amountUsd / 12 : facts.amountUsd) : planMonthly) : 0;
  let label: string;
  let tone: PlanTone;
  switch (status) {
    case "active":
      label = tier ? TIER_NAMES[tier] : "Paying";
      tone = "ok";
      break;
    case "trialing":
      label = tier ? `Trial · ${TIER_NAMES[tier]}` : "Trial";
      tone = "active";
      break;
    case "past_due":
      label = "Past due";
      tone = "warn";
      break;
    case "canceled":
    case "revoked":
      label = "Cancelled";
      tone = "danger";
      break;
    case "incomplete":
      label = "Checkout unfinished";
      tone = "warn";
      break;
    default:
      label = "No plan";
      tone = "neutral";
  }
  // A cancelled trial will never be charged: it is a cancellation, not a trial.
  if (cancel && status === "trialing") {
    label = "Cancelled";
    tone = "danger";
  } else if (cancel && status === "active") {
    label = "Cancelled";
    tone = "warn";
  }
  return {
    tier,
    status,
    label,
    tone,
    cancelAtPeriodEnd: cancel,
    periodEnd: sub?.current_period_end ?? null,
    interval,
    chargeUsd: facts ? facts.amountUsd : null,
    monthlyUsd,
    trialEnd: facts?.trialEnd ?? (status === "trialing" ? sub?.current_period_end ?? null : null),
    startedAt: facts?.startedAt ?? sub?.created_at ?? null,
    canceledAt: facts?.canceledAt ?? null,
    cancelled: (cancel && (status === "active" || status === "trialing")) || status === "canceled" || status === "revoked",
    source: facts ? "polar" : tier ? "plan" : "none",
  };
}

function siteOf(p: ProjectRow, r: RollupRow | undefined, credit: ClaudeCredit | null): CustomerSite {
  // AI cost is net of the free Claude credit; never below zero (the rollup
  // and the credit read are two queries a moment apart).
  const creditAll = credit?.allByProject.get(p.id) ?? 0;
  const creditRecent = credit?.recentByProject.get(p.id) ?? 0;
  const llm = Math.max(0, Number(r?.llm_cost_microusd ?? 0) / 1e6 - creditAll);
  const dfs = Number(r?.dfs_cost_microusd ?? 0) / 1e6;
  const llmRecent = Math.max(0, Number(r?.llm_cost_recent_microusd ?? 0) / 1e6 - creditRecent);
  const dfsRecent = Number(r?.dfs_cost_recent_microusd ?? 0) / 1e6;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    domain: p.domain,
    hosted: p.writer_mode === "hosted",
    articles: Number(r?.articles ?? 0),
    articlesRecent: Number(r?.articles_recent ?? 0),
    lastArticleAt: r?.last_article_at ? String(r.last_article_at) : null,
    clicks28d: Number(r?.clicks_28d ?? 0),
    impressions28d: Number(r?.impressions_28d ?? 0),
    blogViewsRecent: Number(r?.blog_views_recent ?? 0),
    costUsd: llm + dfs,
    costRecentUsd: llmRecent + dfsRecent,
    llmCostUsd: llm,
    dfsCostUsd: dfs,
    llmRecentUsd: llmRecent,
    dfsRecentUsd: dfsRecent,
    claudeCreditRecentUsd: creditRecent,
    claudeCreditUsd: creditAll,
  };
}

/** The customer ledger. Memoised a minute per range (owner-memo.ts). */
export const customersReport: (range: Range, now?: number) => Promise<CustomersReport | null> = memoMinute((range) => `customers:${range}`, customersReportFresh);

async function customersReportFresh(range: Range, now = Date.now()): Promise<CustomersReport | null> {
  if (!isCloudMode()) return null;
  const w = windows(range, now);
  const since = ISO(w.from);
  const [usersRes, subsRes, projectsRes, rollupRes, activityRes, costRes, credit] = await Promise.all([
    db().auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db().from("subscriptions").select("user_id, provider_customer_id, tier, status, provider_subscription_id, current_period_end, cancel_at_period_end, created_at"),
    db().from("projects").select("id, slug, name, domain, owner_user_id, writer_mode, created_at"),
    db().rpc("owner_project_rollup", { p_since: since }),
    db().rpc("owner_user_activity", { p_since: since }),
    db().rpc("owner_cost_daily", { p_from: since, p_to: ISO(w.to) }),
    claudeCredit(since),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (subsRes.error) throw subsRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (rollupRes.error) throw rollupRes.error;
  if (activityRes.error) throw activityRes.error;

  const subs = (subsRes.data ?? []) as SubRow[];
  const [facts, orders] = await Promise.all([polarFacts(subs), polarOrders()]);
  const customerToUser = new Map(subs.filter((s) => s.provider_customer_id).map((s) => [s.provider_customer_id as string, s.user_id]));
  const byUser: Map<string, PolarOrder[]> = orders ? ordersByUser(orders, customerToUser, new Set(usersRes.data.users.map((u) => u.id))) : new Map();
  const subBy = new Map(subs.map((s) => [s.user_id, s]));
  const rollup = new Map(((rollupRes.data ?? []) as RollupRow[]).map((r) => [String(r.project_id), r]));
  const activity = new Map(
    ((activityRes.data ?? []) as RollupRow[]).map((r) => [
      String(r.user_id),
      { lastSeen: String(r.last_seen), views: Number(r.views_recent ?? 0), days: Number(r.days_active_recent ?? 0) },
    ]),
  );
  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const sitesByOwner = new Map<string, CustomerSite[]>();
  const orphanSites: CustomerSite[] = [];
  for (const p of projects) {
    const site = siteOf(p, rollup.get(p.id), credit);
    if (!p.owner_user_id) {
      orphanSites.push(site);
      continue;
    }
    sitesByOwner.set(p.owner_user_id, [...(sitesByOwner.get(p.owner_user_id) ?? []), site]);
  }

  const customers: Customer[] = usersRes.data.users.map((u) => {
    const sub = subBy.get(u.id);
    const plan = planOf(sub, sub?.provider_subscription_id ? facts.get(sub.provider_subscription_id) : undefined);
    const sites = (sitesByOwner.get(u.id) ?? []).sort((a, b) => b.articles - a.articles);
    const act = activity.get(u.id);
    const costRecentUsd = sites.reduce((a, s) => a + s.costRecentUsd, 0);
    const costUsd = sites.reduce((a, s) => a + s.costUsd, 0);
    const mine = byUser.get(u.id) ?? [];
    const money = orders ? { recent: summarize(mine, w.from), all: summarize(mine) } : null;
    const fees = money?.recent.feeUsd ?? 0;
    const feesAll = money?.all.feeUsd ?? 0;
    const revenueRecentUsd = money ? money.recent.revenueUsd : plan.monthlyUsd * (range / 30);
    const totalCostRecentUsd = costRecentUsd + fees;
    const totalCostAllUsd = costUsd + feesAll;
    return {
      userId: u.id,
      email: u.email ?? "(no email)",
      createdAt: u.created_at,
      operator: isOperator(u.id),
      plan,
      sites,
      articles: sites.reduce((a, s) => a + s.articles, 0),
      articlesRecent: sites.reduce((a, s) => a + s.articlesRecent, 0),
      clicks28d: sites.reduce((a, s) => a + s.clicks28d, 0),
      impressions28d: sites.reduce((a, s) => a + s.impressions28d, 0),
      blogViewsRecent: sites.reduce((a, s) => a + s.blogViewsRecent, 0),
      costUsd,
      costRecentUsd,
      money,
      revenueRecentUsd,
      revenueAllUsd: money ? money.all.revenueUsd : null,
      revenueEstimated: !money,
      totalCostRecentUsd,
      totalCostAllUsd,
      feesRecentUsd: fees,
      marginRecentUsd: revenueRecentUsd - totalCostRecentUsd,
      marginAllUsd: money ? money.all.revenueUsd - totalCostAllUsd : null,
      llmRecentUsd: sites.reduce((a, s) => a + s.llmRecentUsd, 0),
      dfsRecentUsd: sites.reduce((a, s) => a + s.dfsRecentUsd, 0),
      claudeCreditRecentUsd: sites.reduce((a, s) => a + s.claudeCreditRecentUsd, 0),
      lastSeen: act?.lastSeen ?? u.last_sign_in_at ?? null,
      viewsRecent: act?.views ?? 0,
      daysActiveRecent: act?.days ?? 0,
      setup: null,
    };
  });

  // Where the ones still setting up stand: only accounts with a site and no
  // article yet ask the setup engine (a few reads each, no remote calls), so
  // the list stays quick however many finished customers there are.
  const settingUp = customers.filter((c) => !c.operator && c.sites.length > 0 && c.articles === 0).slice(0, 40);
  await Promise.all(
    settingUp.map(async (c) => {
      const p = await siteSetupProgress(c.sites[0].id, now);
      c.setup = p && !p.complete ? p : null;
    }),
  );

  // Paying first (by what they pay), then trials, then the rest by sign-up
  // date; the operator's own account sinks to the bottom of its group.
  const order = (c: Customer) => (c.plan.status === "active" || c.plan.status === "past_due" ? 0 : c.plan.status === "trialing" && !c.plan.cancelled ? 1 : 2);
  customers.sort((a, b) => {
    if (a.operator !== b.operator) return a.operator ? 1 : -1;
    const o = order(a) - order(b);
    if (o) return o;
    if (b.plan.monthlyUsd !== a.plan.monthlyUsd) return b.plan.monthlyUsd - a.plan.monthlyUsd;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const real = customers.filter((c) => !c.operator);
  const totals = {
    customers: real.length,
    paying: real.filter((c) => c.plan.status === "active" || c.plan.status === "past_due").length,
    trialing: real.filter((c) => c.plan.status === "trialing" && !c.plan.cancelled).length,
    cancelled: real.filter((c) => c.plan.cancelled).length,
    mrr: real.reduce((a, c) => a + c.plan.monthlyUsd, 0),
    revenueRecent: real.reduce((a, c) => a + c.revenueRecentUsd, 0),
    feesRecent: customers.reduce((a, c) => a + c.feesRecentUsd, 0),
    revenueAllTime: orders ? real.reduce((a, c) => a + (c.revenueAllUsd ?? 0), 0) : null,
    costRecent: customers.reduce((a, c) => a + c.totalCostRecentUsd, 0) + orphanSites.reduce((a, s) => a + s.costRecentUsd, 0),
    costAllTime: customers.reduce((a, c) => a + c.totalCostAllUsd, 0) + orphanSites.reduce((a, s) => a + s.costUsd, 0),
    claudeCreditRecent: credit?.recentUsd ?? 0,
    claudeCreditAllTime: credit?.allUsd ?? 0,
    claudeCreditMonthly: credit?.monthlyUsd ?? 0,
    articles: customers.reduce((a, c) => a + c.articles, 0) + orphanSites.reduce((a, s) => a + s.articles, 0),
    articlesRecent: customers.reduce((a, c) => a + c.articlesRecent, 0) + orphanSites.reduce((a, s) => a + s.articlesRecent, 0),
  };
  const dayKeys: string[] = [];
  for (let t = w.from; t < w.to; t += DAY) dayKeys.push(new Date(t).toISOString().slice(0, 10));
  const signupMap = new Map<string, number>();
  for (const u of usersRes.data.users) {
    const key = (u.created_at ?? "").slice(0, 10);
    if (key) signupMap.set(key, (signupMap.get(key) ?? 0) + 1);
  }
  const costMap = new Map<string, number>();
  if (!costRes.error) {
    for (const r of (costRes.data ?? []) as RollupRow[]) {
      const day = String(r.day).slice(0, 10);
      const gross = (Number(r.llm_microusd ?? 0) + Number(r.dfs_microusd ?? 0)) / 1e6;
      costMap.set(day, Math.max(0, gross - (credit?.byDay.get(day) ?? 0)));
    }
  }
  return {
    customers,
    orphanSites,
    totals,
    polarChecked: facts.size > 0,
    ordersRead: orders != null,
    ordersError: orders ? null : polarOrdersError(),
    revenueByDay: (() => {
      const m = new Map<string, number>();
      const realIds = new Set(real.map((c) => c.userId));
      for (const [uid, list] of byUser) {
        if (!realIds.has(uid)) continue;
        for (const o of list) m.set(o.at.slice(0, 10), (m.get(o.at.slice(0, 10)) ?? 0) + revenueUsd(o));
      }
      return dayKeys.map((day) => ({ day, usd: m.get(day) ?? 0 }));
    })(),
    signupsByDay: dayKeys.map((day) => ({ day, count: signupMap.get(day) ?? 0 })),
    costByDay: costRes.error ? [] : dayKeys.map((day) => ({ day, usd: costMap.get(day) ?? 0 })),
  };
}
