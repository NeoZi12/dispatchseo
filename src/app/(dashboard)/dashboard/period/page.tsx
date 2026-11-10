import Link from "next/link";
import { Suspense } from "react";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { isFreePlan, projectPlan } from "@/lib/billing";
import { getDayHourly, getPeriodStats, HOURLY_DAYS, parsePeriod, type PeriodPage, type PeriodStats } from "@/lib/period-stats";
import type { Project } from "@/lib/projects";
import { HourlyChart, PeriodChart } from "@/components/ui/hourly-chart";
import { GhostCard } from "@/components/ui/skeleton";
import { DispatcherNote } from "@/components/dispatcher-note";
import { buttonClass } from "@/components/ui/button";
import { ClickIcon, SearchIcon } from "@/components/ui/icons";
import { UpgradePanel, fmtCount } from "@/components/upgrade-panel";
import { cx, FOCUS_RING } from "@/components/ui/styles";

export const dynamic = "force-dynamic";

// One day, week or month on Google, opened by clicking the overview chart on
// Home (overview-chart.tsx periodHref). Paid plans see the whole breakdown:
// how the stretch did against the one before it, day by day (a week or a
// month), the pages people landed on and the searches that brought them.
// The free tier sees the stretch's own click count on the upgrade panel -
// the drill-down is "Advanced analytics", the same lock as the Queue.
// Data: lib/period-stats.ts, the same function get_period_stats serves.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY = 86_400_000;
const t0 = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const short = (d: string) => {
  const x = new Date(t0(d));
  return `${MONTHS[x.getUTCMonth()].slice(0, 3)} ${x.getUTCDate()}`;
};
const css = (v: Record<string, string | number>) => v as React.CSSProperties;
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-US"));

type Kind = "day" | "week" | "month" | "range";

function kindOf(from: string, to: string): Kind {
  const days = Math.round((t0(to) - t0(from)) / DAY) + 1;
  if (days === 1) return "day";
  if (days === 7) return "week";
  if (days >= 28 && days <= 31) return "month";
  return "range";
}

/** "Monday, November 9" / "Week of Nov 3 – Nov 9" / "Oct 11 – Nov 9". */
function titleOf(from: string, to: string, kind: Kind): string {
  if (kind === "day") {
    const d = new Date(t0(from));
    return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  if (kind === "week") return `Week of ${short(from)} – ${short(to)}`;
  return `${short(from)} – ${short(to)}`;
}

/** The same length of time just before / after, for the arrows. */
function shift(from: string, to: string, dir: -1 | 1): { from: string; to: string } {
  const len = t0(to) - t0(from) + DAY;
  return { from: iso(t0(from) + dir * len), to: iso(t0(to) + dir * len) };
}

const hrefOf = (p: { from: string; to: string }) => (p.from === p.to ? `/dashboard/period?from=${p.from}` : `/dashboard/period?from=${p.from}&to=${p.to}`);

export default async function PeriodPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireDashboard();
  const project = await getActiveProject();
  const q = await searchParams;
  const period = parsePeriod(q.from, q.to);

  if (!period) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <BackLink />
        <DispatcherNote
          kind="alert"
          title="I couldn't find that date."
          action={
            <Link href="/dashboard" className={buttonClass("secondary", "sm")}>
              Back to the overview
            </Link>
          }
        >
          Pick a day or a week straight from the chart on your overview and I&apos;ll open it.
        </DispatcherNote>
      </div>
    );
  }

  const { from, to } = period;
  const kind = kindOf(from, to);
  const unit = kind === "day" ? "day" : kind === "week" ? "week" : kind === "month" ? "month" : "stretch";
  const [plan, stats] = await Promise.all([projectPlan(project.id).catch(() => null), getPeriodStats(project.id, from, to).catch(() => null)]);
  const free = isFreePlan(plan);
  const prev = shift(from, to, -1);
  const next = shift(from, to, 1);
  const hasNext = t0(next.from) <= Date.now();
  const year = new Date(t0(to)).getUTCFullYear();

  const header = (
    <header className="arrive-up space-y-5" style={css({ "--at": "0ms" })}>
      <BackLink />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2rem]">{titleOf(from, to, kind)}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">
            <span>{year}</span>
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
            <span>{project.domain}</span>
            {!free && stats?.dayRank && stats.clicks > 0 && stats.dayRank.of > 1 ? <RankChip rank={stats.dayRank.rank} of={stats.dayRank.of} /> : null}
          </p>
        </div>
        <nav aria-label={`Other ${unit}s`} className="flex items-center gap-1 rounded-lg bg-canvas/70 p-0.5 ring-1 ring-line-soft">
          <Link href={hrefOf(prev)} scroll={false} className={cx("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink", FOCUS_RING)}>
            <Chevron dir="left" />
            {kind === "day" ? short(prev.from) : `Previous ${unit}`}
          </Link>
          {hasNext ? (
            <Link href={hrefOf(next)} scroll={false} className={cx("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink", FOCUS_RING)}>
              {kind === "day" ? short(next.from) : `Next ${unit}`}
              <Chevron dir="right" />
            </Link>
          ) : (
            <span aria-disabled="true" className="flex cursor-default items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-ink-faint/50">
              {kind === "day" ? short(next.from) : `Next ${unit}`}
              <Chevron dir="right" />
            </span>
          )}
        </nav>
      </div>
    </header>
  );

  if (free) {
    const n = stats?.clicks ?? 0;
    const when = kind === "day" ? `on ${short(from)}` : kind === "week" ? "that week" : "in that stretch";
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        {header}
        <UpgradePanel
          art="chart"
          stat={n > 0 ? fmtCount(n) : undefined}
          title={n > 0 ? `${n === 1 ? "person" : "people"} came from Google ${when}` : `See how every ${unit} did on Google`}
          note="See which articles brought them, what they searched for, and how it compares."
        />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        {header}
        <DispatcherNote kind="working" title="I'm having trouble reading these numbers right now.">
          Nothing is lost - they&apos;re stored safely, and they&apos;ll be back here shortly. Nothing for you to do.
        </DispatcherNote>
      </div>
    );
  }

  if (!stats.reportedDays) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        {header}
        <DispatcherNote
          kind="waiting"
          title={`Google hasn't sent me this ${unit} yet.`}
          className="arrive-up"
          style={css({ "--at": "80ms" })}
          action={
            <Link href={hrefOf(prev)} className={buttonClass("secondary", "sm")}>
              See the {unit} before
            </Link>
          }
        >
          Its numbers arrive two to three days late. I&apos;ll have them here the moment they land - no need to do anything.
        </DispatcherNote>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {header}
      <Figures s={stats} unit={unit} />
      {stats.days === 1 ? (
        <section aria-labelledby="hours-title" className="arrive-up space-y-4" style={css({ "--at": "140ms" })}>
          <h2 id="hours-title" className="text-xl font-semibold tracking-tight text-ink">
            Hour by hour
          </h2>
          <Suspense fallback={<GhostCard className="h-[22rem] rounded-2xl" />}>
            <Hours project={project} date={from} />
          </Suspense>
        </section>
      ) : null}
      {stats.days > 1 ? <DayChart s={stats} /> : null}
      <TopPages s={stats} unit={unit} />
      {stats.queries.length ? <Searches s={stats} /> : null}
      {stats.published.length ? <WentLive s={stats} unit={unit} /> : null}
      {stats.reportedDays < stats.days ? (
        <p className="text-[12.5px] text-ink-faint">
          Google has reported {stats.reportedDays} of these {stats.days} days so far; its numbers run two to three days behind.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** The hourly chart, streamed: stored hours (gsc_hourly, saved hourly by
 *  the hourly-gsc cron), with one quiet Google call only for a recent day
 *  not saved yet - so the rest of the page never waits on it. */
async function Hours({ project, date }: { project: Project; date: string }) {
  const res = await getDayHourly(project, date);
  if (res.state === "ok") {
    return res.hours.some((h) => h.impressions > 0 || h.clicks > 0) ? (
      <HourlyChart hours={res.hours} />
    ) : (
      <DispatcherNote kind="waiting" title="The hours for this day are still on their way.">
        Google sends hour-by-hour numbers a little after the fact. Check back later today and the chart will be here.
      </DispatcherNote>
    );
  }
  if (res.state === "tooOld") {
    const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    return (
      <DispatcherNote
        kind="asleep"
        title={`Google only keeps hours for ${HOURLY_DAYS} days.`}
        action={
          <Link href={`/dashboard/period?from=${yesterday}`} className={buttonClass("secondary", "sm")}>
            See yesterday by the hour
          </Link>
        }
      >
        This day is older than that, so I can only show it as a whole - the totals above and the articles below are all still here.
      </DispatcherNote>
    );
  }
  if (res.state === "noGoogle") {
    return (
      <DispatcherNote
        kind="alert"
        title="Connect Google and I'll show you every hour."
        action={
          <Link href="/google" className={buttonClass("primary", "sm")}>
            Connect Search Console
          </Link>
        }
      >
        It takes a minute, and then I can see when people find you through the day.
      </DispatcherNote>
    );
  }
  // pending: not saved yet. The hourly sync brings it on its own - nothing
  // for the owner to do, so no button (owner, 2026-11-10).
  return (
    <DispatcherNote kind="working" title="I'm collecting this day's hours from Google.">
      They land here on their own shortly - nothing for you to do. Everything else on this page is already up to date.
    </DispatcherNote>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard" className={cx("inline-flex items-center gap-1.5 rounded-sm text-[13px] font-medium text-ink-muted transition-colors hover:text-ink", FOCUS_RING)}>
      <Chevron dir="left" />
      Overview
    </Link>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

function RankChip({ rank, of }: { rank: number; of: number }) {
  const best = rank === 1;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ring-1 ring-inset",
        best ? "bg-ok-soft text-ok ring-ok/30" : "bg-surface-2 text-ink-muted ring-line-soft",
      )}
    >
      {best ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
        </svg>
      ) : null}
      {best ? "Your best day so far" : `#${rank} of ${of} days`}
    </span>
  );
}

function pct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** The four numbers, each against the same stretch just before. */
function Figures({ s, unit }: { s: PeriodStats; unit: string }) {
  const vs = s.previous ? (unit === "day" ? `vs ${short(s.previous.from)}` : `vs the ${unit} before`) : null;
  const items: Array<{ label: string; value: string; delta: number | null; tone?: "ok" | "info"; hint?: string }> = [
    { label: "People from Google", value: s.clicks.toLocaleString("en-US"), delta: s.previous ? pct(s.clicks, s.previous.clicks) : null, tone: "ok" },
    { label: "Times you showed up", value: s.impressions.toLocaleString("en-US"), delta: s.previous ? pct(s.impressions, s.previous.impressions) : null, tone: "info" },
    {
      label: "Clicked when seen",
      value: s.ctr == null ? "-" : `${(s.ctr * 100).toFixed(s.ctr < 0.1 ? 1 : 0)}%`,
      delta: null,
      hint: "Of everyone who saw you on Google",
    },
    {
      label: "Average spot",
      value: s.position == null ? "-" : `#${Math.max(1, Math.round(s.position))}`,
      delta: null,
      hint: "#1 is the top of Google",
    },
  ];
  return (
    <section aria-label="Totals" className="arrive-up overflow-hidden rounded-2xl border border-line-soft bg-surface" style={css({ "--at": "80ms" })}>
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={cx(
              "min-w-0 px-5 py-6 sm:px-7",
              i % 2 === 1 && "border-l border-line-soft",
              i >= 2 && "border-t border-line-soft lg:border-t-0",
              i === 2 && "lg:border-l",
            )}
          >
            <dt className="flex items-center gap-2 text-[13px] text-ink-muted">
              {it.tone ? <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full border-[1.5px]", it.tone === "ok" ? "border-ok" : "border-info")} /> : null}
              {it.label}
            </dt>
            <dd className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className={cx("font-semibold leading-none tracking-tight text-ink tabular-nums", i === 0 ? "text-[2.25rem]" : "text-[1.75rem]")}>{it.value}</span>
              {it.delta != null ? (
                <span className={cx("text-[13px] font-medium tabular-nums", it.delta > 0 ? "text-ok" : "text-ink-muted")}>
                  {it.delta === 0 ? "same" : `${it.delta > 0 ? "up" : "down"} ${Math.abs(it.delta)}%`}
                </span>
              ) : null}
            </dd>
            <dd className="mt-2 text-[12.5px] text-ink-faint">{it.delta != null && vs ? vs : (it.hint ?? " ")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A week or a month, day by day: the overview's chart - people green,
 *  times seen blue, the readout on hover - each point a day that opens its
 *  own page on click. Days Google hasn't reported yet (the last 2-3) aren't
 *  drawn; an unreported day in the middle reads as zero. */
function DayChart({ s }: { s: PeriodStats }) {
  const lastReported = s.daily.reduce((m, d, i) => (d.reported ? i : m), -1);
  const points = s.daily.map((d, i) => ({
    at: d.date,
    clicks: d.clicks,
    impressions: d.impressions,
    pending: i > lastReported,
    href: `/dashboard/period?from=${d.date}`,
  }));
  return (
    <section aria-labelledby="days-title" className="arrive-up space-y-4" style={css({ "--at": "140ms" })}>
      <h2 id="days-title" className="text-xl font-semibold tracking-tight text-ink">
        Day by day
      </h2>
      <PeriodChart points={points} unit="day" />
    </section>
  );
}

function TopPages({ s, unit }: { s: PeriodStats; unit: string }) {
  const max = Math.max(1, ...s.pages.map((p) => p.clicks || 0));
  const byImpr = s.pages.every((p) => p.clicks === 0);
  const maxImpr = Math.max(1, ...s.pages.map((p) => p.impressions));
  return (
    <section aria-labelledby="pages-title" className="arrive-up space-y-4" style={css({ "--at": "200ms" })}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 id="pages-title" className="text-xl font-semibold tracking-tight text-ink">
          Top articles
        </h2>
        <p className="text-[13px] text-ink-faint">Where people landed that {unit}</p>
      </div>
      {s.pages.length ? (
        <div className="overflow-hidden rounded-xl border border-line-soft bg-surface">
          <div aria-hidden="true" className="hidden grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_6rem_5.5rem] gap-4 border-b border-line-soft bg-canvas/30 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:grid">
            <span />
            <span>Page</span>
            <span className="text-right">Spot</span>
            <span className="text-right">Impressions</span>
            <span className="text-right">Clicks</span>
          </div>
          <ol className="divide-y divide-line-soft">
            {s.pages.map((p, i) => (
              <li key={p.path} className="arrive-up" style={css({ "--at": "260ms", "--i": i, "--step": "40ms" })}>
                <PageRow p={p} i={i} share={byImpr ? p.impressions / maxImpr : p.clicks / max} />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <DispatcherNote kind="asleep" title={`No page stood out on Google that ${unit}.`}>
          The people who came spread across pages too small to show one by one. A quiet {unit} - the next one is a fresh start.
        </DispatcherNote>
      )}
      {s.unattributed > 0 ? (
        <p className="text-[12.5px] text-ink-faint">
          {s.unattributed.toLocaleString("en-US")} more {s.unattributed === 1 ? "click" : "clicks"} went to pages too small to show in Google&apos;s daily top 100.
        </p>
      ) : null}
    </section>
  );
}

function PageRow({ p, i, share }: { p: PeriodPage; i: number; share: number }) {
  const name = p.title ?? (p.path === "/" ? "Home page" : p.path);
  const inner = (
    <>
      {/* Its share of the top page's clicks, as a slim line on the row's
          bottom edge. */}
      <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-r-full bg-ok/40 transition-colors group-hover:bg-ok/70" style={{ width: `${Math.max(1, share * 100)}%` }} />
      <span className="relative hidden text-right text-[13px] font-medium text-ink-faint tabular-nums sm:block">{i + 1}</span>
      <span className="relative min-w-0">
        <span className="block truncate text-[15px] font-medium text-ink transition-colors group-hover:text-ok" title={name}>
          {name}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-faint">
          {p.keyword ? (
            <>
              <SearchIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{p.keyword}</span>
            </>
          ) : (
            <span className="truncate">{p.path}</span>
          )}
        </span>
      </span>
      <span className="relative flex items-center gap-4 sm:contents">
        <span className="text-[13px] text-ink-muted tabular-nums sm:text-right">
          {p.position == null ? "-" : `#${Math.max(1, Math.round(p.position))}`}
          <span className="text-ink-faint sm:sr-only"> spot</span>
        </span>
        <span className="inline-flex items-center gap-1.5 sm:justify-end">
          <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
          <span className="text-[15px] font-semibold tracking-tight text-ink-muted tabular-nums">{compact(p.impressions)}</span>
          <span className="text-[13px] text-ink-faint sm:sr-only">{p.impressions === 1 ? "impression" : "impressions"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 sm:justify-end">
          <ClickIcon className={cx("h-4 w-4 shrink-0", p.clicks > 0 ? "text-ok" : "text-ink-faint")} />
          <span className={cx("text-[15px] font-semibold tracking-tight tabular-nums", p.clicks > 0 ? "text-ink" : "text-ink-muted")}>{p.clicks.toLocaleString("en-US")}</span>
          <span className="text-[13px] text-ink-faint sm:sr-only">{p.clicks === 1 ? "click" : "clicks"}</span>
        </span>
      </span>
    </>
  );
  const cls = cx(
    "group relative flex flex-col gap-1.5 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:grid sm:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_6rem_5.5rem] sm:items-center sm:gap-4 sm:px-5",
    FOCUS_RING,
  );
  return p.draftId ? (
    <Link href={`/articles/${p.draftId}`} className={cls}>
      {inner}
    </Link>
  ) : (
    <a href={p.url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  );
}

function Searches({ s }: { s: PeriodStats }) {
  const max = Math.max(1, ...s.queries.map((q) => q.clicks || q.impressions));
  return (
    <section aria-labelledby="searches-title" className="arrive-up space-y-4" style={css({ "--at": "260ms" })}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 id="searches-title" className="text-xl font-semibold tracking-tight text-ink">
          What people searched
        </h2>
        <p className="text-[13px] text-ink-faint">The searches you showed up for</p>
      </div>
      <ul className="grid gap-x-8 gap-y-1 rounded-xl border border-line-soft bg-surface p-3 sm:grid-cols-2 sm:p-4">
        {s.queries.map((q) => (
          <li key={q.query} className="relative overflow-hidden rounded-lg px-3 py-2.5">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-lg bg-info/[0.07]" style={{ width: `${Math.max(2, ((q.clicks || q.impressions) / max) * 100)}%` }} />
            <span className="relative flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink" title={q.query}>
                {q.query}
              </span>
              <span className="shrink-0 text-[12.5px] text-ink-faint tabular-nums">{q.position == null ? "" : `#${Math.max(1, Math.round(q.position))}`}</span>
              <span className="w-12 shrink-0 text-right text-[12.5px] text-ink-muted tabular-nums" title="Times seen">
                {compact(q.impressions)}
              </span>
              <span className={cx("w-8 shrink-0 text-right text-[13.5px] font-semibold tabular-nums", q.clicks > 0 ? "text-ink" : "text-ink-faint")} title="Clicks">
                {q.clicks}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-faint">Spot on Google, times seen, and clicks for each search.</p>
    </section>
  );
}

function WentLive({ s, unit }: { s: PeriodStats; unit: string }) {
  return (
    <section aria-labelledby="live-title" className="arrive-up space-y-4" style={css({ "--at": "320ms" })}>
      <h2 id="live-title" className="text-xl font-semibold tracking-tight text-ink">
        Went live that {unit}
      </h2>
      <ul className="space-y-2">
        {s.published.map((a) => {
          const body = (
            <>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink transition-colors group-hover:text-accent">{a.title}</span>
              <span className="shrink-0 text-[13px] text-ink-faint tabular-nums">{short(a.at.slice(0, 10))}</span>
            </>
          );
          const cls = cx("group flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-4 py-3 transition-colors hover:bg-surface-2", FOCUS_RING);
          return (
            <li key={`${a.draftId ?? a.url}-${a.at}`}>
              {a.draftId ? (
                <Link href={`/articles/${a.draftId}`} className={cls}>
                  {body}
                </Link>
              ) : a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className={cls}>
                  {body}
                </a>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
