import { unstable_cache } from "next/cache";
import { gscTag } from "@/lib/autopilot/report";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/active-project";
import { aggregatePageTraffic, normalizePageUrl, type GscPageStat } from "@/lib/metrics";
import { isKnownGone } from "@/lib/page-liveness";
import { PixelDesk } from "@/components/pixel-dispatcher";
import { ExternalIcon } from "@/components/ui/article-list";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";
import { longDate } from "../article-status";

// Hosted-mode Tools: the site's interactive pages (a calculator, a
// generator, a checker - each built for one search people make). The
// hosted writer doesn't build tools yet, and no plan sells them (owner,
// 2026-11-05: they'll come back on the bigger plans later). So a site that
// already has tools (the operator's own, built in agent mode) keeps its
// list - every live tool as a card with its own Google numbers for the last
// 28 days and a line of its daily clicks - and every other site gets one
// honest line: not available yet. No upgrade button, since no plan has
// them. Reads only; the get_pages MCP tool already covers the same rows.

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;

type ToolRow = { id: string; url: string; title: string | null; primary_keyword: string | null; published_at: string | null; created_at: string; live_at?: string | null; live_checked_at?: string | null };

type ToolData = Awaited<ReturnType<typeof toolData>>;

export async function HostedTools() {
  const project = await getActiveProject();
  // One read, handed down: the list used to ask the cache a second time
  // for the same rows. A failed read shows the list's own error path, not
  // "not available".
  const data = await toolData(project.id).catch(() => null);
  const has = data === null || data.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeading className="arrive-up" title="Tools" description="Small free tools on your site, each built for one thing people search for." />
      {has ? <ToolList projectId={project.id} data={data} /> : <NotYet />}
    </div>
  );
}

/** The tools and each one's last 28 days, folded to what the cards show:
 *  totals and a daily clicks series per tool. The raw rows behind it are
 *  28 days of per-page JSON, so the folded result is cached 10 minutes per
 *  project (tag gsc:<id>); a failed read isn't cached. */
function toolData(projectId: string) {
  return unstable_cache(
    async () => {
      const [pagesRes, gscRes] = await Promise.all([
        db().from("pages").select("id, url, title, primary_keyword, published_at, created_at, live_at, live_checked_at").eq("project_id", projectId).eq("type", "tool").order("created_at", { ascending: false }),
        db().from("gsc_stats").select("date, top_pages").eq("project_id", projectId).order("date", { ascending: false }).limit(28),
      ]);
      if (pagesRes.error) throw new Error(`could not read tools: ${pagesRes.error.message}`);
      const tools = (pagesRes.data ?? []) as ToolRow[];
      const days = ((gscRes.data ?? []) as Array<{ date: string; top_pages: GscPageStat[] | null }>).reverse();
      const traffic = aggregatePageTraffic(days);
      return tools.map((t) => {
        const key = normalizePageUrl(t.url);
        return {
          tool: t,
          traffic: traffic.get(key) ?? null,
          series: days.map((d) => (d.top_pages ?? []).filter((p) => normalizePageUrl(p.page) === key).reduce((sum, p) => sum + (p.clicks ?? 0), 0)),
        };
      });
    },
    ["hosted-tools", projectId],
    { revalidate: 600, tags: [gscTag(projectId)] },
  )();
}

async function ToolList({ projectId, data: given }: { projectId: string; data: ToolData | null }) {
  // null = the first read failed; this one throws to the page's error path.
  const data = given ?? (await toolData(projectId));
  const tools = data.map((d) => d.tool);

  if (!tools.length) {
    return (
      <EmptyState title="No tools yet" icon={<PixelDesk className="w-[150px]" />} className="arrive-up">
        Tools arrive about once a month. Each one shows up here when it&apos;s live, with the people it brings in.
      </EmptyState>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {data.map(({ tool: t, traffic: tr, series }, i) => {
        // Known not to load: a page made in the last two weeks just hasn't
        // gone live yet; anything older (or with Google traffic) was live
        // and is gone. Neither gets a link.
        const dead = isKnownGone(t);
        const fresh = Date.now() - Date.parse(t.created_at) < 14 * 86_400_000 && !(tr?.impressions ?? 0);
        const deadWord = dead ? (fresh ? "Not live yet" : "Gone") : null;
        let path = t.url;
        try {
          path = new URL(t.url).pathname;
        } catch {}
        return (
          <li key={t.id} className="arrive-up flex flex-col rounded-2xl border border-line-soft bg-surface p-5 sm:p-6" style={at(80, i)}>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <ToolGlyph />
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold leading-snug text-ink">{t.title ?? path}</p>
                <p className="mt-0.5 truncate text-[13px] text-ink-faint">
                  {path}
                  {deadWord ? <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-muted">{deadWord}</span> : null}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[13px] text-ink-muted">
              {deadWord === "Gone" ? "No longer loads on your site. Its past numbers stay." : deadWord ? "Waiting to go live on your site." : `Live since ${longDate(t.live_at ?? t.published_at ?? t.created_at)}`}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
              <Num label="People" value={tr ? tr.clicks.toLocaleString("en-US") : "0"} />
              <Num label="Seen on Google" value={tr ? tr.impressions.toLocaleString("en-US") : "0"} />
              <Num label="Spot" value={tr?.avgPosition != null ? `#${Math.max(1, Math.round(tr.avgPosition))}` : "-"} />
            </dl>
            <Spark values={series} at={300 + i * 70} />
            <p className="mt-1 text-[12px] text-ink-faint">People from Google, last 28 days</p>
            {dead ? null : (
              <a href={t.url} target="_blank" rel="noopener noreferrer" className={`${buttonClass("secondary", "sm")} mt-5 self-start`}>
                Open the tool
                <ExternalIcon />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12px] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-[1.25rem] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** A tool's daily clicks as one quiet line that draws in. */
function Spark({ values, at: delay }: { values: number[]; at: number }) {
  if (values.length < 2) return <div className="mt-5 h-10" />;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(36 - (v / max) * 32).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-5 h-10 w-full overflow-visible" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--color-ok)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="arrive-wipe" style={{ "--at": `${delay}ms` } as React.CSSProperties} />
    </svg>
  );
}

function ToolGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v2" />
    </svg>
  );
}


/** Starter: what tools are, and the one way to get them. */
function NotYet() {
  return (
    <section className="arrive-up grid items-center gap-8 rounded-2xl border border-line-soft bg-surface p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]" style={at(60)}>
      <div className="min-w-0">
        <h2 className="text-balance text-[1.6rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.9rem]">Tools aren&apos;t available yet</h2>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">
          Interactive tools, like a calculator or a generator built for one search people make, aren&apos;t part of DispatchSEO right now. Your articles
          keep coming as usual.
        </p>
      </div>
      <PixelDesk className="mx-auto w-[200px] md:w-[230px]" />
    </section>
  );
}
