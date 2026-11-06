import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { Stat } from "@/components/ui/stat";
import { StatGrid } from "@/components/ui/stat-grid";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cx } from "@/components/ui/styles";
import type { Customer, CustomerSite, CustomersReport, TopRow, TrafficReport } from "@/lib/owner-analytics";
import { Funnel, MoneyBars, PublishStrip, ShareBar, TrafficChart } from "./charts";
import { ago, compact, delta, fmt, fullDate, money, pct, rangeLabel, shortDate } from "./format";

// The sections of /owner. Server components only.

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

/** Ranked rows in the top-posts shape: a rank chip, the name, fixed-width
 *  numbers on the right over tiny labels. No bars - the numbers line up and
 *  carry it. */
function RankList({
  title,
  rows,
  what = "Views",
  who = "People",
  label = (k) => k,
  empty,
}: {
  title: string;
  rows: TopRow[];
  what?: string;
  who?: string | null;
  label?: (key: string) => React.ReactNode;
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-[13px] font-medium text-ink-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-faint">{empty}</p>
      ) : (
        <ol className="mt-2 -mx-2">
          {rows.map((r, i) => (
            <li key={r.key || "none"} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
              <span
                aria-hidden="true"
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11.5px] font-semibold tabular-nums",
                  i < 3 ? "bg-ok/12 text-ok ring-1 ring-ok/25" : "bg-surface-3/70 text-ink-faint",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink" title={r.key}>
                {label(r.key)}
              </span>
              {who ? (
                <span className="hidden w-12 shrink-0 text-right sm:block">
                  <span className="block text-[13.5px] font-medium leading-5 tabular-nums text-ink-muted">{compact(r.visitors)}</span>
                  <span className="block text-[9.5px] font-medium uppercase tracking-wider text-ink-faint">{who}</span>
                </span>
              ) : null}
              <span className="w-14 shrink-0 text-right">
                <span className="block text-[15px] font-semibold leading-5 tabular-nums text-ink">{compact(r.views)}</span>
                <span className="block text-[9.5px] font-medium uppercase tracking-wider text-ink-faint">{what}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function TrafficSection({ t }: { t: TrafficReport }) {
  const unconfirmed = Math.max(0, t.totals.browserHits - t.totals.views);
  const range = rangeLabel(t.range);
  const vs = `vs the ${t.range} days before`;
  return (
    <Card as="section" aria-labelledby="traffic-title">
      <CardHeader
        id="traffic-title"
        title="Traffic"
        description={`dispatchseo.com, ${range.toLowerCase()}. People are browsers that ran our script; crawlers declared themselves. UTC days.`}
      />
      <StatGrid cols={4} className="mt-5">
        <Stat label="Visitors" value={<span className="text-ok">{fmt(t.totals.visitors)}</span>} delta={delta(t.totals.visitors, t.previous.visitors)} deltaLabel={vs} hint="unique per day" />
        <Stat label="Page views" value={fmt(t.totals.views)} delta={delta(t.totals.views, t.previous.views)} deltaLabel={vs} hint={`${fmt(t.appViews)} more inside the dashboard`} />
        <Stat label="Crawler hits" value={fmt(t.totals.botHits)} delta={delta(t.totals.botHits, t.previous.botHits)} deltaLabel={vs} hint={`${pct(t.totals.botHits, t.totals.botHits + t.totals.browserHits)} of all requests`} />
        <Stat label="Checkouts opened" value={fmt(t.totals.checkouts)} delta={delta(t.totals.checkouts, t.previous.checkouts)} deltaLabel={vs} hint={`${fmt(t.totals.signups)} accounts · ${fmt(t.totals.trials)} trials`} />
      </StatGrid>
      <div className="mt-8">
        <TrafficChart days={t.days} />
      </div>
      <div className="mt-8 rounded-xl border border-line-soft bg-surface-2/40 p-4 sm:p-5">
        <p className="text-[13px] font-medium text-ink-muted">Who is actually here</p>
        <div className="mt-3">
          <ShareBar people={t.totals.views} unconfirmed={unconfirmed} bots={t.totals.botHits} />
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <RankList title="Top pages" rows={t.pages} empty="No page view recorded yet." />
        <RankList title="Referrers" rows={t.referrers} empty="No referred visit yet." />
        <RankList
          title="Countries"
          rows={t.countries}
          empty="No country seen yet."
          label={(k) => (
            <>
              <span className="mr-2" aria-hidden="true">
                {flag(k)}
              </span>
              {countryName(k)}
            </>
          )}
        />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <RankList title="Devices" rows={t.devices} empty="Nothing yet." label={(k) => k.charAt(0).toUpperCase() + k.slice(1)} />
        <RankList title="Campaigns (utm_source)" rows={t.sources} empty="No tagged link clicked yet." />
        <RankList title="What crawlers fetch" rows={t.crawlerPages} who={null} what="Hits" empty="No crawler yet." />
      </div>
    </Card>
  );
}

export function FunnelSection({ t }: { t: TrafficReport }) {
  return (
    <Card as="section" aria-labelledby="funnel-title" className="flex flex-col">
      <CardHeader id="funnel-title" title="Funnel" description={`${rangeLabel(t.range)}. Each step counts distinct people; the percentage is of the step before.`} />
      <div className="mt-6 flex-1">
        <Funnel steps={t.funnel} />
      </div>
    </Card>
  );
}

export function CrawlersSection({ t }: { t: TrafficReport }) {
  return (
    <Card as="section" aria-labelledby="crawlers-title">
      <CardHeader id="crawlers-title" title="Crawlers" description="Who the bots are, by hits on pages, and who reads the sitemap and llms.txt." />
      <div className="mt-5 grid gap-8">
        <RankList title="On pages" rows={t.crawlers} who={null} what="Hits" empty="No crawler yet." />
        <RankList title="Sitemap, robots, llms.txt" rows={t.fileReaders} who={null} what="Hits" empty="Nobody read them yet." />
      </div>
    </Card>
  );
}

export function PublishSection({ t, totalRecent, totalAll }: { t: TrafficReport; totalRecent: number | null; totalAll: number | null }) {
  const n = t.published.reduce((a, d) => a + d.count, 0);
  const busiest = t.published.reduce((a, d) => (d.count > a.count ? d : a), { day: "", count: 0 });
  return (
    <Card as="section" aria-labelledby="publish-title">
      <CardHeader
        id="publish-title"
        title="Articles published"
        description={`${rangeLabel(t.range)}, every site. ${totalAll != null ? `${fmt(totalAll)} live in total.` : ""}`}
      />
      <div className="mt-5 flex items-baseline gap-3">
        <span className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-accent">{fmt(totalRecent ?? n)}</span>
        <span className="text-[13px] text-ink-muted">in the range{busiest.count ? ` · busiest day ${shortDate(busiest.day)} (${busiest.count})` : ""}</span>
      </div>
      <div className="mt-5">
        <PublishStrip days={t.published} />
      </div>
      <p className="mt-2 flex justify-between text-[10.5px] tabular-nums text-ink-faint" aria-hidden="true">
        <span>{shortDate(t.published[0]?.day ?? new Date(t.from).toISOString())}</span>
        <span>{shortDate(t.published.at(-1)?.day ?? new Date(t.to).toISOString())}</span>
      </p>
    </Card>
  );
}

const EVENT_WORDS: Record<string, string> = {
  user_signed_up: "signed up",
  user_logged_in: "logged in",
  user_confirmed_email: "confirmed their email",
  checkout_started: "opened checkout",
  setup_trial_started: "started a trial",
  subscription_activated: "subscription active",
  subscription_cancel_scheduled: "scheduled a cancellation",
  subscription_canceled: "subscription ended",
  subscription_updated: "subscription changed",
  subscription_resumed: "resumed their subscription",
  project_created: "added a site",
  project_deleted: "deleted a site",
  github_connected: "connected GitHub",
  pipeline_installed: "pipeline installed",
  gsc_connected: "connected Search Console",
  pr_merged: "merged a PR",
  account_deleted: "deleted their account",
  billing_portal_opened: "opened the billing portal",
  setup_step_viewed: "viewed a setup step",
  setup_step_deferred: "skipped a setup step",
  setup_connect_complete: "finished connecting",
  github_cost_acknowledged: "acknowledged the GitHub cost",
  self_host_heartbeat: "self-host install checked in",
};

const LOUD = new Set(["user_signed_up", "checkout_started", "setup_trial_started", "subscription_activated", "subscription_canceled", "subscription_cancel_scheduled", "account_deleted"]);

export function ActivitySection({ t, who, now }: { t: TrafficReport; who: (id: string) => string; now: number }) {
  return (
    <Card as="section" aria-labelledby="activity-title" flush>
      <div className="p-5 pb-0 sm:p-6 sm:pb-0">
        <CardHeader id="activity-title" title="Recent activity" description="The last product events our servers recorded, newest first." />
      </div>
      {t.recent.length === 0 ? (
        <p className="m-5 rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint sm:m-6">Nothing yet in this range.</p>
      ) : (
        <ol className="mt-4 divide-y divide-line-soft border-t border-line-soft">
          {t.recent.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex items-baseline gap-4 px-5 py-2.5 sm:px-6">
              <span className="w-16 shrink-0 text-[12px] tabular-nums text-ink-faint" title={new Date(e.at).toUTCString()}>
                {ago(e.at, now)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px]">
                <span className="font-medium text-ink">{who(e.who)}</span>{" "}
                <span className={LOUD.has(e.event) ? "text-ink" : "text-ink-muted"}>{EVENT_WORDS[e.event] ?? e.event.replace(/_/g, " ")}</span>
                {e.detail ? <span className="text-ink-faint"> · {e.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SiteLine({ s }: { s: CustomerSite }) {
  return (
    <span className="block truncate text-[12px] text-ink-faint" title={`${s.name} · ${s.domain}`}>
      {s.domain}
      {s.hosted ? "" : " · agent"}
    </span>
  );
}

function PlanCell({ c }: { c: Customer }) {
  const p = c.plan;
  const line: string[] = [];
  if (p.monthlyUsd > 0) line.push(`${money(p.monthlyUsd)}/mo${p.interval === "year" ? " · yearly" : p.interval === "month" ? " · monthly" : ""}`);
  if (p.status === "trialing" && p.trialEnd) line.push(`ends ${shortDate(p.trialEnd)}`);
  else if (p.cancelAtPeriodEnd && p.periodEnd) line.push(`until ${shortDate(p.periodEnd)}`);
  else if (p.status === "active" && p.periodEnd) line.push(`renews ${shortDate(p.periodEnd)}`);
  return (
    <>
      <StatusPill tone={p.tone}>{p.label}</StatusPill>
      {line.length ? <span className="mt-1 block text-[12px] tabular-nums text-ink-faint">{line.join(" · ")}</span> : null}
    </>
  );
}

function Num({ children, faint, className = "" }: { children: React.ReactNode; faint?: React.ReactNode; className?: string }) {
  return (
    <span className={cx("block text-right tabular-nums", className)}>
      <span className="block text-[14px] font-medium text-ink">{children}</span>
      {faint ? <span className="block text-[11.5px] text-ink-faint">{faint}</span> : null}
    </span>
  );
}

export function CustomersSection({ c, range, now }: { c: CustomersReport; range: number; now: number }) {
  const rl = rangeLabel(range);
  const margin = c.totals.revenueRecent - c.totals.costRecent;
  const moneyRows = c.customers
    .filter((x) => !x.operator && (x.plan.monthlyUsd > 0 || x.costRecentUsd > 0))
    .slice(0, 12)
    .map((x) => ({ label: x.email, sub: x.sites.map((s) => s.domain).join(", ") || undefined, revenue: x.plan.monthlyUsd * (range / 30), cost: x.costRecentUsd }));
  const ownRows = c.customers.filter((x) => x.operator);
  return (
    <Card as="section" aria-labelledby="customers-title">
      <CardHeader
        id="customers-title"
        title="Customers"
        description={`Every cloud account. Revenue is the plan's monthly rate${c.polarChecked ? " (yearly plans at their per-month rate, from Polar)" : ""}; cost is LLM calls plus platform-billed DataForSEO, ${rl.toLowerCase()}. Your own account is listed last and left out of the totals.`}
      />
      <StatGrid cols={4} className="mt-5">
        <Stat label="Paying" value={<span className="text-ok">{fmt(c.totals.paying)}</span>} hint={`${fmt(c.totals.trialing)} on trial · ${fmt(c.totals.churned)} churned · ${fmt(c.totals.customers)} accounts`} />
        <Stat label="MRR" value={money(c.totals.mrr)} hint={`${money(c.totals.revenueRecent)} for the range`} />
        <Stat label="Cost" value={money(c.totals.costRecent)} hint={`${money(c.totals.costAllTime)} all time · ${rl.toLowerCase()}`} />
        <Stat
          label="Margin"
          value={<span className={margin < 0 ? "text-danger" : margin > 0 ? "text-ok" : ""}>{money(margin)}</span>}
          hint={c.totals.revenueRecent ? `${pct(margin, c.totals.revenueRecent)} of revenue` : "nothing billed yet"}
        />
      </StatGrid>
      {moneyRows.length ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <h3 className="text-[13px] font-medium text-ink-muted">What each customer pays against what they cost</h3>
            <p className="flex items-center gap-4 text-[12px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-ok" aria-hidden="true" /> Revenue, {rl.toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-ink-faint/50" aria-hidden="true" /> Cost
              </span>
            </p>
          </div>
          <div className="mt-4">
            <MoneyBars rows={moneyRows} />
          </div>
        </div>
      ) : null}
      <div className="mt-8">
        <Table caption="Customers">
          <TableHead>
            <TableHeader>Customer</TableHeader>
            <TableHeader>Plan</TableHeader>
            <TableHeader className="text-right">Articles</TableHeader>
            <TableHeader className="hidden text-right md:table-cell">Clicks 28d</TableHeader>
            <TableHeader className="hidden text-right lg:table-cell">Blog views</TableHeader>
            <TableHeader className="text-right">Cost</TableHeader>
            <TableHeader className="hidden text-right md:table-cell">Margin</TableHeader>
            <TableHeader className="hidden text-right lg:table-cell">Last seen</TableHeader>
          </TableHead>
          <tbody>
            {c.customers.map((x) => (
              <TableRow key={x.userId} className={x.operator ? "opacity-70" : ""}>
                <TableCell className="max-w-[16rem]">
                  <span className="block truncate text-[14px] font-medium text-ink" title={x.email}>
                    {x.email}
                    {x.operator ? <span className="ml-2 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-faint">you</span> : null}
                  </span>
                  {x.sites.length ? x.sites.map((s) => <SiteLine key={s.id} s={s} />) : <span className="block text-[12px] text-ink-faint">no site yet · joined {shortDate(x.createdAt)}</span>}
                </TableCell>
                <TableCell>
                  <PlanCell c={x} />
                </TableCell>
                <TableCell>
                  <Num faint={x.articlesRecent ? `+${x.articlesRecent} in range` : x.articles ? "none in range" : undefined}>{fmt(x.articles)}</Num>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Num faint={x.impressions28d ? `${compact(x.impressions28d)} impressions` : undefined}>{fmt(x.clicks28d)}</Num>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Num>{fmt(x.blogViewsRecent)}</Num>
                </TableCell>
                <TableCell>
                  <Num faint={x.costUsd ? `${money(x.costUsd)} all time` : undefined}>{money(x.costRecentUsd, { precise: true })}</Num>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Num className={x.marginRecentUsd == null ? "" : x.marginRecentUsd < 0 ? "[&>span:first-child]:text-danger" : "[&>span:first-child]:text-ok"}>
                    {x.marginRecentUsd == null ? <span className="text-ink-faint">–</span> : money(x.marginRecentUsd)}
                  </Num>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Num faint={x.daysActiveRecent ? `${x.daysActiveRecent} ${x.daysActiveRecent === 1 ? "day" : "days"} active` : "not in range"}>{ago(x.lastSeen, now)}</Num>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      {c.orphanSites.length ? (
        <div className="mt-6">
          <h3 className="text-[13px] font-medium text-ink-muted">Sites without an owner account</h3>
          <ul className="mt-2 divide-y divide-line-soft">
            {c.orphanSites.map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink">{s.domain}</span>
                <span className="w-20 text-right tabular-nums text-ink-muted">{fmt(s.articles)} articles</span>
                <span className="w-24 text-right tabular-nums text-ink-muted">{money(s.costRecentUsd, { precise: true })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {ownRows.length === 0 && c.customers.length === 0 ? <p className="mt-4 text-[13px] text-ink-faint">No accounts yet.</p> : null}
    </Card>
  );
}

export function DashboardUseSection({ t, c }: { t: TrafficReport; c: CustomersReport | null }) {
  const active = c ? c.customers.filter((x) => !x.operator && x.daysActiveRecent > 0).sort((a, b) => b.viewsRecent - a.viewsRecent).slice(0, 8) : [];
  return (
    <Card as="section" aria-labelledby="use-title">
      <CardHeader id="use-title" title="Dashboard use" description={`Signed-in page views inside the product, ${rangeLabel(t.range).toLowerCase()}.`} />
      <StatGrid cols={2} className="mt-5">
        <Stat label="Page views" value={fmt(t.appViews)} />
        <Stat label="Customers active" value={fmt(active.length)} hint={c ? "opened the dashboard" : "cloud only"} />
      </StatGrid>
      {active.length ? (
        <ol className="mt-5 -mx-2">
          {active.map((x) => (
            <li key={x.userId} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{x.email}</span>
              <span className="w-16 shrink-0 text-right">
                <span className="block text-[13.5px] font-medium leading-5 tabular-nums text-ink-muted">{x.daysActiveRecent}</span>
                <span className="block text-[9.5px] font-medium uppercase tracking-wider text-ink-faint">Days</span>
              </span>
              <span className="w-14 shrink-0 text-right">
                <span className="block text-[15px] font-semibold leading-5 tabular-nums text-ink">{fmt(x.viewsRecent)}</span>
                <span className="block text-[9.5px] font-medium uppercase tracking-wider text-ink-faint">Views</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}

export { fullDate };
