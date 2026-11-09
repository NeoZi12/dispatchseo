import { cx } from "@/components/ui/styles";
import type { AiReport, BotClass, EngineRow, GoogleReport } from "@/lib/owner-insights";
import { MetricChart } from "./area";
import { BarList, Panel } from "./bits";
import { ago, compact, delta, fmt, fullDate, shortDate } from "./format";
import { EngineLogo } from "./engine-logos";
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
  // Before counting began there is nothing to draw: start the chart a day
  // before the first crawler row (at least a week shown), like Visitors does.
  const sinceDay = a.since?.slice(0, 10) ?? null;
  const partial = sinceDay != null && a.days.length > 0 && sinceDay > a.days[0];
  const sinceIdx = partial ? a.days.findIndex((d) => d >= sinceDay) : 0;
  const start = sinceIdx > 0 ? Math.max(0, Math.min(sinceIdx - 1, a.days.length - 7)) : 0;
  const cut = (xs: number[]) => xs.slice(start);
  const reads = a.totals.live + a.totals["ai-search"] + a.totals.training;
  const checks = a.citations?.checks ?? 0;
  const cited = a.citations?.cited ?? 0;
  return (
    <Panel id="ai" label="AI visibility">
      <SectionHead
        title="AI visibility"
        says="Whether ChatGPT, Claude, Perplexity and Google AI read dispatchseo.com, send people here, and name us in their answers."
        note={a.since ? <span className={partial ? "text-warn" : undefined}>Counting since {fullDate(a.since)}</span> : "Nothing counted yet"}
      />
      <MetricChart
        days={a.days.slice(start)}
        metrics={[
          {
            key: "reads",
            label: "Times an AI read the site",
            total: fmt(reads),
            delta: delta(reads, a.prev.reads),
            values: cut(a.reads),
            previous: cut(a.prevReads),
            tone: "violet",
          },
          {
            key: "people",
            label: "People sent by an AI",
            total: fmt(a.people),
            delta: delta(a.people, a.prev.people),
            values: cut(a.peopleDaily),
            previous: cut(a.prevPeopleDaily),
            tone: "green",
            kind: "bars",
          },
          {
            key: "named",
            label: "AI answers that named us",
            total: checks ? `${fmt(cited)} of ${fmt(checks)}` : "–",
            delta: null,
            values: cut(a.citedDaily),
            tone: "blue",
            kind: "bars",
          },
        ]}
        height={200}
      />
      <EngineBoard rows={a.engines} />
      <div className="grid gap-px border-t border-line-soft bg-line-soft lg:grid-cols-2">
        <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
          <h3 className="text-[13px] font-medium text-ink">Pages AI read most</h3>
          <div className="mt-4">
            <BarList rows={a.pages.slice(0, 7).map((p) => ({ key: p.path, label: p.path, value: p.hits }))} tone="violet" empty="No AI has read a page yet." />
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
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-3 text-[12px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" /> read live for a person
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-info" aria-hidden="true" /> indexed for AI search
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> read for training
            </span>
          </p>
        </div>
      </div>
      <ChecksNote a={a} />
    </Panel>
  );
}

/** One row per AI: read us, read live for a person, sent people, named us.
 *  The same shape as Home's top-posts rows: name with a faint subline, fixed
 *  right-hand numbers over tiny labels, colour only where we were named. */
function EngineBoard({ rows }: { rows: EngineRow[] }) {
  return (
    <div className="border-t border-line-soft px-5 pb-4 pt-5 sm:px-6">
      <h3 className="text-[13px] font-medium text-ink">Each AI, this range</h3>
      <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-faint">
        Read: its crawlers fetched our pages. For a person: fetched live while answering someone. Sent: people who clicked through from its answer. Named us: of the answers we
        checked, how many cited dispatchseo.com.
      </p>
      <ol className="-mx-3 mt-3">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-4 rounded-xl px-3 py-3 sm:gap-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3/70 text-ink-muted" aria-hidden="true">
              <EngineLogo engine={r.key} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-ink">{r.name}</span>
              <span className="mt-0.5 block truncate text-[12px] text-ink-faint" title={r.bots.join(", ")}>
                {r.bots.length ? r.bots.join(" · ") : `${r.who} · no crawler visit in this range`}
              </span>
            </span>
            <Figure value={fmt(r.reads)} label="Read" quiet={!r.reads} />
            <Figure value={fmt(r.live)} label="For a person" quiet={!r.live} hide />
            <Figure value={fmt(r.people)} label="Sent people" quiet={!r.people} hide />
            <Figure
              value={r.checks ? `${fmt(r.cited)} / ${fmt(r.checks)}` : "–"}
              label="Named us"
              quiet={!r.checks}
              ok={r.cited > 0}
              wide
              title={r.checks ? `${fmt(r.cited)} of ${fmt(r.checks)} answers checked${r.lastChecked ? `, last on ${fullDate(r.lastChecked)}` : ""}` : "Not checked in this range"}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Figure({ value, label, quiet, ok, hide, wide, title }: { value: string; label: string; quiet?: boolean; ok?: boolean; hide?: boolean; wide?: boolean; title?: string }) {
  return (
    <span className={cx("shrink-0 text-right", wide ? "w-24" : "w-16 sm:w-20", hide && "hidden sm:block")} title={title}>
      <span className={cx("block text-[1.125rem] font-semibold leading-7 tabular-nums", ok ? "text-ok" : quiet ? "text-ink-faint" : "text-ink-muted")}>{value}</span>
      <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint">{label}</span>
    </span>
  );
}

/** Where the "named us" numbers come from, in one honest line: which engines
 *  were actually asked in this range, and which were not. */
function ChecksNote({ a }: { a: AiReport }) {
  const named = a.engines.filter((e) => e.key !== "other");
  const asked = named.filter((e) => e.checks);
  const silent = named.filter((e) => !e.checks);
  if (!asked.length && !silent.length) return null;
  return (
    <div className="space-y-1.5 border-t border-line-soft px-5 py-3.5 text-[12.5px] text-ink-faint sm:px-6">
      <p>
        {asked.length ? (
          <>
            Answers checked:{" "}
            {asked.map((e, i) => (
              <span key={e.key}>
                {i > 0 ? ", " : ""}
                <span className="text-ink-muted">{e.name}</span> <span className="font-mono tabular-nums text-ink">{fmt(e.checks)}</span>
                {e.lastChecked ? ` (last ${shortDate(e.lastChecked)})` : ""}
              </span>
            ))}
            .{" "}
          </>
        ) : (
          "No AI answer was checked in this range. "
        )}
        {silent.length ? <>{silent.map((e) => e.name).join(" and ")} answers are not sampled in this range.</> : null}
      </p>
      {a.citations?.latest.length ? (
        <p>
          Named us for:{" "}
          {a.citations.latest.slice(0, 3).map((c, i) => (
            <span key={`${c.at}-${c.query}`}>
              {i > 0 ? " · " : ""}
              &ldquo;<span className="text-ink-muted">{c.query}</span>&rdquo; on {ENGINE_NAME[c.engine] ?? c.engine}, {shortDate(c.at)}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

const ENGINE_NAME: Record<string, string> = {
  google_ai_overview: "Google AI Overview",
  claude: "Claude",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

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
