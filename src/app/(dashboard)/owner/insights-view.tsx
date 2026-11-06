import { cx } from "@/components/ui/styles";
import { isAi, type AiReport, type BotClass, type GoogleReport } from "@/lib/owner-insights";
import { MetricChart } from "./area";
import { BarList, Panel, StatCells } from "./bits";
import { ago, compact, delta, fmt, fullDate } from "./format";
import { SectionHead } from "./view";

// The AI and Google sections of /owner: one subject each, plain words.

const CLASS_DOT: Record<BotClass, string> = {
  live: "bg-ok",
  "ai-search": "bg-info",
  training: "bg-accent",
  search: "bg-ink-faint",
  seo: "bg-ink-faint",
  social: "bg-ink-faint",
  other: "bg-ink-faint",
};

export function AiSection({ a, now }: { a: AiReport; now: number }) {
  const people = a.referrals.reduce((n, r) => n + r.visits, 0);
  const aiBots = a.bots.filter((b) => isAi(b.cls));
  return (
    <Panel label="AI">
      <SectionHead
        title="AI"
        says="When ChatGPT, Claude, Perplexity and other AI read dispatchseo.com, and the people they send."
        note={a.since ? `Counting since ${fullDate(a.since)}` : "Nothing counted yet"}
      />
      <StatCells
        className="border-t-0"
        items={[
          { label: "Read it to answer someone", value: fmt(a.totals.live) },
          { label: "Indexed it for AI search", value: fmt(a.totals["ai-search"]) },
          { label: "Read it to train a model", value: fmt(a.totals.training) },
          { label: "People sent by an AI", value: fmt(people) },
        ]}
      />
      <div className="grid gap-px bg-line-soft lg:grid-cols-2">
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Which AI</h3>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" /> answering someone
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-info" aria-hidden="true" /> AI search
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> training
            </span>
          </p>
          <div className="mt-4">
            <BarList
              rows={aiBots.slice(0, 7).map((b) => ({
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
              empty="No AI has read the site yet."
            />
          </div>
        </div>
        <div className="bg-surface px-2 pb-4 pt-5 sm:px-3">
          <h3 className="px-3 text-[13px] font-medium text-ink">Latest AI visits</h3>
          {a.feed.length ? (
            <ol className="mt-2">
              {a.feed.slice(0, 8).map((f, i) => (
                <li key={`${f.at}-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", CLASS_DOT[f.cls])} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {f.bot} <span className="font-mono text-[12px] text-ink-faint">{f.path}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint" title={new Date(f.at).toUTCString()}>
                    {ago(f.at, now)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mx-3 mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">No AI visit yet.</p>
          )}
        </div>
      </div>
      {a.citations && a.citations.checks ? (
        <p className="border-t border-line-soft px-5 py-3.5 text-[12.5px] text-ink-faint sm:px-6">
          Cited in <span className="font-mono text-ink">{fmt(a.citations.cited)}</span> of <span className="font-mono text-ink">{fmt(a.citations.checks)}</span> AI answers we checked
          {a.citations.latest[0] ? (
            <>
              {" "}· latest: &ldquo;<span className="text-ink-muted">{a.citations.latest[0].query}</span>&rdquo; on {a.citations.latest[0].engine}
            </>
          ) : null}
        </p>
      ) : null}
    </Panel>
  );
}

export function GoogleSection({ g, hrefs }: { g: GoogleReport; hrefs: Record<string, string> }) {
  return (
    <Panel label="Google Search">
      <SectionHead
        title="Google Search"
        says="How often Google showed and sent people to dispatchseo.com, and what they searched."
        note={g.totals.position ? `Average position ${g.totals.position.toFixed(1)}` : undefined}
      />
      <MetricChart
        days={g.days}
        metrics={[
          { key: "clicks", label: "Clicks from Google", total: fmt(g.totals.clicks), delta: delta(g.totals.clicks, g.totals.prevClicks), values: g.clicks, previous: g.previousClicks, tone: "green" },
          { key: "impr", label: "Times shown on Google", total: compact(g.totals.impressions), delta: delta(g.totals.impressions, g.totals.prevImpressions), values: g.impressions, tone: "blue" },
        ]}
        height={200}
      />
      <div className="grid gap-px border-t border-line-soft bg-line-soft lg:grid-cols-2">
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">What people searched</h3>
          {g.queries.length ? (
            <table className="mt-3 w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
                  <th scope="col" className="pb-2 font-medium">Search</th>
                  <th scope="col" className="pb-2 text-right font-medium">Clicks</th>
                  <th scope="col" className="pb-2 text-right font-medium">Shown</th>
                </tr>
              </thead>
              <tbody>
                {g.queries.slice(0, 7).map((q) => (
                  <tr key={q.query} className="border-t border-line-soft">
                    <td className="max-w-0 py-2 pr-3">
                      <span className="block truncate text-ink" title={q.query}>
                        {q.query}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-ink">{fmt(q.clicks)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-ink-muted">{compact(q.impressions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">No search data in this range.</p>
          )}
        </div>
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Clicks from Google, every site</h3>
          <div className="mt-4">
            <BarList
              rows={g.sites.slice(0, 7).map((s) => ({ key: s.projectId, label: s.owner ? s.domain : `${s.domain} (yours)`, value: s.clicks }))}
              tone="green"
              hrefs={hrefs}
              empty="No site has Google data in this range."
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
