import Link from "next/link";
import { unstable_cache } from "next/cache";
import { gscTag } from "@/lib/autopilot/report";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/active-project";
import { planAllowsTools, type Tier } from "@/lib/billing";
import { aggregatePageTraffic, normalizePageUrl, type GscPageStat } from "@/lib/metrics";
import { isKnownGone } from "@/lib/page-liveness";
import { PixelDesk } from "@/components/pixel-dispatcher";
import { ExternalIcon } from "@/components/ui/article-list";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";
import { longDate } from "../article-status";
import { loadReport } from "../mode";

// Hosted-mode Tools: the site's interactive pages (a calculator, a
// generator, a checker - each built for one search people make). Tools are
// a Growth / Scale feature (planAllowsTools), so a Starter site gets an
// honest page saying what they are and how to get them - no fake numbers.
// On a plan with tools: every live tool as a card with its own Google
// numbers for the last 28 days and a line of its daily clicks. Reads only;
// the get_pages MCP tool already covers the same rows.

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;

type ToolRow = { id: string; url: string; title: string | null; primary_keyword: string | null; published_at: string | null; created_at: string; live_at?: string | null; live_checked_at?: string | null };

export async function HostedTools() {
  const project = await getActiveProject();
  const report = await loadReport(project.id);
  const plan = report?.plan;
  // No tier at all (self-host, billing unconfigured) is no plan gate.
  const tier = plan && plan.tier !== "none" ? (plan.tier as Tier) : null;
  const unbilled = plan ? plan.status === "self-host" || plan.status === "unbilled" : true;
  const allowed = unbilled || (tier != null && planAllowsTools(tier));

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeading className="arrive-up" title="Tools" description="Small free tools on your site, each built for one thing people search for." />
      {allowed ? <ToolList projectId={project.id} /> : <Upsell />}
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
        db().from("pages").select("*").eq("project_id", projectId).eq("type", "tool").order("created_at", { ascending: false }),
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

async function ToolList({ projectId }: { projectId: string }) {
  const data = await toolData(projectId);
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

const EXAMPLES = [
  {
    name: "A calculator",
    line: "For searches like “how much does it cost to…”. Visitors type their numbers and get their answer on the spot.",
    d: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 7h10M7 12h2M11 12h2M15 12h2M7 16h2M11 16h2M15 16h2",
  },
  {
    name: "A generator",
    line: "For searches like “… template”. It builds the thing for them, ready to copy.",
    d: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8",
  },
  {
    name: "A checker",
    line: "For searches like “is my … right”. Paste it in, get a clear verdict and what to fix.",
    d: "M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  },
];

/** Starter: what tools are, and the one way to get them. */
function Upsell() {
  return (
    <>
      <section className="arrive-up grid items-center gap-8 rounded-2xl border border-line-soft bg-surface p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]" style={at(60)}>
        <div className="min-w-0">
          <h2 className="text-balance text-[1.6rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.9rem]">Tools bring in people articles can&apos;t</h2>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">
            Some searches want a tool, not an article: a calculator, a generator, a checker. About once a month we build one for your site, made for one
            of those searches, and it publishes like an article does. It&apos;s the kind of page people bookmark and link to.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link href="/billing#plans" className={buttonClass("primary", "lg")}>
              Upgrade to get tools
            </Link>
            <span className="text-[14px] text-ink-muted">Included in Growth and Scale.</span>
          </div>
        </div>
        <PixelDesk className="mx-auto w-[200px] md:w-[230px]" />
      </section>

      <section aria-labelledby="examples-title" className="space-y-4">
        <h2 id="examples-title" className="arrive-up text-[15px] font-semibold tracking-tight text-ink" style={at(160)}>
          The kind of tools we build
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {EXAMPLES.map((e, i) => (
            <li key={e.name} className="arrive-up rounded-2xl border border-line-soft bg-surface p-5" style={at(220, i)}>
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d={e.d} />
                </svg>
              </span>
              <p className="mt-4 text-[15px] font-semibold text-ink">{e.name}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{e.line}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
