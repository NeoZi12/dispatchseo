import { cx } from "@/components/ui/styles";
import type { Customer, CustomersReport, TopRow, TrafficReport } from "@/lib/owner-analytics";
import type { Tier } from "@/lib/billing";
import { AreaChart, MetricChart } from "./area";
import { BarList, DeltaPill, FunnelBars, Panel, PanelHead, PublishStrip, RealShare, Sparkline, StatCells, type BarRow } from "./bits";
import { TabbedLists } from "./tabbed";
import { ago, compact, delta, fmt, money, pct, shortDate } from "./format";

// The sections of /owner, Polar-style: hairline panels, large light figures,
// one accent per chart, numbers in mono so columns line up.

const FLAG_BASE = 0x1f1e6;
function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(FLAG_BASE + code.charCodeAt(0) - 65, FLAG_BASE + code.charCodeAt(1) - 65);
}
const REGION = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string): string {
  if (!code) return "Unknown";
  try {
    return REGION.of(code) ?? code;
  } catch {
    return code;
  }
}

const rows = (list: TopRow[], label?: (k: string) => string): BarRow[] =>
  list.map((r) => ({ key: r.key || "none", label: label ? label(r.key) : r.key || "Unknown", value: r.views }));

// ---------- KPI strip ----------

function Kpi({
  label,
  value,
  deltaValue,
  sub,
  spark,
  children,
}: {
  label: string;
  value: string;
  deltaValue?: number | null;
  sub?: React.ReactNode;
  spark?: { values: number[]; tone: "blue" | "green" | "violet" | "gray"; bars?: boolean };
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col bg-surface px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
      <p className="text-[12.5px] text-ink-muted sm:text-[13px]">{label}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:mt-2.5">
        <span className="text-[1.5rem] font-light leading-none tracking-tight tabular-nums text-ink sm:text-[2.1rem]">{value}</span>
        {deltaValue !== undefined ? <DeltaPill value={deltaValue} /> : null}
      </p>
      {sub ? <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-ink-faint sm:text-[12.5px]">{sub}</p> : null}
      <div className="mt-auto pt-4">{spark ? <Sparkline values={spark.values} tone={spark.tone} bars={spark.bars} className="h-10" /> : children}</div>
    </div>
  );
}

const TIER_COLOR: Record<Tier, string> = { starter: "var(--color-info)", growth: "var(--color-accent)", scale: "var(--color-ok)" };

function PlanMix({ c }: { c: CustomersReport }) {
  const paying = c.customers.filter((x) => !x.operator && x.plan.monthlyUsd > 0 && x.plan.tier);
  const by = (["starter", "growth", "scale"] as Tier[]).map((t) => ({ t, usd: paying.filter((x) => x.plan.tier === t).reduce((a, x) => a + x.plan.monthlyUsd, 0) }));
  const total = by.reduce((a, b) => a + b.usd, 0);
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {total ? by.map((b) => (b.usd ? <div key={b.t} style={{ width: `${(b.usd / total) * 100}%`, background: TIER_COLOR[b.t] }} /> : null)) : null}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-faint">
        {by.map((b) => (
          <span key={b.t} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: TIER_COLOR[b.t] }} aria-hidden="true" />
            <span className="capitalize">{b.t}</span>
            <span className="font-mono tabular-nums text-ink-muted">{money(b.usd)}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

export function KpiStrip({ t, c }: { t: TrafficReport | null; c: CustomersReport | null }) {
  const signups = c ? c.signupsByDay.reduce((a, d) => a + d.count, 0) : t?.totals.signups ?? 0;
  const margin = c ? c.totals.revenueRecent - c.totals.costRecent : 0;
  return (
    <Panel label="Key numbers" className="grid grid-cols-2 gap-px bg-line-soft xl:grid-cols-4">
      <Kpi
        label="Visitors"
        value={t ? fmt(t.totals.visitors) : "–"}
        deltaValue={t ? delta(t.totals.visitors, t.previous.visitors) : null}
        sub={t ? `${fmt(t.totals.views)} page views` : "traffic not available"}
        spark={t ? { values: t.days.map((d) => d.humanVisitors), tone: "blue" } : undefined}
      />
      <Kpi
        label="Signups"
        value={fmt(signups)}
        sub={t ? `${fmt(t.totals.checkouts)} checkouts · ${fmt(t.totals.trials)} trials` : undefined}
        spark={c ? { values: c.signupsByDay.map((d) => d.count), tone: "violet", bars: true } : undefined}
      />
      <Kpi label="MRR" value={c ? money(c.totals.mrr) : "–"} sub={c ? `${c.totals.paying} paying · ${c.totals.trialing} on trial · ${c.totals.churned} churned` : "cloud only"}>
        {c ? <PlanMix c={c} /> : null}
      </Kpi>
      <Kpi
        label="Cost"
        value={c ? money(c.totals.costRecent) : "–"}
        sub={c ? (c.totals.revenueRecent ? `margin ${money(margin)} · ${pct(margin, c.totals.revenueRecent)}` : "nothing billed yet") : undefined}
        spark={c && c.costByDay.length ? { values: c.costByDay.map((d) => d.usd), tone: "gray", bars: true } : undefined}
      />
    </Panel>
  );
}

// ---------- traffic ----------

export function TrafficPanel({ t }: { t: TrafficReport }) {
  const days = t.days.map((d) => d.day);
  return (
    <Panel label="Traffic">
      <MetricChart
        days={days}
        metrics={[
          {
            key: "visitors",
            label: "Visitors",
            total: fmt(t.totals.visitors),
            delta: delta(t.totals.visitors, t.previous.visitors),
            values: t.days.map((d) => d.humanVisitors),
            previous: t.previousDays.map((d) => d.humanVisitors),
            tone: "blue",
          },
          {
            key: "views",
            label: "Page views",
            total: fmt(t.totals.views),
            delta: delta(t.totals.views, t.previous.views),
            values: t.days.map((d) => d.humanViews),
            previous: t.previousDays.map((d) => d.humanViews),
            tone: "blue",
          },
          {
            key: "bots",
            label: "Crawler hits",
            total: compact(t.totals.botHits),
            delta: delta(t.totals.botHits, t.previous.botHits),
            values: t.days.map((d) => d.botHits),
            previous: t.previousDays.map((d) => d.botHits),
            tone: "gray",
          },
          {
            key: "checkouts",
            label: "Checkouts",
            total: fmt(t.totals.checkouts),
            delta: delta(t.totals.checkouts, t.previous.checkouts),
            values: t.checkoutsByDay,
            tone: "green",
            kind: "bars",
          },
        ]}
      />
    </Panel>
  );
}

// ---------- signups and sources ----------

export function SignupsPanel({ t, c }: { t: TrafficReport; c: CustomersReport | null }) {
  const series = c?.signupsByDay ?? t.days.map((d, i) => ({ day: d.day, count: t.signupEventsByDay[i] ?? 0 }));
  const n = series.reduce((a, d) => a + d.count, 0);
  return (
    <Panel label="Signups and sources" className="flex flex-col">
      <PanelHead title="Signups and sources" meta={`${n} in ${t.range} d`} />
      <div className="px-4 pb-5 pt-7 sm:px-6">
        <AreaChart days={series.map((d) => d.day)} values={series.map((d) => d.count)} tone="violet" kind="bars" height={150} label="Signups" />
      </div>
      <StatCells
        items={[
          { label: "Visit → checkout", value: pct(t.totals.checkouts, t.totals.visitors) },
          { label: "Checkout → account", value: pct(t.totals.signups, t.totals.checkouts) },
          { label: "Account → paying", value: pct(t.totals.paid, t.totals.signups) },
        ]}
      />
      <div className="px-5 pb-6 pt-5 sm:px-6">
        <h3 className="text-[13px] font-medium text-ink">Where visitors came from</h3>
        <div className="mt-3.5">
          <BarList rows={rows(t.referrers).slice(0, 7)} empty="No visits recorded yet." />
        </div>
      </div>
    </Panel>
  );
}

// ---------- money ----------

function StatusChip({ c }: { c: Customer }) {
  const tone = c.plan.tone;
  const word =
    c.plan.status === "active"
      ? c.plan.cancelAtPeriodEnd
        ? "Ending"
        : "Active"
      : c.plan.status === "trialing"
        ? c.plan.cancelAtPeriodEnd
          ? "Trial ending"
          : "Trial"
        : c.plan.status === "past_due"
          ? "Past due"
          : c.plan.status === "canceled" || c.plan.status === "revoked"
            ? "Churned"
            : c.plan.status === "incomplete"
              ? "Unfinished"
              : "No plan";
  const cls =
    tone === "ok"
      ? "border-ok/30 bg-ok/10 text-ok"
      : tone === "active"
        ? "border-info/30 bg-info/10 text-info"
        : tone === "warn"
          ? "border-warn/30 bg-warn/10 text-warn"
          : tone === "danger"
            ? "border-danger/30 bg-danger/10 text-danger"
            : "border-line bg-surface-2 text-ink-faint";
  return <span className={cx("inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium", cls)}>{word}</span>;
}

function planName(c: Customer): string {
  return c.plan.tier ? c.plan.tier : "–";
}

export function MoneyPanel({ c, range }: { c: CustomersReport; range: number }) {
  const margin = c.totals.revenueRecent - c.totals.costRecent;
  const top = c.customers.filter((x) => !x.operator && (x.plan.status !== "none" || x.costRecentUsd > 0)).slice(0, 6);
  return (
    <Panel label="Money and customers" className="flex flex-col">
      <PanelHead title="Money and customers" meta="spend per day" />
      <div className="px-4 pb-5 pt-7 sm:px-6">
        {c.costByDay.length ? (
          <AreaChart days={c.costByDay.map((d) => d.day)} values={c.costByDay.map((d) => d.usd)} unit="usd" tone="gray" kind="bars" height={150} label="Spend" />
        ) : (
          <p className="flex h-[150px] items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-ink-faint">Daily spend appears once migration 0074 is applied.</p>
        )}
      </div>
      <StatCells
        items={[
          { label: "MRR", value: money(c.totals.mrr) },
          { label: `Cost, ${range} d`, value: money(c.totals.costRecent) },
          { label: "Margin", value: money(margin), tone: margin < 0 ? "danger" : margin > 0 ? "ok" : undefined },
        ]}
      />
      <div className="flex-1 px-5 pb-5 pt-4 sm:px-6">
        {top.length ? (
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Top customers</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
                <th scope="col" className="pb-2 font-medium">Customer</th>
                <th scope="col" className="hidden pb-2 font-medium sm:table-cell">Plan</th>
                <th scope="col" className="pb-2 text-right font-medium">Price</th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {top.map((x) => (
                <tr key={x.userId} className="border-t border-line-soft">
                  <td className="max-w-0 py-2.5 pr-3">
                    <span className="block truncate text-ink" title={x.email}>
                      {x.email}
                    </span>
                  </td>
                  <td className="hidden py-2.5 capitalize text-ink-muted sm:table-cell">{planName(x)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-ink">{x.plan.monthlyUsd ? money(x.plan.monthlyUsd) : "–"}</td>
                  <td className="py-2.5 pl-3 text-right">
                    <StatusChip c={x} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">No customer has a plan yet.</p>
        )}
      </div>
    </Panel>
  );
}

// ---------- funnel + who is real ----------

export function FunnelPanel({ t }: { t: TrafficReport }) {
  return (
    <Panel label="Funnel">
      <PanelHead title="Funnel" meta={`${t.range} d`} sub="Distinct people at each step; the small figure is the share of the step above." />
      <div className="px-3 pb-4 pt-4 sm:px-4">
        <FunnelBars steps={t.funnel} />
      </div>
    </Panel>
  );
}

export function RealPanel({ t }: { t: TrafficReport }) {
  const unconfirmed = Math.max(0, t.totals.browserHits - t.totals.views);
  return (
    <Panel label="Who is real" className="flex flex-col">
      <PanelHead title="Who is real" sub="Every request to the site. People ran our script; crawlers said what they are; the rest never did either." />
      <div className="px-5 pb-5 pt-5 sm:px-6">
        <RealShare people={t.totals.views} unconfirmed={unconfirmed} bots={t.totals.botHits} />
      </div>
      <div className="border-t border-line-soft">
        <TabbedLists
          title="Crawlers"
          tone="gray"
          tabs={[
            { key: "bots", label: "Bots", rows: rows(t.crawlers).slice(0, 6), empty: "No crawler yet." },
            { key: "pages", label: "Pages read", rows: rows(t.crawlerPages).slice(0, 6), empty: "No crawler yet." },
            { key: "files", label: "Sitemap & llms.txt", rows: rows(t.fileReaders).slice(0, 6), empty: "Nobody read them yet." },
          ]}
        />
      </div>
    </Panel>
  );
}

// ---------- breakdowns ----------

export function AudiencePanel({ t }: { t: TrafficReport }) {
  return (
    <Panel label="Audience">
      <TabbedLists
        title="Audience"
        tabs={[
          { key: "pages", label: "Pages", rows: rows(t.pages).slice(0, 8), empty: "No page view yet.", total: t.totals.views },
          { key: "countries", label: "Countries", rows: rows(t.countries, (k) => `${flag(k)}  ${countryName(k)}`.trim()).slice(0, 8), empty: "No country yet." },
          { key: "devices", label: "Devices", rows: rows(t.devices, (k) => k.charAt(0).toUpperCase() + k.slice(1)), empty: "Nothing yet." },
          { key: "utm", label: "Campaigns", rows: rows(t.sources), empty: "No tagged link clicked yet." },
        ]}
      />
    </Panel>
  );
}

// ---------- content + activity ----------

export function PublishPanel({ t, c }: { t: TrafficReport; c: CustomersReport }) {
  const n = t.published.reduce((a, d) => a + d.count, 0);
  const busiest = t.published.reduce((a, d) => (d.count > a.count ? d : a), { day: "", count: 0 });
  const sites = [...c.customers.flatMap((x) => x.sites), ...c.orphanSites].filter((s) => s.articlesRecent > 0);
  return (
    <Panel label="Articles published" className="grid lg:grid-cols-2">
      <div className="min-w-0">
        <PanelHead title="Articles published" meta={`${fmt(c.totals.articles)} live`} />
        <div className="px-5 pb-6 pt-4 sm:px-6">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[2.1rem] font-light leading-none tracking-tight tabular-nums text-ink">{fmt(n)}</span>
            <span className="text-[12.5px] text-ink-faint">in {t.range} days{busiest.count ? ` · busiest ${shortDate(busiest.day)}` : ""}</span>
          </p>
          <div className="mt-5">
            <PublishStrip days={t.published} />
          </div>
          <p className="mt-2 flex justify-between font-mono text-[10.5px] tabular-nums text-ink-faint" aria-hidden="true">
            <span>{t.published[0] ? shortDate(t.published[0].day) : ""}</span>
            <span>{t.published.at(-1) ? shortDate(t.published.at(-1)!.day) : ""}</span>
          </p>
        </div>
        <StatCells
          className="border-b-0"
          items={[
            { label: "Per day", value: (n / Math.max(1, t.range)).toFixed(1) },
            { label: "Sites publishing", value: fmt(sites.length) },
            { label: "Cost / article", value: n ? money(c.totals.costRecent / n) : "–" },
          ]}
        />
      </div>
      <div className="min-w-0 border-t border-line-soft px-5 pb-6 pt-5 sm:px-6 lg:border-l lg:border-t-0">
        <h3 className="text-[13px] font-medium text-ink">Most published</h3>
        <div className="mt-3.5">
          <BarList
            rows={sites
              .sort((a, b) => b.articlesRecent - a.articlesRecent)
              .slice(0, 7)
              .map((s) => ({ key: s.id, label: s.domain, value: s.articlesRecent }))}
            tone="violet"
            empty="No article went live in this range."
          />
        </div>
      </div>
    </Panel>
  );
}

const EVENT_WORDS: Record<string, string> = {
  user_signed_up: "Signed up",
  user_logged_in: "Logged in",
  user_confirmed_email: "Confirmed email",
  checkout_started: "Opened checkout",
  setup_trial_started: "Started trial",
  subscription_activated: "Subscription active",
  subscription_cancel_scheduled: "Cancellation scheduled",
  subscription_canceled: "Subscription ended",
  subscription_updated: "Subscription changed",
  subscription_resumed: "Subscription resumed",
  project_created: "Added a site",
  project_deleted: "Deleted a site",
  github_connected: "Connected GitHub",
  pipeline_installed: "Pipeline installed",
  gsc_connected: "Connected Search Console",
  pr_merged: "Merged a PR",
  account_deleted: "Deleted account",
  billing_portal_opened: "Opened billing",
  setup_step_viewed: "Viewed setup step",
  setup_step_deferred: "Skipped setup step",
  setup_connect_complete: "Finished connecting",
  github_cost_acknowledged: "Acknowledged GitHub cost",
  self_host_heartbeat: "Self-host check-in",
};

const DOT: Record<string, string> = {
  user_signed_up: "bg-accent",
  checkout_started: "bg-info",
  setup_trial_started: "bg-info",
  subscription_activated: "bg-ok",
  subscription_resumed: "bg-ok",
  subscription_canceled: "bg-danger",
  subscription_cancel_scheduled: "bg-warn",
  account_deleted: "bg-danger",
};

export function ActivityPanel({ t, who, now }: { t: TrafficReport; who: (id: string) => string; now: number }) {
  const list = t.recent.slice(0, 8);
  return (
    <Panel label="Activity" className="flex flex-col">
      <PanelHead title="Activity" meta={`${t.recent.length} events`} />
      {list.length === 0 ? (
        <p className="m-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint sm:m-6">Nothing in this range yet.</p>
      ) : (
        <ol className="mt-3 flex-1 px-2 pb-3 sm:px-3">
          {list.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2/50">
              <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", DOT[e.event] ?? "bg-ink-faint/50")} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink">
                  {EVENT_WORDS[e.event] ?? e.event.replace(/_/g, " ")} <span className="text-ink-faint">{who(e.who)}</span>
                </span>
                {e.detail ? <span className="block truncate text-[12px] text-ink-faint">{e.detail}</span> : null}
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-faint" title={new Date(e.at).toUTCString()}>
                {ago(e.at, now)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// ---------- every customer ----------

function SiteList({ x }: { x: Customer }) {
  if (!x.sites.length) return <span className="text-[12px] text-ink-faint">No site · joined {shortDate(x.createdAt)}</span>;
  return <span className="block truncate text-[12px] text-ink-faint">{x.sites.map((s) => s.domain + (s.hosted ? "" : " (agent)")).join(", ")}</span>;
}

function marginClass(v: number | null): string {
  return v == null ? "text-ink-faint" : v < 0 ? "text-danger" : v > 0 ? "text-ok" : "text-ink";
}

function MobileCustomer({ x, now }: { x: Customer; now: number }) {
  return (
    <li className={cx("px-5 py-4", x.operator && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">
            {x.email}
            {x.operator ? <span className="ml-2 text-[11px] font-normal text-ink-faint">you</span> : null}
          </p>
          <SiteList x={x} />
        </div>
        <StatusChip c={x} />
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 font-mono tabular-nums">
        {[
          ["Pays", x.plan.monthlyUsd ? money(x.plan.monthlyUsd) : "–"],
          ["Articles", fmt(x.articles)],
          ["Clicks", compact(x.clicks28d)],
          ["Cost", money(x.costRecentUsd, { precise: true })],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="font-sans text-[11px] text-ink-faint">{k}</dt>
            <dd className="mt-0.5 truncate text-[13.5px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11.5px] text-ink-faint">
        Seen {ago(x.lastSeen, now)}
        {x.marginRecentUsd != null ? (
          <>
            {" · margin "}
            <span className={cx("font-mono tabular-nums", marginClass(x.marginRecentUsd))}>{money(x.marginRecentUsd)}</span>
          </>
        ) : null}
      </p>
    </li>
  );
}

export function CustomersPanel({ c, t, range, now }: { c: CustomersReport; t: TrafficReport | null; range: number; now: number }) {
  const active = c.customers.filter((x) => !x.operator && x.daysActiveRecent > 0).length;
  return (
    <Panel id="customers" label="Customers">
      <PanelHead title="Customers" meta={`${c.totals.customers} accounts`} sub={`Revenue is each plan's monthly rate${c.polarChecked ? " (yearly plans at their per-month rate, from Polar)" : ""}. Cost is LLM calls plus platform-billed DataForSEO, last ${range} days. Your own account is last and left out of totals.`} />
      <StatCells
        className="mt-5"
        items={[
          { label: "Paying", value: fmt(c.totals.paying), tone: c.totals.paying ? "ok" : undefined },
          { label: "On trial", value: fmt(c.totals.trialing) },
          { label: "Active in dashboard", value: `${fmt(active)}${t ? ` · ${compact(t.appViews)} views` : ""}` },
          { label: "Articles, all time", value: fmt(c.totals.articles) },
        ]}
      />
      {/* Phone: one card per customer. */}
      <ol className="divide-y divide-line-soft md:hidden">
        {c.customers.map((x) => (
          <MobileCustomer key={x.userId} x={x} now={now} />
        ))}
      </ol>
      {/* Wider: the full table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Every customer</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
              <th scope="col" className="px-6 pb-3 pt-4 font-medium">Customer</th>
              <th scope="col" className="px-3 pb-3 pt-4 font-medium">Status</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Pays / mo</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Articles</th>
              <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium lg:table-cell">Clicks 28d</th>
              <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium xl:table-cell">Blog views</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Cost {range}d</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Margin</th>
              <th scope="col" className="hidden px-6 pb-3 pt-4 text-right font-medium lg:table-cell">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {c.customers.map((x) => (
              <tr key={x.userId} className={cx("border-t border-line-soft transition-colors hover:bg-surface-2/40", x.operator && "opacity-70")}>
                <td className="max-w-[18rem] px-6 py-3">
                  <span className="block truncate text-[13.5px] font-medium text-ink" title={x.email}>
                    {x.email}
                    {x.operator ? <span className="ml-2 text-[11px] font-normal text-ink-faint">you</span> : null}
                  </span>
                  <SiteList x={x} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <StatusChip c={x} />
                    <span className="text-[12px] capitalize text-ink-faint">{x.plan.tier ?? ""}</span>
                  </div>
                  <span className="mt-1 block font-mono text-[11px] tabular-nums text-ink-faint">
                    {x.plan.status === "trialing" && x.plan.trialEnd
                      ? `ends ${shortDate(x.plan.trialEnd)}`
                      : x.plan.periodEnd && x.plan.status === "active"
                        ? `${x.plan.cancelAtPeriodEnd ? "until" : "renews"} ${shortDate(x.plan.periodEnd)}${x.plan.interval === "year" ? " · yearly" : ""}`
                        : ""}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{x.plan.monthlyUsd ? money(x.plan.monthlyUsd) : <span className="text-ink-faint">–</span>}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  <span className="text-ink">{fmt(x.articles)}</span>
                  {x.articlesRecent ? <span className="block text-[11px] text-ink-faint">+{x.articlesRecent}</span> : null}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono tabular-nums lg:table-cell">
                  <span className="text-ink">{fmt(x.clicks28d)}</span>
                  {x.impressions28d ? <span className="block text-[11px] text-ink-faint">{compact(x.impressions28d)} impr.</span> : null}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-ink xl:table-cell">{fmt(x.blogViewsRecent)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  <span className="text-ink">{money(x.costRecentUsd, { precise: true })}</span>
                  {x.costUsd ? <span className="block text-[11px] text-ink-faint">{money(x.costUsd)} total</span> : null}
                </td>
                <td className={cx("px-3 py-3 text-right font-mono tabular-nums", marginClass(x.marginRecentUsd))}>{x.marginRecentUsd == null ? "–" : money(x.marginRecentUsd)}</td>
                <td className="hidden px-6 py-3 text-right font-mono tabular-nums lg:table-cell">
                  <span className="text-ink">{ago(x.lastSeen, now)}</span>
                  {x.daysActiveRecent ? <span className="block text-[11px] text-ink-faint">{x.daysActiveRecent}d active</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.orphanSites.length ? (
        <div className="border-t border-line-soft px-5 py-4 sm:px-6">
          <h3 className="text-[12.5px] text-ink-faint">Sites without an owner account</h3>
          <ul className="mt-2 space-y-1.5">
            {c.orphanSites.map((s) => (
              <li key={s.id} className="flex items-center gap-4 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink">{s.domain}</span>
                <span className="font-mono tabular-nums text-ink-muted">{fmt(s.articles)} art.</span>
                <span className="w-20 text-right font-mono tabular-nums text-ink-muted">{money(s.costRecentUsd, { precise: true })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
