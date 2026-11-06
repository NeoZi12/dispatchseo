import { cx } from "@/components/ui/styles";
import { BOT_CLASS_LABEL, isAi, type AiReport, type BotClass, type GoogleReport } from "@/lib/owner-insights";
import { MetricChart } from "./area";
import { BarList, Panel, PanelHead, StatCells } from "./bits";
import { ago, compact, delta, fmt, fullDate, pct } from "./format";

// The AI and Google panels of /owner.

const CLASS_DOT: Record<BotClass, string> = {
  live: "bg-ok",
  "ai-search": "bg-info",
  training: "bg-accent",
  search: "bg-ink-faint",
  seo: "bg-ink-faint",
  social: "bg-ink-faint",
  other: "bg-ink-faint",
};

export function AiPanel({ a, now }: { a: AiReport; now: number }) {
  const aiTotal = a.totals.live + a.totals["ai-search"] + a.totals.training;
  const people = a.referrals.reduce((n, r) => n + r.visits, 0);
  const aiBots = a.bots.filter((b) => isAi(b.cls));
  const otherBots = a.bots.filter((b) => !isAi(b.cls));
  return (
    <Panel label="AI">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-soft px-5 py-3 text-[12.5px] sm:px-6">
        <span className="font-medium text-ink">AI and dispatchseo.com</span>
        <span className="text-ink-faint">{a.since ? `Crawlers recorded since ${fullDate(a.since)}` : "Nothing recorded yet"}</span>
      </div>
      <MetricChart
        days={a.days}
        metrics={[
          { key: "live", label: "Read for a person", total: fmt(a.totals.live), delta: null, values: a.live, tone: "green", kind: "bars" },
          { key: "search", label: "AI search index", total: fmt(a.totals["ai-search"]), delta: null, values: a.aiSearch, tone: "blue", kind: "bars" },
          { key: "training", label: "AI training", total: fmt(a.totals.training), delta: null, values: a.training, tone: "violet", kind: "bars" },
          { key: "llms", label: "llms.txt reads", total: fmt(a.llmsReads), delta: null, values: a.llms, tone: "gray", kind: "bars" },
        ]}
        height={170}
      />
      <StatCells
        items={[
          { label: "AI reads, all kinds", value: fmt(aiTotal) },
          { label: "People sent by AI", value: fmt(people) },
          { label: "Cited in AI answers", value: a.citations ? `${fmt(a.citations.cited)} of ${fmt(a.citations.checks)}` : "–" },
          { label: "Search engines", value: fmt(a.totals.search) },
        ]}
      />
      <div className="grid gap-px bg-line-soft lg:grid-cols-3">
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Which AI</h3>
          <p className="mt-1 text-[12px] text-ink-faint">Green read a page live for someone. Blue indexes for AI search. Violet trains models.</p>
          <div className="mt-4">
            <BarList
              rows={aiBots.slice(0, 8).map((b) => ({
                key: b.name,
                label: (
                  <span className="flex items-center gap-2">
                    <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", CLASS_DOT[b.cls])} aria-hidden="true" />
                    {b.name}
                  </span>
                ),
                value: b.hits,
              }))}
              tone="violet"
              empty="No AI crawler yet."
            />
          </div>
        </div>
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Pages AI reads</h3>
          <div className="mt-4">
            <BarList rows={a.pages.map((p) => ({ key: p.path, label: p.path, value: p.hits }))} tone="violet" empty="No page read by AI yet." />
          </div>
          <h3 className="mt-7 text-[13px] font-medium text-ink">People sent by AI answers</h3>
          <div className="mt-4">
            <BarList rows={a.referrals.map((r) => ({ key: r.name, label: r.name, value: r.visits }))} tone="green" empty="No visit from an AI answer yet." />
          </div>
        </div>
        <div className="bg-surface px-3 pb-4 pt-5 sm:px-4">
          <h3 className="px-2 text-[13px] font-medium text-ink">Live AI reads</h3>
          {a.feed.length ? (
            <ol className="mt-2">
              {a.feed.map((f, i) => (
                <li key={`${f.at}-${i}`} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", CLASS_DOT[f.cls])} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{f.bot}</span>
                    <span className="block truncate font-mono text-[11.5px] text-ink-faint">{f.path}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint" title={new Date(f.at).toUTCString()}>
                    {ago(f.at, now)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mx-2 mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">No AI crawler yet.</p>
          )}
        </div>
      </div>
      {a.citations && a.citations.latest.length ? (
        <div className="border-t border-line-soft px-5 py-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Latest AI answers that cited dispatchseo.com</h3>
          <ul className="mt-3 space-y-2">
            {a.citations.latest.map((c, i) => (
              <li key={i} className="flex items-baseline gap-3 text-[13px]">
                <span className="w-20 shrink-0 text-ink-faint">{c.engine}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{c.query}</span>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint">{ago(c.at, now)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {otherBots.length ? (
        <div className="border-t border-line-soft px-5 py-4 sm:px-6">
          <p className="text-[12px] text-ink-faint">
            Other crawlers:{" "}
            {(["search", "seo", "social", "other"] as BotClass[])
              .filter((k) => a.totals[k])
              .map((k) => `${BOT_CLASS_LABEL[k]} ${compact(a.totals[k])}`)
              .join(" · ")}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

export function GooglePanel({ g, hrefs }: { g: GoogleReport; hrefs: Record<string, string> }) {
  const ctr = g.totals.impressions ? (g.totals.clicks / g.totals.impressions) * 100 : 0;
  return (
    <Panel label="Google Search">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-soft px-5 py-3 text-[12.5px] sm:px-6">
        <span className="font-medium text-ink">Google Search · dispatchseo.com</span>
        <span className="text-ink-faint">From Search Console, full history</span>
      </div>
      <MetricChart
        days={g.days}
        metrics={[
          { key: "clicks", label: "Clicks", total: fmt(g.totals.clicks), delta: delta(g.totals.clicks, g.totals.prevClicks), values: g.clicks, previous: g.previousClicks, tone: "green" },
          { key: "impr", label: "Impressions", total: compact(g.totals.impressions), delta: delta(g.totals.impressions, g.totals.prevImpressions), values: g.impressions, tone: "blue" },
          { key: "ctr", label: "Click rate", total: `${ctr.toFixed(1)}%`, delta: null, values: g.clicks.map((c, i) => (g.impressions[i] ? Math.round((c / g.impressions[i]) * 1000) / 10 : 0)), tone: "gray" },
          { key: "pos", label: "Avg position", total: g.totals.position ? g.totals.position.toFixed(1) : "–", delta: null, values: g.positions, tone: "gray" },
        ]}
        height={190}
      />
      <div className="grid gap-px bg-line-soft lg:grid-cols-2">
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">What people search to find it</h3>
          {g.queries.length ? (
            <table className="mt-3 w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
                  <th scope="col" className="pb-2 font-medium">Query</th>
                  <th scope="col" className="pb-2 text-right font-medium">Clicks</th>
                  <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">Impr.</th>
                  <th scope="col" className="pb-2 text-right font-medium">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {g.queries.map((q) => (
                  <tr key={q.query} className="border-t border-line-soft">
                    <td className="max-w-0 py-2 pr-3">
                      <span className="block truncate text-ink" title={q.query}>
                        {q.query}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-ink">{fmt(q.clicks)}</td>
                    <td className="hidden py-2 text-right font-mono tabular-nums text-ink-muted sm:table-cell">{compact(q.impressions)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-ink-muted">{q.position ? q.position.toFixed(1) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">No query data in this range.</p>
          )}
        </div>
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Google clicks, every site</h3>
          <p className="mt-1 text-[12px] text-ink-faint">Yours and your customers&apos;. The share is of all clicks across sites.</p>
          <div className="mt-4">
            <BarList
              rows={g.sites.slice(0, 10).map((s) => ({ key: s.projectId, label: s.owner ? `${s.domain}` : `${s.domain} (yours)`, value: s.clicks }))}
              tone="green"
              hrefs={hrefs}
              empty="No site has Google data in this range."
            />
          </div>
          <p className="mt-4 text-[12px] text-ink-faint">
            {fmt(g.sites.reduce((n, s) => n + s.clicks, 0))} clicks across {fmt(g.sites.length)} sites ·{" "}
            {pct(g.totals.clicks, g.sites.reduce((n, s) => n + s.clicks, 0))} to dispatchseo.com
          </p>
        </div>
      </div>
    </Panel>
  );
}
