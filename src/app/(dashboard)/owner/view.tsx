import { cx } from "@/components/ui/styles";
import type { Customer, CustomersReport, TopRow, TrafficReport } from "@/lib/owner-analytics";
import type { Tier } from "@/lib/billing";
import { AreaChart, MetricChart } from "./area";
import { BarList, DeltaPill, Panel, PublishStrip, Sparkline, StatCells, type BarRow } from "./bits";
import { ago, compact, delta, fmt, fullDate, money, rangeShort, shortDate } from "./format";

// The sections of /owner, Polar-style: hairline panels, large light figures,
// one accent per chart, numbers in mono so columns line up.

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
      <Kpi label="Monthly revenue" value={c ? money(c.totals.mrr) : "–"} sub={c ? `${c.totals.paying} paying · ${c.totals.trialing} on trial · ${c.totals.churned} churned` : "cloud only"}>
        {c ? <PlanMix c={c} /> : null}
      </Kpi>
      <Kpi
        label="Cost"
        value={c ? money(c.totals.costRecent) : "–"}
        sub={c ? `revenue ${money(c.totals.revenueRecent)} · margin ${money(margin)}` : undefined}
        spark={c && c.costByDay.length ? { values: c.costByDay.map((d) => d.usd), tone: "gray", bars: true } : undefined}
      />
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


// ---------- content + activity ----------

export function PublishPanel({ t, c }: { t: TrafficReport; c: CustomersReport }) {
  const n = t.published.reduce((a, d) => a + d.count, 0);
  const busiest = t.published.reduce((a, d) => (d.count > a.count ? d : a), { day: "", count: 0 });
  const sites = [...c.customers.flatMap((x) => x.sites), ...c.orphanSites].filter((s) => s.articlesRecent > 0);
  return (
    <Panel label="Articles">
      <SectionHead title="Articles" says="Articles that went live on every site, yours and your customers'." note={`${fmt(c.totals.articles)} live in total`} />
      <div className="grid lg:grid-cols-2">
      <div className="min-w-0">
        <div className="px-5 pb-6 pt-5 sm:px-6">
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

// ---------- one subject per section ----------

/** A section's frame: a title, one plain sentence saying what it shows, an
 *  optional note on the right. */
export function SectionHead({ title, says, note }: { title: string; says: string; note?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-soft px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] text-ink-faint">{says}</p>
      </div>
      {note ? <div className="text-[12.5px] text-ink-faint">{note}</div> : null}
    </div>
  );
}

export function VisitorsSection({ t }: { t: TrafficReport }) {
  const days = t.days.map((d) => d.day);
  const partial = t.since != null && new Date(t.since).getTime() > t.from;
  return (
    <Panel label="Visitors">
      <SectionHead
        title="Visitors"
        says="People who opened dispatchseo.com. Bots are not counted."
        note={t.since ? <span className={partial ? "text-warn" : undefined}>Counting since {fullDate(t.since)}</span> : "Nothing counted yet"}
      />
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
        ]}
        height={220}
      />
      <div className="grid gap-px border-t border-line-soft bg-line-soft lg:grid-cols-2">
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Where they came from</h3>
          <div className="mt-4">
            <BarList rows={rows(t.referrers).slice(0, 7)} empty="No visit yet." />
          </div>
        </div>
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Most visited pages</h3>
          <div className="mt-4">
            <BarList rows={rows(t.pages).slice(0, 7)} total={t.totals.views} empty="No page view yet." />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function SignupsSection({ t, c, who, now }: { t: TrafficReport; c: CustomersReport | null; who: (id: string) => string; now: number }) {
  const series = c?.signupsByDay ?? t.days.map((d, i) => ({ day: d.day, count: t.signupEventsByDay[i] ?? 0 }));
  const n = series.reduce((a, d) => a + d.count, 0);
  const list = t.recent.slice(0, 8);
  return (
    <Panel label="Signups">
      <SectionHead title="Signups" says="New accounts, and what people did in the product." note={`${fmt(n)} new in ${rangeShort(t.range)}`} />
      <div className="grid gap-px bg-line-soft lg:grid-cols-5">
        <div className="bg-surface px-4 pb-5 pt-7 sm:px-6 lg:col-span-3">
          <AreaChart days={series.map((d) => d.day)} values={series.map((d) => d.count)} tone="violet" kind="bars" height={190} label="Signups" legend="New accounts per day" />
        </div>
        <div className="bg-surface px-2 pb-3 pt-4 sm:px-3 lg:col-span-2">
          <h3 className="px-3 text-[13px] font-medium text-ink">Latest</h3>
          {list.length === 0 ? (
            <p className="mx-3 mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">Nothing yet in this range.</p>
          ) : (
            <ol className="mt-1">
              {list.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", DOT[e.event] ?? "bg-ink-faint/50")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {EVENT_WORDS[e.event] ?? e.event.replace(/_/g, " ")} <span className="text-ink-faint">{who(e.who)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint">{ago(e.at, now)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
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

function CostSplit({ x }: { x: Customer }) {
  const fee = x.feesRecentUsd;
  const parts = [
    ["AI", x.llmRecentUsd],
    ["data", x.dfsRecentUsd],
    ["fees", fee],
  ].filter(([, v]) => (v as number) > 0) as Array<[string, number]>;
  if (!parts.length) return null;
  return <span className="block whitespace-nowrap text-[11px] text-ink-faint">{parts.map(([k, v]) => `${k} ${money(v, { precise: true })}`).join(" · ")}</span>;
}

function MobileCustomer({ x, now }: { x: Customer; now: number; range: number }) {
  return (
    <li className={cx(x.operator && "opacity-70")}>
      <a href={`/owner/customers/${x.userId}`} className="block px-5 py-4 transition-colors active:bg-surface-2/60">
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
        <dl className="mt-3 grid grid-cols-3 gap-2 font-mono tabular-nums">
          {[
            ["Revenue", money(x.revenueRecentUsd), "text-ink"],
            ["Cost", money(x.totalCostRecentUsd, { precise: true }), "text-ink"],
            ["Margin", money(x.marginRecentUsd), marginClass(x.marginRecentUsd)],
          ].map(([k, v, cls]) => (
            <div key={k} className="min-w-0">
              <dt className="font-sans text-[11px] text-ink-faint">{k}</dt>
              <dd className={cx("mt-0.5 truncate text-[14px]", cls)}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11.5px] text-ink-faint">
          {fmt(x.articles)} articles · {compact(x.clicks28d)} clicks · seen {ago(x.lastSeen, now)}
        </p>
      </a>
    </li>
  );
}

export function CustomersPanel({ c, t, range, now }: { c: CustomersReport; t: TrafficReport | null; range: number; now: number }) {
  // Accounts that never added a site or picked a plan cost nothing and say
  // little each; they fold into one list under the table.
  const engaged = c.customers.filter((x) => x.operator || x.plan.status !== "none" || x.sites.length > 0 || x.costUsd > 0);
  const idle = c.customers.filter((x) => !engaged.includes(x));
  return (
    <Panel id="customers" label="Customers">
      <SectionHead
        title="Customers"
        says={
          c.ordersRead
            ? "What each customer pays you, what they cost you, and what is left."
            : "What each customer pays you (their plan price), what they cost you, and what is left."
        }
        note={`${fmt(engaged.filter((x) => !x.operator).length)} with a site or plan`}
      />
      <StatCells
        className="border-t-0"
        items={[
          { label: "Paying", value: `${fmt(c.totals.paying)}${c.totals.trialing ? ` · ${fmt(c.totals.trialing)} on trial` : ""}` },
          { label: `Revenue, ${rangeShort(range)}`, value: money(c.totals.revenueRecent) },
          { label: `Cost, ${rangeShort(range)}`, value: money(c.totals.costRecent) },
          { label: `Margin, ${rangeShort(range)}`, value: money(c.totals.revenueRecent - c.totals.costRecent), tone: c.totals.revenueRecent - c.totals.costRecent < 0 ? "danger" : "ok" },
        ]}
      />
      <ol className="divide-y divide-line-soft md:hidden">
        {engaged.map((x) => (
          <MobileCustomer key={x.userId} x={x} now={now} range={range} />
        ))}
      </ol>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Every customer</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
              <th scope="col" className="px-6 pb-3 pt-4 font-medium">Customer</th>
              <th scope="col" className="px-3 pb-3 pt-4 font-medium">Status</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Revenue</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Cost</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Margin</th>
              <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium xl:table-cell">Articles</th>
              <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium xl:table-cell">Clicks 28d</th>
              <th scope="col" className="hidden px-6 pb-3 pt-4 text-right font-medium lg:table-cell">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {engaged.map((x) => (
              <tr key={x.userId} className={cx("group border-t border-line-soft transition-colors hover:bg-surface-2/40", x.operator && "opacity-70")}>
                <td className="max-w-[17rem] px-6 py-3">
                  <a href={`/owner/customers/${x.userId}`} className="block truncate text-[13.5px] font-medium text-ink group-hover:underline" title={x.email}>
                    {x.email}
                    {x.operator ? <span className="ml-2 text-[11px] font-normal text-ink-faint">you</span> : null}
                  </a>
                  <SiteList x={x} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <StatusChip c={x} />
                    <span className="text-[12px] capitalize text-ink-faint">{x.plan.tier ?? ""}</span>
                  </div>
                  <span className="mt-1 block font-mono text-[11px] tabular-nums text-ink-faint">
                    {x.plan.monthlyUsd ? `${money(x.plan.monthlyUsd)}/mo${x.plan.interval === "year" ? " · yearly" : ""}` : ""}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  <span className="text-ink">{money(x.revenueRecentUsd)}</span>
                  {x.revenueAllUsd ? <span className="block whitespace-nowrap text-[11px] text-ink-faint">{money(x.revenueAllUsd)} total</span> : null}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  <span className="text-ink">{money(x.totalCostRecentUsd, { precise: true })}</span>
                  <CostSplit x={x} />
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  <span className={marginClass(x.marginRecentUsd)}>{money(x.marginRecentUsd)}</span>
                  {x.marginAllUsd != null && x.revenueAllUsd ? <span className="block whitespace-nowrap text-[11px] text-ink-faint">{money(x.marginAllUsd)} total</span> : null}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono tabular-nums xl:table-cell">
                  <span className="text-ink">{fmt(x.articles)}</span>
                  {x.articlesRecent ? <span className="block text-[11px] text-ink-faint">+{x.articlesRecent}</span> : null}
                </td>
                <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-ink xl:table-cell">{fmt(x.clicks28d)}</td>
                <td className="hidden px-6 py-3 text-right font-mono tabular-nums lg:table-cell">
                  <span className="text-ink">{ago(x.lastSeen, now)}</span>
                  {x.daysActiveRecent ? <span className="block text-[11px] text-ink-faint">{x.daysActiveRecent}d active</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {idle.length ? (
        <details className="group/idle border-t border-line-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-[13px] text-ink-muted hover:text-ink sm:px-6">
            <span>
              {idle.length} {idle.length === 1 ? "account" : "accounts"} signed up and never added a site or picked a plan
            </span>
            <span className="font-mono text-[12px] text-ink-faint group-open/idle:hidden">Show</span>
            <span className="hidden font-mono text-[12px] text-ink-faint group-open/idle:inline">Hide</span>
          </summary>
          <ul className="grid gap-x-6 px-5 pb-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {idle.map((x) => (
              <li key={x.userId} className="flex items-baseline justify-between gap-3 border-t border-line-soft py-2 text-[12.5px]">
                <a href={`/owner/customers/${x.userId}`} className="min-w-0 truncate text-ink hover:underline" title={x.email}>
                  {x.email}
                </a>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint">joined {shortDate(x.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {c.orphanSites.length ? (
        <div className="border-t border-line-soft px-5 py-4 sm:px-6">
          <h3 className="text-[12.5px] text-ink-faint">Sites without an owner account (your own)</h3>
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
