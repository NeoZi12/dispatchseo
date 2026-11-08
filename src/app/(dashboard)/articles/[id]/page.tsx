import { Suspense } from "react";
import { after } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LivePreview } from "./live-preview";
import { ArticleDetails, ArticleSearches, ArticleStats, articleSeries, hasSearchRows, loadSearches } from "./article-analytics";
import { ArticleChart } from "./article-chart";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import type { AutopilotArticle } from "@/lib/autopilot/report";
import { retryArticle } from "@/app/autopilot-actions";
import { ActionForm } from "@/components/ui/action-form";
import { ExternalIcon } from "@/components/ui/article-list";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { packDays } from "@/components/ui/overview-pack";
import { PipelineSteps } from "@/components/ui/pipeline-steps";
import { StatusPill } from "@/components/ui/status-pill";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { ARTICLE_STATUS, articleStep, fmtInt, longDate, statusLabel, stepLine, waitingOnMerge } from "../../article-status";
import { loadReport, redirectIfAgent } from "../../mode";
import { keywordStatsFor, loadGoneUrls, loadLedger, loadPageDays, type Check, type Ledger, type PageDay } from "../article-data";
import { normalizePageUrl } from "@/lib/metrics";
import { getProjectBySlug, type Project } from "@/lib/projects";
import { previewSrc, storedShotAt, warmScreenshots } from "@/lib/page-screenshot";
import { isOperator } from "@/lib/autopilot/operator";
import { friendlyError } from "@/lib/autopilot/friendly";
import { UpgradePanel, fmtCount } from "@/components/upgrade-panel";

export const dynamic = "force-dynamic";

// One article, read top to bottom in the order an owner asks about it: what
// it looks like (a preview of the page itself), what it is (title, the
// search it's for, when it went out), the one thing to do with it (open it,
// or fix / retry it), then how it does on Google (the chart carries clicks,
// impressions and its spot) and, folded shut, the claim-by-claim fact check
// with the quality score. Owner, 2026-11-05: no fact tiles, no "written
// before autopilot" card - a published date and the graphs; then
// "fewer colours, informative, to the point", a chart that starts the day it
// was published, and a preview that is the real page. Only real data: the
// per-page numbers are Search Console's (our stored daily top-100 pages when
// that read fails), the score and claims the draft's own validation, the
// preview a screenshot of the live page.

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;

export default async function ArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ site?: string }> }) {
  const auth = await requireDashboard();
  // Ids are UUIDs, but decode anyway: a param can arrive percent-encoded.
  const id = decodeURIComponent((await params).id);
  // ?site=<slug>: the operator opening another tenant's article (see
  // autopilot/operator.ts). Read-only - every action form
  // below posts to the ACTIVE project and refuses anything else - and only
  // for an id in OPERATOR_USER_IDS; anyone else gets their own site, exactly
  // as without the parameter.
  const site = (await searchParams).site;
  let project = await getActiveProject();
  let asOperator = false;
  if (site && site !== project.slug && isOperator(auth.user?.id)) {
    const other = await getProjectBySlug(site);
    if (other) {
      project = other;
      asOperator = true;
    }
  }
  if (!asOperator) await redirectIfAgent("/drafts");
  const report = await loadReport(project.id);
  // Scoped to the active project by construction: the report only holds its
  // articles, so another site's id is simply not found.
  const a = report?.articles.find((x) => x.draftId === id || x.runId === id);
  if (!report || !a) notFound();

  // "page:<id>" articles predate autopilot: no draft, so no ledger and no
  // cover (loadLedger returns null for them without querying).
  const hasDraft = Boolean(a.draftId) && !a.draftId.startsWith("page:");
  const live = a.status === "published";
  // Only database reads hold the page: the Search Console numbers stream in
  // below (AnalyticsSection), and the preview is a stored picture.
  const [ledger, goneUrls, shotAt] = await Promise.all([
    hasDraft ? loadLedger(project.id, a.draftId) : Promise.resolve(null),
    a.url ? loadGoneUrls(project.id) : Promise.resolve(new Set<string>()),
    live && a.url ? storedShotAt(project.id, a.url).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  // Known not to load any more: say so, and don't send anyone to it.
  const gone = a.url ? goneUrls.has(normalizePageUrl(a.url)) : false;
  const publishedAt = a.publishedAt ?? a.createdAt;
  // A month-old screenshot shows now and is re-taken after the response.
  if (live && a.url && !gone && shotAt && Date.now() - Date.parse(shotAt) > 30 * 86_400_000) {
    const url = a.url;
    after(() => warmScreenshots(project.id, [url], 1));
  }
  const s = ARTICLE_STATUS[a.status];
  const step = articleStep(a);
  const paused = Boolean(report.paused);
  const pill = gone ? (
    <StatusPill tone="neutral" className="text-[14px]">
      Gone
    </StatusPill>
  ) : (
    <StatusPill tone={s.tone} live={s.live} className="text-[14px]">
      {statusLabel(a)}
    </StatusPill>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <Link href="/articles" className="arrive-up inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All articles
      </Link>

      {/* ---- one card: what it is and the one thing to do, beside the page itself ---- */}
      <header className="arrive-in -mt-4 overflow-hidden rounded-3xl border border-line-soft bg-surface lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" style={at(0)}>
        <div className="arrive-up flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10" style={at(80)}>
          <div>{pill}</div>
          <h1 className="mt-4 text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2.15rem]">{a.title}</h1>
          {a.keyword ? (
            <p className="mt-4 text-[15px] text-ink-muted">
              Written for the search <span className="font-medium text-ink">&ldquo;{a.keyword}&rdquo;</span>
            </p>
          ) : null}
          <p className="mt-1.5 text-[15px] text-ink-muted">
            {live ? (
              <>
                Published <span className="font-medium text-ink">{longDate(a.publishedAt ?? a.createdAt)}</span>
              </>
            ) : (
              <>Started {longDate(a.createdAt)}</>
            )}
          </p>
          {asOperator ? (
            <p className="mt-6 text-[13px] text-ink-muted">
              Viewing {project.name} as the operator. Release it from the All sites strip on your Home.
            </p>
          ) : null}
          {!gone && !asOperator ? (
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <PrimaryAction a={a} slug={project.slug} paused={paused} />
            </div>
          ) : null}
        </div>

        {/* The page itself, on a quiet stage that runs to the card's edge. */}
        <div className="order-first flex items-center bg-surface-2/60 p-5 sm:p-8 lg:order-none lg:p-10">
          {live && a.url && !gone ? (
            // A screenshot of the live page in a browser frame, streamed in
            // so a slow capture never holds up the rest of the screen.
            <a href={a.url} target="_blank" rel="noopener noreferrer" aria-label="Open the live article" className={cx("group/frame block w-full rounded-xl", FOCUS_RING)}>
              <div className="overflow-hidden rounded-xl bg-surface shadow-xl shadow-black/20 ring-1 ring-line transition-transform duration-300 group-hover/frame:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/frame:translate-y-0">
                <div className="flex h-9 items-center gap-3 border-b border-line-soft bg-surface-2 px-3.5" aria-hidden="true">
                  <span className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-ink-faint/40" />
                    <span className="h-2.5 w-2.5 rounded-full bg-ink-faint/40" />
                    <span className="h-2.5 w-2.5 rounded-full bg-ink-faint/40" />
                  </span>
                  <span className="min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-1 text-center text-[12px] text-ink-muted">{displayUrl(a.url)}</span>
                </div>
                <div className="aspect-[16/10] w-full bg-surface-2">
                  {shotAt ? (
                    // Stored (page_screenshots): a plain image the browser
                    // loads and keeps; nothing to wait for here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewSrc(project.id, a.url, shotAt)}
                      alt=""
                      width={1280}
                      height={800}
                      decoding="async"
                      fetchPriority="high"
                      data-preview="screenshot"
                      className="block h-full w-full object-cover object-top"
                    />
                  ) : (
                    <Suspense fallback={<div className="h-full w-full animate-pulse bg-surface-2/60 motion-reduce:animate-none" />}>
                      {/* None stored yet: take it now (and store it). */}
                      <LivePreview projectId={project.id} url={a.url} title={a.title} store={shotAt === null} />
                    </Suspense>
                  )}
                </div>
              </div>
            </a>
          ) : hasDraft && ledger?.cover ? (
            // Not live yet: the article's cover. A plain <img>: the route is
            // dynamic and same-origin. alt is empty on purpose - the title
            // sits right beside it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/cover/${encodeURIComponent(a.draftId)}`}
              alt=""
              width={1200}
              height={630}
              decoding="async"
              className="block aspect-[1200/630] w-full rounded-xl bg-surface-2 object-cover shadow-xl shadow-black/20 ring-1 ring-line"
            />
          ) : (
            <div className="flex aspect-[1200/630] w-full items-center justify-center rounded-xl border border-dashed border-line bg-surface/60">{pill}</div>
          )}
        </div>
      </header>

      {step != null ? (
        <section aria-label="Where it is now" className="arrive-up rounded-2xl border border-accent/25 bg-accent-soft/40 p-5 sm:p-7" style={at(160)}>
          <PipelineSteps current={step} labels />
          <p className="mt-4 text-[15px] leading-relaxed text-ink">
            {waitingOnMerge(a)
              ? "It's written and checked, and waiting for a merge on GitHub. It goes live within minutes of the merge."
              : a.prUrl && a.prMerged
                ? "Its pull request is merged. It goes live as soon as your site's deploy finishes."
                : stepLine(step)}
          </p>
          {a.prUrl ? (
            <a href={a.prUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
              {waitingOnMerge(a) ? "Open the pull request to merge it" : "Open the pull request"}
              <ExternalIcon />
            </a>
          ) : null}
        </section>
      ) : null}

      {gone ? (
        <Callout tone="warn" title="This page doesn't load any more">
          It was live, and Google still remembers it, but the page no longer loads on your site. Its past numbers stay below.
        </Callout>
      ) : null}

      {a.status === "needs_setup" ? (
        <Callout tone="warn" title="Finished, with nowhere to publish">
          Choose where articles go and it goes out straight away.
        </Callout>
      ) : a.status === "failed" ? (
        <Callout tone="danger" title="The writer stopped this one">
          {/* Never the raw run error (that is get_writer_runs' job): the
              owner gets the sentence friendly.ts maps it to. */}
          {friendlyError(a.error) ?? "It couldn't finish with facts it could verify, so nothing was published."}
          {a.runStatus === "failed" && paused ? " Resume autopilot to try it again." : null}
        </Callout>
      ) : null}

      {a.source !== "agent" && (ledger?.angle || a.gain) ? <Angle angle={ledger?.angle ?? null} gain={a.gain} /> : null}

      {/* ---- how it does on Google: streamed, so a slow Search Console
          read never holds up the rest of the page ---- */}
      {live && report.plan.free && !asOperator ? (
        // Free tier: this article's Google breakdown comes with a plan; the
        // panel says how it is doing in one number (see UpgradePanel).
        <Suspense fallback={null}>
          <FreeArticleAnalytics projectId={project.id} url={a.url} />
        </Suspense>
      ) : live ? (
        <section aria-labelledby="article-analytics" className="space-y-5">
          <div className="arrive-up" style={at(240)}>
            <h2 id="article-analytics" className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              Article analytics
            </h2>
            <p className="mt-1 text-[15px] text-ink-muted">How it has done on Google since it was published on {longDate(publishedAt)}</p>
          </div>
          <Suspense fallback={<AnalyticsGhost />}>
            <AnalyticsSection project={project} url={a.url} keyword={a.keyword} publishedAt={publishedAt} />
          </Suspense>
        </section>
      ) : null}

      {a.source !== "agent" && ledger && (ledger.checks.length || ledger.sources.length) ? <FactCheck ledger={ledger} /> : null}
    </div>
  );
}

/** The numbers, the chart, the searches and the details: everything that
 *  asks Search Console about this one page (cached six hours a page), so it
 *  streams in after the rest of the page. */
async function AnalyticsSection({ project, url, keyword, publishedAt }: { project: Project; url: string | null; keyword: string | null; publishedAt: string | null }) {
  const [days, searches, keywordStats] = await Promise.all([
    url ? loadPageDays(project.id, url).catch(() => [] as PageDay[]) : Promise.resolve([] as PageDay[]),
    // Search Console about this one page (totals + the searches behind it);
    // null when Google isn't connected or the read fails.
    url ? loadSearches(project, url, publishedAt) : Promise.resolve(null),
    keywordStatsFor(project, keyword),
  ]);
  const series = articleSeries(days, searches, publishedAt);
  const everShown = series.some((d) => d.impressions > 0) || Boolean(searches && !searches.failed && searches.totals.impressions);
  if (!everShown) {
    return (
      <div className="arrive-up rounded-2xl border border-dashed border-line px-6 py-10 text-center" style={at(300)}>
        <p className="text-[16px] font-medium text-ink">Not on Google yet</p>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-muted">
          New pages usually take a few days to a few weeks to show up. Google&apos;s numbers also run two to three days behind. This fills in on its own.
        </p>
      </div>
    );
  }
  return (
    <>
      <ArticleStats series={series} searches={searches} />
      <ArticleChart daily={packDays(series)} />
      {hasSearchRows(searches) ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <ArticleSearches searches={searches} keyword={keyword} />
          <ArticleDetails series={series} publishedAt={publishedAt} keyword={keyword} keywordStats={keywordStats} searches={searches} url={url} />
        </div>
      ) : (
        // No searches listed (none yet, Google not connected, or the read
        // failed): no empty card about it, just the details.
        <ArticleDetails series={series} publishedAt={publishedAt} keyword={keyword} keywordStats={keywordStats} searches={searches} url={url} wide />
      )}
    </>
  );
}

/** A free-tier site's stand-in for the section above: the article's own
 *  totals from the same per-page history, and what a plan adds. */
async function FreeArticleAnalytics({ projectId, url }: { projectId: string; url: string | null }) {
  const days = url ? await loadPageDays(projectId, url).catch(() => [] as PageDay[]) : [];
  const impressions = days.reduce((sum, d) => sum + d.impressions, 0);
  const clicks = days.reduce((sum, d) => sum + d.clicks, 0);
  return (
    <UpgradePanel
      variant="section"
      delay={240}
      stat={impressions > 0 ? fmtCount(impressions) : undefined}
      title={impressions > 0 ? "impressions on Google since it went live" : "Not on Google yet"}
      note={impressions > 0 ? (clicks > 0 ? `${fmtCount(clicks)} ${clicks === 1 ? "person" : "people"} clicked through.` : undefined) : "New pages usually show up within one to three weeks."}
    />
  );
}

/** What the analytics look like while they load: the four tiles and the chart card. */
function AnalyticsGhost() {
  return (
    <div className="space-y-5 motion-safe:animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface px-5 py-5 sm:px-6">
            <div className="h-3.5 w-24 rounded bg-surface-3" />
            <div className="mt-3 h-7 w-16 rounded bg-surface-3" />
            <div className="mt-3 h-3 w-32 max-w-full rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="h-[22rem] rounded-2xl border border-line-soft bg-surface" />
    </div>
  );
}

/** host + path of a page, without the scheme, for the browser frame's address bar. */
function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** The one unmistakable button: open it if it's live, otherwise the action
 *  that moves it on. */
function PrimaryAction({ a, slug, paused }: { a: AutopilotArticle; slug: string; paused: boolean }) {
  if (a.status === "published" && a.url) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className={cx(
          "group inline-flex h-14 items-center gap-3 rounded-2xl bg-gradient-to-br from-accent-strong via-violet-600 to-indigo-600 px-7 text-[17px] font-semibold text-white shadow-lg shadow-accent-strong/30 ring-1 ring-inset ring-white/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent-strong/40 hover:brightness-110 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          FOCUS_RING,
        )}
      >
        Open the live article
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0">
          <ExternalIcon className="h-4 w-4" />
        </span>
      </a>
    );
  }
  if (a.status === "needs_setup") {
    return (
      <Link href="/settings?section=publishing" className={buttonClass("primary", "lg")}>
        Choose where articles go
      </Link>
    );
  }
  // A content park was the writer saying no on purpose (off-topic, too few
  // sources, still failing the fact check): a retry pays for the same no.
  if (a.runStatus === "failed" && a.failureKind !== "content" && a.runId && !paused) {
    return <ActionForm action={retryArticle} slug={slug} submitLabel="Try again" size="lg" hidden={{ run_id: a.runId }} className="[&_p:empty]:hidden" />;
  }
  return null;
}

/** The plan's angle in one line, and what it adds that page one lacks. */
function Angle({ angle, gain }: { angle: string | null; gain: string | null }) {
  return (
    <section aria-label="Angle" className="arrive-up max-w-3xl border-l-2 border-line pl-4" style={at(280)}>
      <p className="text-[13px] text-ink-muted">Angle</p>
      <p className="mt-1 line-clamp-2 text-[15px] leading-relaxed text-ink">{angle ?? gain}</p>
      {angle && gain ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
          <span className="text-ink-faint">What it adds: </span>
          {gain}
        </p>
      ) : null}
    </section>
  );
}

const VERDICT: Record<Check["verdict"], { word: string; tone: string; path: string }> = {
  supports: { word: "Matched a source", tone: "text-ok", path: "M5 12.5l4.5 4.5L19 7.5" },
  contradicts: { word: "A source disagrees", tone: "text-danger", path: "M7 7l10 10M17 7L7 17" },
  says_nothing: { word: "No source says this", tone: "text-ink-faint", path: "M7 12h10" },
};

/** Writer markdown in a claim, flattened to the sentence a reader sees. */
function plainClaim(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[-*#>\s]+/, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/** Every checked claim and the sources read, folded shut: there when you
 *  want to audit it, out of the way when you don't. */
function FactCheck({ ledger }: { ledger: Ledger }) {
  const n = ledger.checks.length;
  return (
    <details className="group arrive-up rounded-2xl border border-line-soft bg-surface" style={at(360)}>
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-surface-2/50 group-open:rounded-b-none sm:px-6 [&::-webkit-details-marker]:hidden",
          FOCUS_RING,
        )}
      >
        <span className="text-[15px] font-medium text-ink">
          {n ? `Fact check (${fmtInt(n)} ${n === 1 ? "claim" : "claims"})` : `Sources (${fmtInt(ledger.sources.length)})`}
        </span>
        <span className="flex items-center gap-3 text-[13px] text-ink-muted">
          {ledger.score != null ? <span className="tabular-nums">Quality {Math.max(0, Math.min(100, Math.round(ledger.score)))}/100</span> : null}
          {n ? <span className="tabular-nums">{fmtInt(ledger.checks.filter((c) => c.verdict === "supports").length)} matched</span> : null}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>

      <div className="border-t border-line-soft">
        {n ? (
          <ol className="divide-y divide-line-soft">
            {ledger.checks.map((c, i) => {
              const v = VERDICT[c.verdict];
              return (
                <li key={i} className="flex gap-3 px-5 py-3.5 sm:px-6">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={cx("mt-[3px] h-4 w-4 shrink-0", v.tone)} aria-hidden="true">
                    <path d={v.path} />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-relaxed text-ink">
                      <span className="sr-only">{v.word}: </span>
                      {plainClaim(c.claim)}
                    </p>
                    {c.source ? (
                      <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[12.5px] text-ink-faint hover:text-accent">
                        <span className="truncate">{c.source.host}</span>
                        <ExternalIcon className="h-3 w-3 shrink-0" />
                      </a>
                    ) : c.verdict !== "supports" ? (
                      <p className="mt-0.5 text-[12.5px] text-ink-faint">{v.word}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}

        {ledger.sources.length ? (
          <div className={cx("px-5 py-4 sm:px-6", n ? "border-t border-line-soft bg-canvas/40" : "")}>
            {n ? <p className="text-[13px] text-ink-muted">Sources it read</p> : null}
            <ul className={cx("flex flex-wrap gap-x-5 gap-y-2", n ? "mt-2.5" : "")}>
              {ledger.sources.map((src) => (
                <li key={src.url} className="min-w-0 max-w-full">
                  <a href={src.url} target="_blank" rel="noopener noreferrer" title={src.title ?? src.url} className="inline-flex max-w-full items-center gap-2 text-[13.5px] text-ink hover:text-accent">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(src.host)}&sz=32`} alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 shrink-0 rounded-sm" />
                    <span className="truncate">{src.host}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
