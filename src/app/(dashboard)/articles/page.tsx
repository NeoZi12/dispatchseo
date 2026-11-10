import Link from "next/link";
import { Suspense } from "react";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import type { AutopilotArticle, AutopilotArticleStatus } from "@/lib/autopilot/report";
import { ArticleRowsSkeleton } from "@/components/ui/skeleton";
import { PixelDesk } from "@/components/pixel-dispatcher";
import { ArticleList, ReviewList, SortChips } from "@/components/ui/article-list";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";
import { Tabs } from "@/components/ui/tabs";
import { parseSort, sortArticles, toArticleRow } from "../article-status";
import { loadReport, redirectIfAgent } from "../mode";
import { loadGlances } from "./article-data";
import { warmScreenshotsLater } from "@/lib/page-screenshot";
import { listAwaitingReview } from "@/lib/article-review";
import { PublishModeMenu } from "@/components/publish-mode-switch";

export const dynamic = "force-dynamic";

// Every article the hosted writer has started, under status tabs, in the
// same list Home shows (components/ui/article-list.tsx): a row opens onto
// the facts that matter, and each article has its own page for the rest.
// Tabs and sort are both URL params, so either survives the other.
//
// Not behind requireOnboarded, same as Drafts: an article can be waiting on
// setup, and this is the screen that says so.

// `empty` is what an empty tab says, in people words.
const FILTERS: Array<{ key: string; label: string; statuses: AutopilotArticleStatus[] | null; empty: string }> = [
  { key: "all", label: "All", statuses: null, empty: "No articles yet" },
  { key: "live", label: "Live", statuses: ["published"], empty: "Nothing live yet" },
  { key: "progress", label: "In progress", statuses: ["writing", "verifying", "scheduled"], empty: "Nothing in progress right now" },
  { key: "waiting", label: "Waiting for you", statuses: ["review", "needs_setup"], empty: "Nothing waiting on you" },
  { key: "stopped", label: "Stopped", statuses: ["failed"], empty: "Nothing stopped" },
];

function withQuery(parts: string[]): string {
  const q = parts.filter(Boolean).join("&");
  return q ? `/articles?${q}` : "/articles";
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ status?: string; sort?: string; removed?: string; dropped?: string }> }) {
  await requireDashboard();
  await redirectIfAgent("/drafts");
  const project = await getActiveProject();
  const [report, awaiting] = await Promise.all([loadReport(project.id), listAwaitingReview(project.id).catch(() => [])]);
  // Any live article without a stored preview gets one after this response,
  // a few per visit, so opening it later never waits on a browser.
  if (report) warmScreenshotsLater(project.id, report.articles.filter((a) => a.status === "published" && a.url).map((a) => a.url!), 4, { onView: true });
  const { status, sort: sortParam, removed, dropped } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const sort = parseSort(sortParam);
  const sortQs = sort === "newest" ? "" : `sort=${sort}`;

  const all = report?.articles ?? [];
  // Articles waiting for review sit in their own section on top, so the
  // list under it leaves them out rather than show them twice. (If that
  // read failed the section is gone and they stay in the list.)
  const inSection = awaiting.length > 0;
  const shown = sortArticles((filter.statuses ? all.filter((a) => filter.statuses!.includes(a.status)) : all).filter((a) => !(inSection && a.status === "review")), sort);
  const reviewRows = awaiting.map((r) => ({ id: r.id, title: r.title, keyword: r.keyword, readyAt: r.readyAt, coverUrl: r.coverUrl, words: r.words }));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeading
        className="arrive-up"
        title="Articles"
        description="Everything the writer has started for this site. Open a row for the facts that matter, or the full page for everything."
        actions={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* How new articles go live (components/publish-mode-switch.tsx). */}
            <PublishModeMenu slug={project.slug} mode={project.publish_mode} waiting={awaiting.length} align="right" />
            <Link href="/queue" className="text-sm font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
              See the queue
            </Link>
          </span>
        }
      />

      {removed === "1" ? (
        // Landed here from "Remove from site" (autopilot-actions.ts): the
        // article is out of the list, so this is the one place that says so.
        <Callout tone="info" title="Removed from your site" role="status">
          The page leaves your site within a few minutes. Google is told it&apos;s gone and drops it over the next days.
        </Callout>
      ) : null}

      {dropped === "1" ? (
        // Landed here from "Don't publish" on a review article (autopilot-actions.ts).
        <Callout tone="info" title="Article dropped" role="status">
          It won&apos;t be published. The next article comes on your plan&apos;s schedule.
        </Callout>
      ) : null}

      {inSection ? <ReviewList items={reviewRows} /> : null}

      {!report ? (
        <Callout tone="warn" title="Articles didn't load" role="status">
          Writing and publishing carry on in the background. Reload in a minute.
        </Callout>
      ) : (
        <>
          <Tabs
            className="arrive-up"
            label="Filter articles"
            items={FILTERS.map((f) => ({
              // Switching tab keeps the sort; switching sort keeps the tab.
              href: withQuery([f.key === "all" ? "" : `status=${f.key}`, sortQs]),
              label: f.label,
              count: f.statuses ? all.filter((a) => f.statuses!.includes(a.status)).length : all.length,
              active: f.key === filter.key,
            }))}
          />

          <div className="arrive-up flex flex-wrap items-center justify-between gap-x-6 gap-y-3" style={{ "--at": "60ms" } as React.CSSProperties}>
            {shown.length > 1 ? <SortChips base="/articles" sort={sort} keep={{ status: filter.key === "all" ? undefined : filter.key }} /> : <span />}
            {filter.key === "all" && all.length >= 300 ? <p className="text-[13px] text-ink-faint">Showing the latest 300 articles.</p> : null}
          </div>

          {shown.length ? (
            // The rows' Google facts stream in; heading, tabs and sort don't wait.
            <Suspense fallback={<ArticleRowsSkeleton rows={Math.min(shown.length, 9)} />}>
              <Rows projectId={project.id} articles={shown} slug={project.slug} paused={Boolean(report.paused)} />
            </Suspense>
          ) : inSection && (filter.key === "all" || filter.key === "waiting") ? null : (
            <EmptyState title={all.length ? filter.empty : "No articles yet"} icon={<PixelDesk className="w-[150px]" />}>
              {all.length ? (
                <Link href="/articles" className="text-accent underline underline-offset-[3px]">
                  Show all articles
                </Link>
              ) : (
                "The first one appears here the moment writing starts."
              )}
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}

async function Rows({ projectId, articles, slug, paused }: { projectId: string; articles: AutopilotArticle[]; slug: string; paused: boolean }) {
  const glances = await loadGlances(projectId, articles);
  // Only the fields a row renders cross to the client (toArticleRow).
  return <ArticleList articles={articles.map(toArticleRow)} glances={glances} slug={slug} paused={paused} at={0} pageSize={30} />;
}
