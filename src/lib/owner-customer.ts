import { db } from "./db";
import { isOperator } from "./autopilot/operator";
import { markState, type MarkState } from "./article-signature";
import { claudeCredit } from "./claude-credit";
import { polar, polarConfigured } from "./billing";
import { normalizePageUrl, type GscPageStat } from "./metrics";
import { polarOrders, polarOrdersError, revenueUsd, summarize, type MoneySummary, type PolarOrder } from "./owner-money";
import { accountSetupProgress, siteSetupProgress, type SetupProgress } from "./owner-setup";
import type { PublishTarget } from "./setup-path-core";
import { compareIdeas } from "./autopilot/idea-order";

// One customer, everything: what they paid (every Polar charge), what they
// cost (every metered line item), what their sites got (every article with
// its own Google numbers, the site totals), how the writer did for them,
// whether their live pages still carry our marks, and what they did in the
// product. Feeds /owner/customers/[id]. Operator-only, our own tables plus
// Polar.

const DAY = 86_400_000;
const ISO = (t: number) => new Date(t).toISOString();
// Google's numbers are kept per day; the page shows 90 days of them, and the
// two most recent 28-day windows against each other.
const GOOGLE_DAYS = 90;

export type CostLine = { kind: "llm" | "dfs" | "fee"; item: string; usd: number };

export type CustomerArticle = {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string;
  costUsd: number | null;
  domain: string;
  keyword: string | null;
  /** The keyword's monthly searches and difficulty (0-100), from the idea
   *  the article was written for; null when the idea carried none. */
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
  /** Google, from the daily top-pages snapshots: the last 28 days and the last 90. */
  clicks28d: number;
  impressions28d: number;
  clicks90d: number;
  impressions90d: number;
  /** Impression-weighted average position over the last 28 days. */
  position: number | null;
  /** The pages row's liveness: true once seen serving, false when known gone, null when unknown. */
  live: boolean | null;
  /** Which DispatchSEO marks the live page carried at its last scan (article-signature.ts). */
  mark: MarkState;
};

/** An idea still waiting for the writer, in the order it will be taken. */
export type QueueItem = {
  id: string;
  title: string;
  keyword: string | null;
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
  status: "approved" | "pending";
  foundAt: string;
  domain: string;
};

export type CustomerDetail = {
  userId: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  operator: boolean;
  plan: {
    tier: string | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    periodEnd: string | null;
    polarCustomerId: string | null;
    /** The subscription's price per month (yearly plans at their monthly rate), from Polar. */
    monthlyUsd: number | null;
    interval: "month" | "year" | null;
    /** When the subscription started and was cancelled, from Polar. */
    startedAt: string | null;
    canceledAt: string | null;
  };
  /** What the last 30 days cost, AI (after the credit) + DataForSEO + Polar fees. */
  cost30Usd: number;
  qualifier: { domain: string; platform: string; aiChoice: string | null; verdict: string | null; at: string } | null;
  sites: Array<{
    id: string; domain: string; name: string; hosted: boolean; createdAt: string; gscConnected: boolean; repo: string | null; articles: number; clicks28d: number; setup: SetupProgress | null;
    /** Hosted-blog forwarding, one line: "live", "PR merged, waiting for deploy", "PR open (next-config)", "merge failed: …", "manual snippet". Null = not a hosted-blog site. */
    forwarding: string | null;
    forwardingUrl: string | null;
    /** When the writer is due to publish next, and when research last ran. */
    nextArticleAt: string | null;
    lastResearchAt: string | null;
    /** Finished articles with nowhere to publish (draft status blocked_setup)
     *  on a hosted-writer site, and when the oldest was written. Nothing
     *  retries one after a week (draft-status.ts), and nobody is emailed, so
     *  this line is the only place a stuck article shows. Zero on an
     *  agent-mode site: those park on purpose, their own agent moves them. */
    parked: number;
    parkedSince: string | null;
  }>;
  /** Their sites' idea queue: what waits, plus how the rest of the ideas ended. */
  queue: { items: QueueItem[]; rejected: number; done: number; nextArticleAt: string | null; lastResearchAt: string | null };
  /** Where they stand in setup: the first site still setting up, else the
   *  account's first step when they have no site, else complete. Null only
   *  when the setup engine could not answer. */
  setup: SetupProgress | null;
  orders: PolarOrder[] | null;
  money: MoneySummary | null;
  moneyError: string | null;
  /** What they cost, after the free Claude credit (claude-credit.ts), the
   *  same way the customers table counts it: the month's Claude spend up to
   *  the credit is free, spread over every Claude call in proportion. */
  cost: { totalUsd: number; llmUsd: number; dfsUsd: number; lines: CostLine[]; claudeCreditUsd: number };
  /** Set when the cost read failed (migration 0076 not applied): every cost figure is unknown, not zero. */
  costError: string | null;
  /** Lifetime, one point per UTC day from sign-up to today: revenue so far vs cost so far (Polar fees included). */
  ledger: { days: string[]; revenue: number[]; cost: number[] };
  /** Every published article, newest first. */
  articles: CustomerArticle[];
  articleCount: number;
  /** Every draft that is not discarded, by where it stands. */
  drafts: { published: number; inFlight: number; parked: number; failed: number };
  firstArticleAt: string | null;
  writer: { done: number; failed: number; running: number; lastError: string | null; lastErrorAt: string | null };
  google: {
    days: string[];
    clicks: number[];
    impressions: number[];
    totalClicks: number;
    totalImpressions: number;
    clicks28d: number;
    impressions28d: number;
    prevClicks28d: number;
    prevImpressions28d: number;
    /** Impression-weighted average position over the 90 days, null without impressions. */
    position: number | null;
  };
  /** Their live pages by what the last scan found on them. */
  marks: { checked: number; signed: number; badge: number; none: number; unchecked: number };
  citations: { checks: number; cited: number };
  events: Array<{ at: string; event: string; detail: string | null }>;
  activeDays: Array<{ day: string; views: number }>;
};

type Row = Record<string, unknown>;
type PageRow = {
  url: string;
  title: string | null;
  primary_keyword: string | null;
  published_at: string | null;
  created_at: string | null;
  live_at: string | null;
  live_checked_at: string | null;
  mark_checked_at?: string | null;
  signature_seen?: boolean | null;
  badge_seen?: boolean | null;
};
const PAGE_COLS = "url, title, primary_keyword, published_at, created_at, live_at, live_checked_at";

/** The pages rows for these projects, with the mark columns when the schema
 *  has them (0082) and without them otherwise - the page reads either way. */
async function pagesFor(ids: string[]): Promise<PageRow[]> {
  if (!ids.length) return [];
  const full = await db().from("pages").select(`${PAGE_COLS}, mark_checked_at, signature_seen, badge_seen`).in("project_id", ids).limit(2000);
  if (!full.error) return (full.data ?? []) as PageRow[];
  const lean = await db().from("pages").select(PAGE_COLS).in("project_id", ids).limit(2000);
  return (lean.data ?? []) as PageRow[];
}

export async function customerDetail(userId: string, now = Date.now()): Promise<CustomerDetail | null> {
  const userRes = await db().auth.admin.getUserById(userId);
  if (userRes.error || !userRes.data.user) return null;
  const u = userRes.data.user;

  const [subRes, projRes, qualRes, eventsRes, orders] = await Promise.all([
    db().from("subscriptions").select("tier, status, cancel_at_period_end, current_period_end, provider_customer_id, provider_subscription_id, created_at").eq("user_id", userId).maybeSingle(),
    db().from("projects").select("id, domain, name, writer_mode, created_at, gsc_site_url, github_repo, next_article_at, last_research_at, publish_target, hosted_rewrite_pr_url, hosted_rewrite_state, hosted_rewrite_live_at").eq("owner_user_id", userId),
    db().from("signup_qualifiers").select("domain, platform, ai_choice, verdict, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
    db().from("app_events").select("at, event, props").eq("distinct_id", userId).order("at", { ascending: false }).limit(60),
    polarOrders(),
  ]);
  const sub = (subRes.data ?? null) as Row | null;
  // The plan's real price: subscriptions are readable with the main token even
  // when payments are not, and a grandfathered price differs from the list one.
  let monthlyUsd: number | null = null;
  let interval: "month" | "year" | null = null;
  let startedAt: string | null = (sub?.created_at as string | null) ?? null;
  let canceledAt: string | null = null;
  const subId = (sub?.provider_subscription_id as string | null) ?? null;
  if (subId && polarConfigured()) {
    try {
      const s = await polar().subscriptions.get({ id: subId });
      const amount = (s.amount ?? 0) / 100;
      interval = s.recurringInterval === "year" ? "year" : "month";
      if (sub?.status === "active" || sub?.status === "past_due") monthlyUsd = interval === "year" ? amount / 12 : amount;
      if (s.startedAt) startedAt = new Date(s.startedAt).toISOString();
      if (s.canceledAt) canceledAt = new Date(s.canceledAt).toISOString();
    } catch {
      monthlyUsd = null;
    }
  }
  const projects = ((projRes.data ?? []) as Row[]).map((p) => ({
    id: String(p.id),
    domain: String(p.domain ?? ""),
    name: String(p.name ?? ""),
    hosted: p.writer_mode === "hosted",
    createdAt: String(p.created_at ?? ""),
    gscConnected: Boolean(p.gsc_site_url),
    repo: (p.github_repo as string | null) ?? null,
    forwarding: forwardingLine(p),
    nextArticleAt: (p.next_article_at as string | null) ?? null,
    lastResearchAt: (p.last_research_at as string | null) ?? null,
    forwardingUrl: typeof p.hosted_rewrite_pr_url === "string" && p.hosted_rewrite_pr_url.startsWith("http") ? p.hosted_rewrite_pr_url : null,
  }));
  const ids = projects.map((p) => p.id);
  const domainOf = new Map(projects.map((p) => [p.id, p.domain]));

  const start = new Date(u.created_at).getTime();
  const firstDay = Math.floor(start / DAY) * DAY;
  const lastDay = Math.floor(now / DAY) * DAY;
  const gscFrom = ISO(lastDay - (GOOGLE_DAYS - 1) * DAY).slice(0, 10);
  const day28 = ISO(lastDay - 27 * DAY).slice(0, 10);
  const day56 = ISO(lastDay - 55 * DAY).slice(0, 10);

  const empty = Promise.resolve({ data: [] as Row[], error: null });
  const [costRes, artRes, draftsRes, runsRes, failRes, gscRes, citeRes, daysRes, pages, credit, ideasRes, runLinkRes] = await Promise.all([
    ids.length ? db().rpc("owner_cost_breakdown", { p_projects: ids }) : empty,
    ids.length
      ? db()
          .from("article_drafts")
          .select("id, title, primary_keyword, published_url, published_at, pr_merged_at, created_at, cost_usd, project_id, suggestion_id")
          .in("project_id", ids)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(200)
      : empty,
    ids.length ? db().from("article_drafts").select("status, project_id, created_at").in("project_id", ids).neq("status", "discarded").limit(5000) : empty,
    ids.length ? db().from("writer_runs").select("status").in("project_id", ids).gte("created_at", ISO(now - 90 * DAY)).limit(5000) : empty,
    ids.length
      ? db().from("writer_runs").select("error, updated_at").in("project_id", ids).eq("status", "failed").order("updated_at", { ascending: false }).limit(1)
      : empty,
    // The per-page snapshots ride along: one read serves the chart, the two
    // 28-day windows and every article's own numbers.
    ids.length ? db().from("gsc_stats").select("date, clicks, impressions, avg_position, top_pages").in("project_id", ids).gte("date", gscFrom).limit(2000) : empty,
    ids.length ? db().from("ai_snapshots").select("cited").in("project_id", ids).gte("checked_at", ISO(now - 90 * DAY)).limit(5000) : empty,
    db().rpc("owner_user_days", { p_user: userId, p_from: ISO(now - 90 * DAY), p_to: ISO(now + DAY) }),
    pagesFor(ids),
    claudeCredit(ISO(now - 30 * DAY)),
    // Every guide idea their sites ever had: the queue is what still waits,
    // and the rest says how research went (rejected vs written).
    ids.length
      ? db()
          .from("suggestions")
          .select("id, project_id, title, primary_keyword, keyword_volume, keyword_difficulty, spec, status, created_at, queue_position, source")
          .in("project_id", ids)
          .eq("type", "guide")
          .limit(2000)
      : empty,
    // Drafts that never stored their idea link it through their run.
    ids.length ? db().from("writer_runs").select("draft_id, suggestion_id").in("project_id", ids).not("draft_id", "is", null).not("suggestion_id", "is", null).limit(2000) : empty,
  ]);

  // Orders: the checkout's external id, else the Polar customer on file.
  const polarCustomer = (sub?.provider_customer_id as string | null) ?? null;
  const mine = orders ? orders.filter((o) => o.externalId === userId || (polarCustomer != null && o.customerId === polarCustomer)) : null;

  // Cost lines and the per-day ledger, gross first.
  const lines = new Map<string, CostLine>();
  const llmByDay = new Map<string, number>();
  const dfsByDay = new Map<string, number>();
  for (const r of (costRes.data ?? []) as Row[]) {
    const kind = r.kind === "dfs" ? "dfs" : "llm";
    const usd = Number(r.microusd ?? 0) / 1e6;
    const key = `${kind}:${r.item}`;
    const line = lines.get(key) ?? { kind, item: String(r.item ?? "other"), usd: 0 };
    line.usd += usd;
    lines.set(key, line);
    const byDay = kind === "dfs" ? dfsByDay : llmByDay;
    byDay.set(String(r.day), (byDay.get(String(r.day)) ?? 0) + usd);
  }
  // The free Claude credit, exactly as the customers table takes it off
  // (owner-analytics siteOf): their sites' share of each month's covered
  // spend, never below zero. One factor over their AI lines and days keeps
  // every figure on this page summing to the same net total.
  const llmGross = [...lines.values()].filter((l) => l.kind === "llm").reduce((a, l) => a + l.usd, 0);
  const creditAll = Math.min(llmGross, ids.reduce((a, id) => a + (credit?.allByProject.get(id) ?? 0), 0));
  const creditRecent = ids.reduce((a, id) => a + (credit?.recentByProject.get(id) ?? 0), 0);
  const netFactor = llmGross > 0 ? (llmGross - creditAll) / llmGross : 1;
  for (const l of lines.values()) if (l.kind === "llm") l.usd *= netFactor;
  const costByDay = new Map<string, number>();
  for (const [d, v] of dfsByDay) costByDay.set(d, (costByDay.get(d) ?? 0) + v);
  for (const [d, v] of llmByDay) costByDay.set(d, (costByDay.get(d) ?? 0) + v * netFactor);
  const revenueByDay = new Map<string, number>();
  let fees = 0;
  for (const o of mine ?? []) {
    const d = o.at.slice(0, 10);
    revenueByDay.set(d, (revenueByDay.get(d) ?? 0) + revenueUsd(o));
    costByDay.set(d, (costByDay.get(d) ?? 0) + o.feeUsd);
    fees += o.feeUsd;
  }
  const allLines = [...lines.values()].filter((l) => l.usd > 0);
  if (fees > 0) allLines.push({ kind: "fee", item: "Polar fees", usd: fees });
  const llmUsd = allLines.filter((l) => l.kind === "llm").reduce((a, l) => a + l.usd, 0);
  const dfsUsd = allLines.filter((l) => l.kind === "dfs").reduce((a, l) => a + l.usd, 0);
  // Last 30 days: data and fees in the window, plus the window's AI spend
  // after the credit that fell in it.
  const day30 = ISO(now - 30 * DAY).slice(0, 10);
  const inWindow = (m: Map<string, number>) => [...m].filter(([day]) => day >= day30).reduce((a, [, v]) => a + v, 0);
  const cost30Usd = inWindow(dfsByDay) + Math.max(0, inWindow(llmByDay) - creditRecent) + (mine ?? []).filter((o) => o.at.slice(0, 10) >= day30).reduce((a, o) => a + o.feeUsd, 0);

  const days: string[] = [];
  const revenue: number[] = [];
  const cost: number[] = [];
  let k = 0;
  let c = 0;
  for (let t = firstDay; t <= lastDay; t += DAY) {
    const d = ISO(t).slice(0, 10);
    k += revenueByDay.get(d) ?? 0;
    c += costByDay.get(d) ?? 0;
    days.push(d);
    revenue.push(Math.round(k * 100) / 100);
    cost.push(Math.round(c * 100) / 100);
  }

  const runs = (runsRes.data ?? []) as Row[];
  const fail = ((failRes.data ?? []) as Row[])[0];

  // Google: the site series by day, the two windows, and per page.
  type GscRow = { date: string; clicks: number | null; impressions: number | null; avg_position: number | null; top_pages: GscPageStat[] | null };
  const gscRows = (gscRes.data ?? []) as GscRow[];
  const gDays: string[] = [];
  for (let t = lastDay - (GOOGLE_DAYS - 1) * DAY; t <= lastDay; t += DAY) gDays.push(ISO(t).slice(0, 10));
  const gc = new Map<string, number>();
  const gi = new Map<string, number>();
  let posWeight = 0;
  let posImpr = 0;
  for (const r of gscRows) {
    const d = String(r.date);
    gc.set(d, (gc.get(d) ?? 0) + Number(r.clicks ?? 0));
    gi.set(d, (gi.get(d) ?? 0) + Number(r.impressions ?? 0));
    if (r.avg_position != null && Number(r.impressions ?? 0) > 0) {
      posWeight += Number(r.avg_position) * Number(r.impressions);
      posImpr += Number(r.impressions);
    }
  }
  const clicks = gDays.map((d) => gc.get(d) ?? 0);
  const impressions = gDays.map((d) => gi.get(d) ?? 0);
  const sum = (m: Map<string, number>, from: string, to?: string) => [...m].filter(([d]) => d >= from && (!to || d < to)).reduce((a, [, v]) => a + v, 0);
  const pages28 = foldPages(gscRows.filter((r) => String(r.date) >= day28));
  const pages90 = foldPages(gscRows);
  const sitePages28 = new Map<string, number>();
  for (const r of gscRows.filter((r) => String(r.date) >= day28)) {
    // Clicks per site in the window, for the sites list. gsc_stats has no
    // project column in this select, so fold by the page's host instead.
    for (const p of r.top_pages ?? []) {
      const host = hostOf(p.page);
      if (host) sitePages28.set(host, (sitePages28.get(host) ?? 0) + Number(p.clicks ?? 0));
    }
  }

  // Pages: liveness and marks by URL.
  const pageByUrl = new Map(pages.map((p) => [pageKey(p.url), p]));
  const liveOf = (p: PageRow | undefined): boolean | null => {
    if (!p) return null;
    if (p.live_at && (!p.live_checked_at || Date.parse(p.live_checked_at) <= Date.parse(p.live_at))) return true;
    if (p.live_at) return false;
    if (p.live_checked_at && now - Date.parse(p.live_checked_at) > DAY) return false;
    return null;
  };

  // Ideas: by id for the articles' keyword facts, by keyword text for the
  // pages an agent built (no draft, no link), and the queue itself in the
  // writer's own order (stages.ts pick: approved by queue_position then age,
  // pending after).
  type IdeaRow = { id: string; project_id: string; title: string | null; primary_keyword: string | null; keyword_volume: number | null; keyword_difficulty: number | null; spec: unknown; status: string | null; created_at: string | null; queue_position: number | null };
  const ideas = (ideasRes.data ?? []) as IdeaRow[];
  const ideaById = new Map(ideas.map((i) => [i.id, i]));
  const ideaByKeyword = new Map<string, IdeaRow>();
  for (const i of ideas) if (i.primary_keyword) ideaByKeyword.set(`${i.project_id}:${i.primary_keyword.trim().toLowerCase()}`, i);
  const ideaOfDraft = new Map<string, string>();
  for (const r of (runLinkRes.data ?? []) as Array<{ draft_id: string; suggestion_id: string }>) ideaOfDraft.set(r.draft_id, r.suggestion_id);
  const intentOf = (i: IdeaRow | undefined): string | null => {
    const spec = (i?.spec ?? null) as { intent?: unknown } | null;
    return spec && typeof spec.intent === "string" && spec.intent.trim() ? spec.intent.trim() : null;
  };
  const facts = (i: IdeaRow | undefined) => ({
    volume: i?.keyword_volume == null ? null : Number(i.keyword_volume),
    difficulty: i?.keyword_difficulty == null ? null : Math.round(Number(i.keyword_difficulty)),
    intent: intentOf(i),
  });
  const rank = (i: IdeaRow) => (i.status === "approved" ? 0 : 1);
  const queueItems: QueueItem[] = ideas
    .filter((i) => i.status === "approved" || i.status === "pending")
    // Approved first, then pending; inside each, the writer's own pick order (idea-order.ts).
    .sort((a, b) => rank(a) - rank(b) || compareIdeas(a, b))
    .map((i) => ({
      id: i.id,
      title: i.title?.trim() || i.primary_keyword || "Untitled idea",
      keyword: i.primary_keyword ?? null,
      ...facts(i),
      status: i.status === "approved" ? "approved" : "pending",
      foundAt: String(i.created_at ?? ""),
      domain: domainOf.get(i.project_id) ?? "",
    }));
  const earliest = (xs: Array<string | null>) => xs.filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  const latest = (xs: Array<string | null>) => xs.filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const queue = {
    items: queueItems,
    rejected: ideas.filter((i) => i.status === "rejected").length,
    done: ideas.filter((i) => i.status === "done").length,
    nextArticleAt: earliest(projects.map((p) => p.nextArticleAt)),
    lastResearchAt: latest(projects.map((p) => p.lastResearchAt)),
  };

  // Every article: the writer's drafts (article_drafts, with their cost and
  // keyword) plus the pages an agent-mode customer's own agent built and
  // logged (pages rows with no draft) - the same union the customers list
  // counts. Google numbers join by host and path, so `?lang=fr` and `www`
  // variants of one page fold into it.
  const published = (artRes.data ?? []) as Row[];
  const withGoogle = (key: string | null, base: Omit<CustomerArticle, "clicks28d" | "impressions28d" | "clicks90d" | "impressions90d" | "position" | "live" | "mark" | "volume" | "difficulty" | "intent">, idea: IdeaRow | undefined): CustomerArticle => {
    const t28 = key ? pages28.get(key) : undefined;
    const t90 = key ? pages90.get(key) : undefined;
    const page = key ? pageByUrl.get(key) : undefined;
    return {
      ...base,
      ...facts(idea),
      clicks28d: t28?.clicks ?? 0,
      impressions28d: t28?.impressions ?? 0,
      clicks90d: t90?.clicks ?? 0,
      impressions90d: t90?.impressions ?? 0,
      position: t28?.avgPosition == null ? null : Math.round(t28.avgPosition * 10) / 10,
      live: liveOf(page),
      mark: page ? markState(page) : "unchecked",
    };
  };
  const seen = new Set<string>();
  const articles: CustomerArticle[] = published.map((a) => {
    const url = (a.published_url as string | null) ?? null;
    const key = url ? pageKey(url) : null;
    if (key) seen.add(key);
    const ideaId = (a.suggestion_id as string | null) ?? ideaOfDraft.get(String(a.id)) ?? null;
    const kw = (a.primary_keyword as string | null) ?? null;
    const idea = (ideaId ? ideaById.get(ideaId) : undefined) ?? (kw ? ideaByKeyword.get(`${String(a.project_id)}:${kw.trim().toLowerCase()}`) : undefined);
    return withGoogle(key, {
      id: String(a.id),
      title: String(a.title ?? "Untitled"),
      url,
      // Agent-mode articles go live through a merged PR and never get published_at.
      publishedAt: String(a.published_at ?? a.pr_merged_at ?? a.created_at ?? ""),
      costUsd: a.cost_usd == null ? null : Number(a.cost_usd),
      domain: domainOf.get(String(a.project_id)) ?? "",
      keyword: kw,
    }, idea);
  });
  for (const p of pages) {
    const key = pageKey(p.url);
    // A page that never served is a PR nobody merged yet, not an article.
    if (seen.has(key) || !p.live_at) continue;
    seen.add(key);
    const pid = projects.find((pr) => pr.domain.replace(/^www\./, "") === hostOf(p.url))?.id;
    const idea = pid && p.primary_keyword ? ideaByKeyword.get(`${pid}:${p.primary_keyword.trim().toLowerCase()}`) : undefined;
    articles.push(
      withGoogle(key, {
        id: `page:${key}`,
        title: p.title?.trim() || p.url.replace(/^https?:\/\/(www\.)?/, ""),
        url: p.url,
        publishedAt: p.published_at ?? p.created_at ?? p.live_at,
        costUsd: null,
        domain: hostOf(p.url),
        keyword: p.primary_keyword ?? null,
      }, idea),
    );
  }
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const articlesBySite = new Map<string, number>();
  for (const a of articles) {
    const pid = projects.find((p) => p.domain.replace(/^www\./, "") === a.domain.replace(/^www\./, ""))?.id;
    if (pid) articlesBySite.set(pid, (articlesBySite.get(pid) ?? 0) + 1);
  }
  const firstArticleAt = articles.map((a) => a.publishedAt).filter(Boolean).sort()[0] ?? null;

  const draftRows = (draftsRes.data ?? []) as Row[];
  // A parked draft on a hosted-writer site is not "in progress": it is a
  // finished article waiting on a route that may never appear. Counted as in
  // progress, two sites' stuck articles went unseen here until 2026-11-10,
  // one of them for a week.
  // Not for an account whose plan ended: nobody is waiting on that article
  // (the first one this flagged was a trial cancelled ten days earlier).
  const planEnded = ["canceled", "cancelled", "revoked", "incomplete_expired"].includes(String(sub?.status ?? ""));
  const hostedIds = new Set(planEnded ? [] : projects.filter((p) => p.hosted).map((p) => p.id));
  const parkedBySite = new Map<string, { count: number; since: string | null }>();
  for (const r of draftRows) {
    const pid = String(r.project_id ?? "");
    if (r.status !== "blocked_setup" || !hostedIds.has(pid)) continue;
    const at = typeof r.created_at === "string" ? r.created_at : null;
    const cur = parkedBySite.get(pid) ?? { count: 0, since: null };
    parkedBySite.set(pid, { count: cur.count + 1, since: at && (!cur.since || at < cur.since) ? at : cur.since });
  }
  const parked = [...parkedBySite.values()].reduce((n, v) => n + v.count, 0);
  const drafts = {
    published: draftRows.filter((r) => r.status === "published").length,
    inFlight: draftRows.filter((r) => ["submitted", "accepted", "review", "finished", "blocked_setup"].includes(String(r.status))).length - parked,
    /** Finished, on a hosted-writer site, with nowhere to publish. */
    parked,
    failed: draftRows.filter((r) => r.status === "rejected").length,
  };

  // Marks across their live pages, not only the articles we list: a guide
  // an agent built is a pages row with no article_drafts row.
  const marks = { checked: 0, signed: 0, badge: 0, none: 0, unchecked: 0 };
  for (const p of pages) {
    if (!p.live_at) continue;
    const s = markState(p);
    if (s === "unchecked") marks.unchecked++;
    else {
      marks.checked++;
      if (s === "signed+badge" || s === "signed") marks.signed++;
      if (s === "signed+badge" || s === "badge") marks.badge++;
      if (s === "none") marks.none++;
    }
  }

  const cites = (citeRes.data ?? []) as Row[];
  const q = ((qualRes.data ?? []) as Row[])[0];

  // Setup: each site asks the setup engine (no remote reads); an account with
  // no site is on the first step, shaped by what they said at sign-up.
  const siteSetups = await Promise.all(projects.map((p) => siteSetupProgress(p.id, now)));
  const setup: SetupProgress | null = projects.length
    ? siteSetups.find((s) => s && !s.complete) ?? siteSetups.find((s) => s) ?? null
    : await accountSetupProgress(
        q ? { publish_target: (String(q.platform ?? "") === "wordpress" ? "wordpress" : "github") as PublishTarget, ai_choice: (q.ai_choice as string | null) ?? null } : null,
        now,
      );

  return {
    userId,
    email: u.email ?? "(no email)",
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    operator: isOperator(userId),
    plan: {
      tier: (sub?.tier as string | null) ?? null,
      status: (sub?.status as string | null) ?? "none",
      cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
      periodEnd: (sub?.current_period_end as string | null) ?? null,
      polarCustomerId: polarCustomer,
      monthlyUsd,
      interval,
      startedAt,
      canceledAt,
    },
    cost30Usd,
    qualifier: q
      ? { domain: String(q.domain ?? ""), platform: String(q.platform ?? ""), aiChoice: (q.ai_choice as string | null) ?? null, verdict: (q.verdict as string | null) ?? null, at: String(q.created_at ?? "") }
      : null,
    sites: projects.map((p, i) => ({ ...p, parked: parkedBySite.get(p.id)?.count ?? 0, parkedSince: parkedBySite.get(p.id)?.since ?? null, articles: articlesBySite.get(p.id) ?? 0, clicks28d: sitePages28.get(p.domain.replace(/^www\./, "")) ?? 0, setup: siteSetups[i] })),
    setup,
    orders: mine,
    money: mine ? summarize(mine) : null,
    moneyError: mine ? null : polarOrdersError(),
    cost: { totalUsd: llmUsd + dfsUsd + fees, llmUsd, dfsUsd, lines: allLines.sort((a, b) => b.usd - a.usd), claudeCreditUsd: creditAll },
    costError: costRes.error ? costRes.error.message : null,
    ledger: { days, revenue, cost },
    articles,
    articleCount: articles.length,
    queue,
    drafts,
    firstArticleAt,
    writer: {
      done: runs.filter((r) => r.status === "done").length,
      failed: runs.filter((r) => r.status === "failed").length,
      running: runs.filter((r) => r.status === "running").length,
      lastError: fail ? String(fail.error ?? "").slice(0, 300) : null,
      lastErrorAt: fail ? String(fail.updated_at ?? "") : null,
    },
    google: {
      days: gDays,
      clicks,
      impressions,
      totalClicks: clicks.reduce((a, v) => a + v, 0),
      totalImpressions: impressions.reduce((a, v) => a + v, 0),
      clicks28d: sum(gc, day28),
      impressions28d: sum(gi, day28),
      prevClicks28d: sum(gc, day56, day28),
      prevImpressions28d: sum(gi, day56, day28),
      position: posImpr > 0 ? Math.round((posWeight / posImpr) * 10) / 10 : null,
    },
    marks,
    citations: { checks: cites.length, cited: cites.filter((r) => r.cited).length },
    events: ((eventsRes.data ?? []) as Row[]).map((e) => {
      const p = (e.props ?? {}) as Record<string, unknown>;
      const parts = ["tier", "status", "interval", "method", "domain", "repo", "step", "reason"].filter((x) => p[x] != null && p[x] !== "").map((x) => `${x} ${String(p[x])}`);
      return { at: String(e.at), event: String(e.event), detail: parts.length ? parts.join(" · ") : null };
    }),
    activeDays: ((daysRes.data ?? []) as Row[]).map((r) => ({ day: String(r.day), views: Number(r.views ?? 0) })),
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** One key per page: host without www plus the path without its trailing
 *  slash, lower-cased, query and hash dropped. Search Console reports
 *  `?lang=fr` and `www.` variants as separate rows; to the owner they are
 *  one article. */
function pageKey(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return normalizePageUrl(url);
  }
}

/** aggregatePageTraffic (metrics.ts), keyed by pageKey instead. */
function foldPages(rows: Array<{ top_pages: GscPageStat[] | null }>): Map<string, { clicks: number; impressions: number; avgPosition: number | null }> {
  const acc = new Map<string, { clicks: number; impressions: number; posWeight: number }>();
  for (const row of rows) {
    for (const p of row.top_pages ?? []) {
      const key = pageKey(p.page);
      const a = acc.get(key) ?? { clicks: 0, impressions: 0, posWeight: 0 };
      const impr = p.impressions ?? 0;
      a.clicks += p.clicks ?? 0;
      a.impressions += impr;
      a.posWeight += (p.position ?? 0) * impr;
      acc.set(key, a);
    }
  }
  return new Map([...acc].map(([k, a]) => [k, { clicks: a.clicks, impressions: a.impressions, avgPosition: a.impressions > 0 ? a.posWeight / a.impressions : null }]));
}

/** The hosted-blog forwarding in one line for the operator (hosted-rewrite.ts
 *  writes hosted_rewrite_state; the customer's repo is private to us). */
function forwardingLine(p: Record<string, unknown>): string | null {
  if (p.publish_target !== "hosted") return null;
  if (p.hosted_rewrite_live_at) return "live";
  const state = typeof p.hosted_rewrite_state === "string" ? p.hosted_rewrite_state : "";
  if (state === "merged" || state.startsWith("merged:")) return `PR merged${state.includes(":") ? ` (${state.slice(7)})` : ""}, waiting for their deploy`;
  if (state === "owner-merge") return "PR open, removes their template blog - their merge";
  if (state.startsWith("merge-failed")) return state.replace("merge-failed:", "merge failed:");
  if (state.startsWith("opened:")) return `PR open (${state.slice(7)})`;
  if (state === "manual" || p.hosted_rewrite_pr_url === "manual") return "no file we can write - owner has the snippet";
  return p.hosted_rewrite_pr_url ? "PR open" : "not forwarded yet";
}
