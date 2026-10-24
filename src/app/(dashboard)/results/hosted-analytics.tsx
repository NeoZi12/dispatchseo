import Link from "next/link";
import { getActiveProject } from "@/lib/active-project";
import { unstable_cache } from "next/cache";
import { getAnalyticsOverview } from "@/lib/analytics-data";
import { gscTag } from "@/lib/autopilot/report";
import type { Project } from "@/lib/projects";
import { gscFreshnessNote } from "@/lib/metrics";
import { RankingsTable, fmtInt, fmtPct } from "@/components/seo-cards";
import { pagePath, type SitePageRow } from "@/lib/metrics";
import { loadGoneUrls } from "../articles/article-data";
import { LandedTable, QueriesTable } from "./tables";
import { PixelDesk } from "@/components/pixel-dispatcher";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CardHeader } from "@/components/ui/card-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";
import { Stat } from "@/components/ui/stat";
import { packDays } from "@/components/ui/overview-pack";
import { OverviewChart } from "@/components/ui/overview-chart";
import { StatGrid } from "@/components/ui/stat-grid";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadReport } from "../mode";
import { articleHref } from "../article-status";

// Hosted-mode Analytics (the agent dashboard's /analytics route renders this
// for a hosted project; /results redirects here): is the writing working? Google's numbers for the
// whole site - the same overview card as Home (people from Google, times
// seen, articles live, any range), then where they landed, what they
// searched and where the site ranks. The agent-mode equivalent is
// /analytics. Arrives the way Home does (globals.css "Arrival").

const at = (ms: number, i = 0, step?: number) =>
  ({ "--at": `${ms}ms`, "--i": i, ...(step ? { "--step": `${step}ms` } : {}) }) as React.CSSProperties;

/** What this screen shows from the Analytics loader, and only that, cached
 *  10 minutes per project (tag gsc:<id>). The loader's raw 28 days of
 *  per-page JSON (~450 KB) stays out of the cache; the folded tables, the
 *  rankings and the light daily series go in. Neither the live 24h numbers
 *  nor the domain rating are fetched - this screen shows neither. */
function analyticsData(project: Project) {
  return unstable_cache(
    async () => {
      const o = await getAnalyticsOverview(project, { fresh24: false, dr: false });
      return {
        domain: o.domain,
        lastDate: o.gsc.at(-1)?.date ?? null,
        daily: o.gscDaily.map((d) => ({ date: d.date, clicks: d.clicks ?? 0, impressions: d.impressions ?? 0 })),
        totals: o.totals,
        breakdown: { rows: o.breakdown.rows },
        topQueries: o.topQueries,
        rankings: o.rankings,
        rankingCount: o.rankingCount,
      };
    },
    ["hosted-analytics", project.id],
    { revalidate: 600, tags: [gscTag(project.id)] },
  )();
}

export async function HostedAnalytics() {
  const project = await getActiveProject();
  // The Google tables, the report (articles-live half) and page liveness,
  // side by side.
  const [o, report, goneUrls] = await Promise.all([analyticsData(project), loadReport(project.id), loadGoneUrls(project.id)]);
  const gscNote = gscFreshnessNote(project.gsc_site_url, o.lastDate);
  const connected = Boolean(project.gsc_site_url);
  // Pages we track that no longer load, by path (the table's key).
  const gone = new Set([...goneUrls].map((u) => pagePath(u)));
  const published = (report?.articles ?? [])
    .filter((a) => a.status === "published" && a.publishedAt)
    .map((a) => ({ at: a.publishedAt!, title: a.title, href: articleHref(a) }));

  return (
    <div className="mx-auto max-w-5xl space-y-14">
      <PageHeading className="arrive-up" title="Analytics" description={`Who Google sends to ${o.domain}, and what they searched for.`} />

      {!connected ? (
        <EmptyState
          icon={<PixelDesk className="w-[150px]" />}
          title="Connect Google to see who finds you"
          action={
            <Link href="/google" className={buttonClass("primary")}>
              Connect Search Console
            </Link>
          }
        >
          How many people Google sends you, what they searched for and where you rank. Read-only, from Google Search Console.
        </EmptyState>
      ) : (
        <>
          {gscNote ? <Callout tone="warn" title={gscNote} role="status" /> : null}

          {/* The big number and its chart before any table. */}
          <OverviewChart
            daily={packDays(o.daily)}
            published={published}
            publishedCapped={(report?.articles.length ?? 0) >= 50}
          />

          <section aria-label="Last 28 days" className="arrive-up" style={at(880)}>
            <StatGrid cols={2} className="sm:max-w-xl">
              <Stat label="Of everyone who saw you, clicked" value={fmtPct(o.totals.ctr)} hint="Last 28 days." />
              <Stat
                label="Your usual spot"
                value={o.totals.avgPosition == null ? "-" : `#${Math.max(1, Math.round(o.totals.avgPosition))}`}
                hint="Last 28 days. #1 is the top of Google."
              />
            </StatGrid>
          </section>

          <section aria-labelledby="pages-title" className="arrive-up space-y-4" style={at(960)}>
            <CardHeader id="pages-title" title="Where they landed" description="The pages on your site people opened from Google." />
            <LandedTable rows={o.breakdown.rows.map((r) => ({ path: r.path, url: r.url, title: r.title, clicks: r.clicks, impressions: r.impressions, position: r.avgPosition, gone: gone.has(r.path) }))} />
          </section>

          <section aria-labelledby="queries-title" className="arrive-up space-y-4" style={at(1040)}>
            <CardHeader id="queries-title" title="What they searched" description="What people typed into Google before they found you." />
            {o.topQueries.length ? (
              <QueriesTable rows={o.topQueries.map((q) => ({ query: q.query, clicks: q.clicks, position: q.position }))} />
            ) : (
              <EmptyState title="No searches yet" icon={<PixelDesk className="w-[150px]" />}>
                Google&apos;s reports run two to three days behind. They fill in on their own.
              </EmptyState>
            )}
          </section>

          <section aria-labelledby="rankings-title" className="arrive-up space-y-4" style={at(1120)}>
            <CardHeader
              id="rankings-title"
              title="Where you rank"
              description={
                o.rankings.length ? `${o.rankingCount} of the ${o.rankings.length} searches we track find you somewhere in Google's top 100.` : undefined
              }
            />
            <RankingsTable rankings={o.rankings} limit={25} />
          </section>
        </>
      )}
    </div>
  );
}
