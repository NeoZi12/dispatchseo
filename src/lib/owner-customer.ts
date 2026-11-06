import { db } from "./db";
import { isOperator } from "./autopilot/operator";
import { keptUsd, polarOrders, polarOrdersError, summarize, type MoneySummary, type PolarOrder } from "./owner-money";

// One customer, everything: what they paid (every Polar charge), what they
// cost (every metered line item), what their sites got (articles, Google),
// how the writer did for them, and what they did in the product. Feeds
// /owner/customers/[id]. Operator-only, our own tables plus Polar.

const DAY = 86_400_000;
const ISO = (t: number) => new Date(t).toISOString();

export type CostLine = { kind: "llm" | "dfs" | "fee"; item: string; usd: number };

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
  };
  qualifier: { domain: string; platform: string; aiChoice: string | null; verdict: string | null; at: string } | null;
  sites: Array<{ id: string; domain: string; name: string; hosted: boolean; createdAt: string; gscConnected: boolean; repo: string | null }>;
  orders: PolarOrder[] | null;
  money: MoneySummary | null;
  moneyError: string | null;
  cost: { totalUsd: number; llmUsd: number; dfsUsd: number; lines: CostLine[] };
  /** Set when the cost read failed (migration 0076 not applied): every cost figure is unknown, not zero. */
  costError: string | null;
  /** Lifetime, one point per UTC day from sign-up to today: what you have kept vs what they have cost. */
  ledger: { days: string[]; kept: number[]; cost: number[] };
  articles: Array<{ title: string; url: string | null; publishedAt: string; costUsd: number | null; domain: string }>;
  articleCount: number;
  writer: { done: number; failed: number; running: number; lastError: string | null; lastErrorAt: string | null };
  google: { days: string[]; clicks: number[]; impressions: number[]; totalClicks: number; totalImpressions: number };
  citations: { checks: number; cited: number };
  events: Array<{ at: string; event: string; detail: string | null }>;
  activeDays: Array<{ day: string; views: number }>;
};

type Row = Record<string, unknown>;

export async function customerDetail(userId: string, now = Date.now()): Promise<CustomerDetail | null> {
  const userRes = await db().auth.admin.getUserById(userId);
  if (userRes.error || !userRes.data.user) return null;
  const u = userRes.data.user;

  const [subRes, projRes, qualRes, eventsRes, orders] = await Promise.all([
    db().from("subscriptions").select("tier, status, cancel_at_period_end, current_period_end, provider_customer_id").eq("user_id", userId).maybeSingle(),
    db().from("projects").select("id, domain, name, writer_mode, created_at, gsc_site_url, github_repo").eq("owner_user_id", userId),
    db().from("signup_qualifiers").select("domain, platform, ai_choice, verdict, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
    db().from("app_events").select("at, event, props").eq("distinct_id", userId).order("at", { ascending: false }).limit(60),
    polarOrders(),
  ]);
  const sub = (subRes.data ?? null) as Row | null;
  const projects = ((projRes.data ?? []) as Row[]).map((p) => ({
    id: String(p.id),
    domain: String(p.domain ?? ""),
    name: String(p.name ?? ""),
    hosted: p.writer_mode === "hosted",
    createdAt: String(p.created_at ?? ""),
    gscConnected: Boolean(p.gsc_site_url),
    repo: (p.github_repo as string | null) ?? null,
  }));
  const ids = projects.map((p) => p.id);
  const domainOf = new Map(projects.map((p) => [p.id, p.domain]));

  const start = new Date(u.created_at).getTime();
  const firstDay = Math.floor(start / DAY) * DAY;
  const lastDay = Math.floor(now / DAY) * DAY;
  const gscFrom = ISO(lastDay - 89 * DAY).slice(0, 10);

  const empty = Promise.resolve({ data: [] as Row[], error: null });
  const [costRes, artRes, artCountRes, runsRes, failRes, gscRes, citeRes, daysRes] = await Promise.all([
    ids.length ? db().rpc("owner_cost_breakdown", { p_projects: ids }) : empty,
    ids.length
      ? db()
          .from("article_drafts")
          .select("title, published_url, published_at, pr_merged_at, created_at, cost_usd, project_id")
          .in("project_id", ids)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(25)
      : empty,
    ids.length ? db().from("article_drafts").select("id", { count: "exact", head: true }).in("project_id", ids).eq("status", "published") : Promise.resolve({ count: 0, error: null }),
    ids.length ? db().from("writer_runs").select("status").in("project_id", ids).gte("created_at", ISO(now - 90 * DAY)).limit(5000) : empty,
    ids.length
      ? db().from("writer_runs").select("error, updated_at").in("project_id", ids).eq("status", "failed").order("updated_at", { ascending: false }).limit(1)
      : empty,
    ids.length ? db().from("gsc_stats").select("date, clicks, impressions").in("project_id", ids).gte("date", gscFrom).limit(10_000) : empty,
    ids.length ? db().from("ai_snapshots").select("cited").in("project_id", ids).gte("checked_at", ISO(now - 90 * DAY)).limit(5000) : empty,
    db().rpc("owner_user_days", { p_user: userId, p_from: ISO(now - 90 * DAY), p_to: ISO(now + DAY) }),
  ]);

  // Orders: the checkout's external id, else the Polar customer on file.
  const polarCustomer = (sub?.provider_customer_id as string | null) ?? null;
  const mine = orders ? orders.filter((o) => o.externalId === userId || (polarCustomer != null && o.customerId === polarCustomer)) : null;

  // Cost lines and the per-day ledger.
  const lines = new Map<string, CostLine>();
  const costByDay = new Map<string, number>();
  for (const r of (costRes.data ?? []) as Row[]) {
    const kind = r.kind === "dfs" ? "dfs" : "llm";
    const usd = Number(r.microusd ?? 0) / 1e6;
    const key = `${kind}:${r.item}`;
    const line = lines.get(key) ?? { kind, item: String(r.item ?? "other"), usd: 0 };
    line.usd += usd;
    lines.set(key, line);
    costByDay.set(String(r.day), (costByDay.get(String(r.day)) ?? 0) + usd);
  }
  const keptByDay = new Map<string, number>();
  let fees = 0;
  for (const o of mine ?? []) {
    keptByDay.set(o.at.slice(0, 10), (keptByDay.get(o.at.slice(0, 10)) ?? 0) + keptUsd(o));
    fees += o.feeUsd;
  }
  const allLines = [...lines.values()];
  if (fees > 0) allLines.push({ kind: "fee", item: "Polar fees", usd: fees });
  const llmUsd = allLines.filter((l) => l.kind === "llm").reduce((a, l) => a + l.usd, 0);
  const dfsUsd = allLines.filter((l) => l.kind === "dfs").reduce((a, l) => a + l.usd, 0);

  const days: string[] = [];
  const kept: number[] = [];
  const cost: number[] = [];
  let k = 0;
  let c = 0;
  for (let t = firstDay; t <= lastDay; t += DAY) {
    const d = ISO(t).slice(0, 10);
    k += keptByDay.get(d) ?? 0;
    c += costByDay.get(d) ?? 0;
    days.push(d);
    kept.push(Math.round(k * 100) / 100);
    cost.push(Math.round(c * 100) / 100);
  }

  const runs = (runsRes.data ?? []) as Row[];
  const fail = ((failRes.data ?? []) as Row[])[0];

  const gDays: string[] = [];
  for (let t = lastDay - 89 * DAY; t <= lastDay; t += DAY) gDays.push(ISO(t).slice(0, 10));
  const gc = new Map<string, number>();
  const gi = new Map<string, number>();
  for (const r of (gscRes.data ?? []) as Row[]) {
    const d = String(r.date);
    gc.set(d, (gc.get(d) ?? 0) + Number(r.clicks ?? 0));
    gi.set(d, (gi.get(d) ?? 0) + Number(r.impressions ?? 0));
  }
  const clicks = gDays.map((d) => gc.get(d) ?? 0);
  const impressions = gDays.map((d) => gi.get(d) ?? 0);

  const cites = (citeRes.data ?? []) as Row[];
  const q = ((qualRes.data ?? []) as Row[])[0];

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
    },
    qualifier: q
      ? { domain: String(q.domain ?? ""), platform: String(q.platform ?? ""), aiChoice: (q.ai_choice as string | null) ?? null, verdict: (q.verdict as string | null) ?? null, at: String(q.created_at ?? "") }
      : null,
    sites: projects,
    orders: mine,
    money: mine ? summarize(mine) : null,
    moneyError: mine ? null : polarOrdersError(),
    cost: { totalUsd: llmUsd + dfsUsd + fees, llmUsd, dfsUsd, lines: allLines.sort((a, b) => b.usd - a.usd) },
    costError: costRes.error ? costRes.error.message : null,
    ledger: { days, kept, cost },
    articles: ((artRes.data ?? []) as Row[]).map((a) => ({
      title: String(a.title ?? "Untitled"),
      url: (a.published_url as string | null) ?? null,
      // Agent-mode articles go live through a merged PR and never get published_at.
      publishedAt: String(a.published_at ?? a.pr_merged_at ?? a.created_at ?? ""),
      costUsd: a.cost_usd == null ? null : Number(a.cost_usd),
      domain: domainOf.get(String(a.project_id)) ?? "",
    })),
    articleCount: Number((artCountRes as { count?: number | null }).count ?? 0),
    writer: {
      done: runs.filter((r) => r.status === "done").length,
      failed: runs.filter((r) => r.status === "failed").length,
      running: runs.filter((r) => r.status === "running").length,
      lastError: fail ? String(fail.error ?? "").slice(0, 300) : null,
      lastErrorAt: fail ? String(fail.updated_at ?? "") : null,
    },
    google: { days: gDays, clicks, impressions, totalClicks: clicks.reduce((a, v) => a + v, 0), totalImpressions: impressions.reduce((a, v) => a + v, 0) },
    citations: { checks: cites.length, cited: cites.filter((r) => r.cited).length },
    events: ((eventsRes.data ?? []) as Row[]).map((e) => {
      const p = (e.props ?? {}) as Record<string, unknown>;
      const parts = ["tier", "status", "interval", "method", "domain", "repo", "step", "reason"].filter((x) => p[x] != null && p[x] !== "").map((x) => `${x} ${String(p[x])}`);
      return { at: String(e.at), event: String(e.event), detail: parts.length ? parts.join(" · ") : null };
    }),
    activeDays: ((daysRes.data ?? []) as Row[]).map((r) => ({ day: String(r.day), views: Number(r.views ?? 0) })),
  };
}
