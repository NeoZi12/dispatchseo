import type { TopRow, TrafficReport } from "@/lib/owner-analytics";
import type { Channel, VisitorsReport } from "@/lib/owner-visitors";
import { MetricChart } from "./area";
import { BarList, Panel, type BarRow } from "./bits";
import { delta, fmt, fullDate, rangeShort } from "./format";
import { SectionHead } from "./view";
import { VisitTable, type VisitRow } from "./visit-table";
import { countryLabel, KIND_COLOR } from "./visitor-labels";

// The top of /owner: visitors over time, then who they were - how they found
// the site, where they are, what they opened - then every visit, one row each.

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
      <h3 className="text-[13px] font-medium text-ink">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ChannelLabel({ name, kind }: { name: string; kind: Channel["kind"] }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[kind] }} aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}

const byVisitors = (list: TopRow[], label: (k: string) => string): BarRow[] =>
  list.map((r) => ({ key: r.key || "none", label: label(r.key), value: r.visitors }));

export function VisitorsSection({ t, v, who, now }: { t: TrafficReport; v: VisitorsReport | null; who: (id: string) => string; now: number }) {
  const partial = t.since != null && new Date(t.since).getTime() > t.from;
  // Before counting began there is nothing to draw: start the chart a day
  // before it (at least a week shown) instead of a month of flat zeros.
  const sinceIdx = partial ? t.days.findIndex((d) => d.day >= t.since!.slice(0, 10)) : 0;
  const start = sinceIdx > 0 ? Math.max(0, Math.min(sinceIdx - 1, t.days.length - 7)) : 0;
  const shown = t.days.slice(start);
  const before = t.previousDays.slice(start);
  const days = shown.map((d) => d.day);
  const visits: VisitRow[] = (v?.visits ?? []).slice(0, 300).map((x) => ({ ...x, who: x.userId ? who(x.userId) : null }));
  return (
    <Panel label="Visitors">
      <SectionHead
        title="Visitors"
        says="People who opened dispatchseo.com, and how they found it. Bots are counted apart."
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
            values: shown.map((d) => d.humanVisitors),
            previous: before.map((d) => d.humanVisitors),
            tone: "blue",
          },
          {
            key: "views",
            label: "Page views",
            total: fmt(t.totals.views),
            delta: delta(t.totals.views, t.previous.views),
            values: shown.map((d) => d.humanViews),
            previous: before.map((d) => d.humanViews),
            tone: "blue",
          },
          {
            key: "bots",
            label: "Bot requests",
            total: fmt(t.totals.botHits),
            delta: delta(t.totals.botHits, t.previous.botHits),
            values: shown.map((d) => d.botHits),
            previous: before.map((d) => d.botHits),
            tone: "gray",
          },
        ]}
        height={280}
      />

      <div className="grid gap-px border-t border-line-soft bg-line-soft md:grid-cols-2">
        <Detail title="How they found you">
          <BarList
            rows={(v?.channels ?? []).slice(0, 7).map((c) => ({ key: c.name, label: <ChannelLabel name={c.name} kind={c.kind} />, value: c.visits }))}
            empty="No visit yet."
          />
        </Detail>
        <Detail title="Countries">
          <BarList rows={byVisitors(t.countries, countryLabel).slice(0, 7)} empty="No country yet." />
        </Detail>
        <Detail title="Pages they opened">
          <BarList rows={t.pages.slice(0, 7).map((r) => ({ key: r.key, label: r.key || "/", value: r.views }))} total={t.totals.views} empty="No page view yet." />
        </Detail>
        <Detail title="Devices">
          <BarList rows={byVisitors(t.devices, (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1) : "Unknown")).slice(0, 7)} empty="Nothing yet." />
          {v?.campaigns.length ? (
            <>
              <h3 className="mt-7 text-[13px] font-medium text-ink">Tagged links (UTM)</h3>
              <div className="mt-4">
                <BarList rows={v.campaigns.slice(0, 5).map((c) => ({ key: c.name, label: c.name, value: c.visits }))} empty="" />
              </div>
            </>
          ) : null}
        </Detail>
      </div>

      <div className="border-t border-line-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 pb-1 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Every visit</h3>
          <p className="text-[12px] text-ink-faint">
            {v ? `${fmt(v.visits.length)} in ${rangeShort(t.range)}${v.capped ? " (newest only)" : ""} · one row per person per day` : "Could not read visits"}
          </p>
        </div>
        <VisitTable visits={visits} now={now} />
      </div>
    </Panel>
  );
}
