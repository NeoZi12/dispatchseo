import Link from "next/link";
import { Suspense } from "react";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import type { AutopilotArticle, AutopilotArticleStatus } from "@/lib/autopilot/report";
import { ArticleRowsSkeleton } from "@/components/ui/skeleton";
import { PixelDesk } from "@/components/pixel-dispatcher";
import { ArticleList, SortChips } from "@/components/ui/article-list";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";
import { Tabs } from "@/components/ui/tabs";
import { parseSort, sortArticles } from "../article-status";
import { loadReport, redirectIfAgent } from "../mode";
import { loadGlances } from "./article-data";

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
  { key: "waiting", label: "Waiting for you", statuses: ["held", "needs_setup"], empty: "Nothing waiting on you" },
  { key: "stopped", label: "Stopped", statuses: ["failed"], empty: "Nothing stopped" },
];

function withQuery(parts: string[]): string {
  const q = parts.filter(Boolean).join("&");
  return q ? `/articles?${q}` : "/articles";
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ status?: string; sort?: string }> }) {
  await requireDashboard();
  await redirectIfAgent("/drafts");
  const project = await getActiveProject();
  const report = await loadReport(project.id);
  const { status, sort: sortParam } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const sort = parseSort(sortParam);
  const sortQs = sort === "newest" ? "" : `sort=${sort}`;

  const all = report?.articles ?? [];
  const shown = sortArticles(filter.statuses ? all.filter((a) => filter.statuses!.includes(a.status)) : all, sort);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeading className="arrive-up" title="Articles" description="Everything the writer has started for this site. Open a row for the facts that matter, or the full page for everything." />

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
            {filter.key === "all" && all.length >= 50 ? <p className="text-[13px] text-ink-faint">Showing the latest 50 articles.</p> : null}
          </div>

          {shown.length ? (
            // The rows' Google facts stream in; heading, tabs and sort don't wait.
            <Suspense fallback={<ArticleRowsSkeleton rows={Math.min(shown.length, 9)} />}>
              <Rows projectId={project.id} articles={shown} slug={project.slug} paused={Boolean(report.paused)} />
            </Suspense>
          ) : (
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
  return <ArticleList articles={articles} glances={glances} slug={slug} paused={paused} at={0} />;
}
