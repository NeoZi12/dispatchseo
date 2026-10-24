import Link from "next/link";
import { Suspense } from "react";
import type { Project } from "@/lib/projects";
import type { AutopilotReport } from "@/lib/autopilot/report";
import type { OverviewData } from "./overview-data";
import { pauseAutopilot, resumeAutopilot, suggestTopicAction } from "@/app/autopilot-actions";
import { PixelDesk, type DispatcherMood } from "@/components/pixel-dispatcher";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { DispatcherButton } from "@/components/ui/dispatcher-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { JourneyBar } from "@/components/ui/journey-bar";
import { OnAir } from "@/components/ui/on-air";
import { packDays } from "@/components/ui/overview-pack";
import { OverviewChart, type OverviewDay } from "@/components/ui/overview-chart";
import { PageHeading } from "@/components/ui/page-heading";
import { SiteIcon } from "@/components/ui/site-icon";
import { StatusPill } from "@/components/ui/status-pill";
import { ArticleList, SortChips } from "@/components/ui/article-list";
import { ArticleRowsSkeleton } from "@/components/ui/skeleton";
import { MonthBoard, type CalCard } from "@/components/ui/month-board";
import { ARTICLE_STATUS, articleHref, articleStep, dayDate, inProgress, parseSort, shortDate, sortArticles, statusLabel, stepLine } from "../article-status";
import { loadGlances } from "../articles/article-data";
import { setupGaps } from "../mode";
import { TOPIC_LIMITS } from "@/lib/autopilot/controls";
import type { CronHealth } from "@/lib/cron-alerts";
import { siteIssueLine } from "@/lib/autopilot/friendly";
import type { OperatorSite } from "@/lib/autopilot/operator";

// The hosted-mode Home, modelled on Polar's overview: the numbers are the
// main event, and everything is readable in three seconds.
//
//   header    the site (its own favicon), plan, "Autopilot on", and the
//             journey road under it - where the site is on the usual SEO
//             timeline. The dispatcher sits small at its desk to the right,
//             typing or dozing, with Pause / Resume under it: the autopilot
//             IS this guy. When it has something to say an amber "!"
//             appears over its head and clicking it opens the message.
//   overview  one card: people from Google as the big number and the big
//             chart (7 days to all time), times seen on Google and articles
//             live as the two halves under it
//   setup     only while something is unfinished
//   this month the calendar: articles on their days, queued topics dashed
//             on the days they're due
//   articles  title, one status word, date, clicks
//   up next   the queue, and a box to suggest a topic
//
// It arrives rather than appears (globals.css "Arrival"): header, road,
// card, the chart drawing itself, then the week and the rows, all inside
// ~1.5s. After that only the dispatcher moves.

const LINK = "font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";
const DAY = 86_400_000;
const at = (ms: number, i = 0, step?: number) =>
  ({ "--at": `${ms}ms`, "--i": i, ...(step ? { "--step": `${step}ms` } : {}) }) as React.CSSProperties;

function planLabel(plan: AutopilotReport["plan"]): string | null {
  const tier = plan.tier?.trim();
  if (!tier || tier === "none") return null;
  const name = tier.charAt(0).toUpperCase() + tier.slice(1);
  return plan.status === "trialing" ? `${name} trial` : `${name} plan`;
}

type Message = { title: string; sub: string | null; link?: { href: string; label: string }; resume?: boolean };

// What the dispatcher has to tell the owner, or null when nothing needs
// them. Only things the owner can act on qualify - "an article is being
// written" is news the scene already shows (it's typing).
function messageOf(r: AutopilotReport, gaps: ReturnType<typeof setupGaps>): Message | null {
  if (r.articles.some((a) => a.status === "needs_setup")) {
    return {
      title: "An article is finished, with nowhere to publish.",
      sub: "Choose where articles go and it goes out straight away.",
      link: { href: "/settings?section=publishing", label: "Choose where articles go" },
    };
  }
  if (r.plan.articlesPerWeek === 0) {
    return { title: "Your plan isn't active, so no new articles start.", sub: null, link: { href: "/billing", label: "Open billing" } };
  }
  const blocking = gaps.find((g) => !g.done && g.blocksPublishing);
  if (blocking) {
    return {
      title: "Articles can't go out yet.",
      sub: blocking.detail,
      link: blocking.href ? { href: blocking.href, label: blocking.title } : undefined,
    };
  }
  if (r.paused) {
    return {
      title: `I'm paused, since ${shortDate(r.paused.at)}.`,
      sub: `${r.paused.reason} Nothing new starts until you resume; anything finished still publishes.`,
      resume: true,
    };
  }
  return null;
}

/** What the dispatcher is doing at its desk: the scene says the state. */
function moodOf(r: AutopilotReport): DispatcherMood {
  if (r.paused) return "paused";
  return inProgress(r.articles).length ? "working" : "idle";
}

const dayOf = (t: number) => Math.floor(t / DAY) * DAY;

/** This month's calendar cards. Live articles sit on the day they went
 *  live; anything happening now (being written, waiting for you) sits on
 *  today; a stopped one on the day it started. Queued topics are dashed on
 *  the days they're due: the first on the scheduler's next slot, the rest
 *  spaced by the plan's cadence (two a week = every 3-4 days). */
function monthCards(r: AutopilotReport, now: number): { cards: CalCard[]; today: number; monthName: string; liveThisMonth: number } {
  const today = dayOf(now);
  const d = new Date(now);
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  const inMonth = (t: number) => t >= first && t <= last;
  const cards: CalCard[] = [];
  for (const a of [...r.articles].reverse()) {
    const s = ARTICLE_STATUS[a.status];
    const step = articleStep(a);
    const day =
      a.status === "published" && a.publishedAt
        ? dayOf(Date.parse(a.publishedAt))
        : step != null || s.attention
          ? today
          : a.status === "failed"
            ? dayOf(Date.parse(a.createdAt))
            : null;
    if (day == null || !inMonth(day)) continue;
    cards.push({
      key: a.draftId || a.runId || a.createdAt,
      day,
      title: a.title,
      word: statusLabel(a),
      tone: s.tone,
      live: s.live,
      step,
      stepText: step != null ? stepLine(step) : undefined,
      // Every card opens the article's own page (in flight: its steps first).
      href: articleHref(a) ?? undefined,
    });
  }
  if (!r.paused && r.nextArticleAt && r.plan.articlesPerWeek > 0) {
    const spacing = Math.max(1, Math.round(7 / r.plan.articlesPerWeek));
    const start = Math.max(today, dayOf(Date.parse(r.nextArticleAt)));
    const titles = r.ideas.nextTitles.length ? r.ideas.nextTitles : ["A fresh topic from the research queue"];
    titles.forEach((title, i) => {
      const day = start + i * spacing * DAY;
      if (inMonth(day)) cards.push({ key: `next-${i}`, day, title, word: "Up next", tone: "neutral", upcoming: true });
    });
  }
  return {
    cards,
    today,
    monthName: d.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
    liveThisMonth: cards.filter((c) => c.tone === "ok").length,
  };
}

export type ReportFlags = { msg: string | null; gsc: string | null; sort?: string | null };

export async function HostedReport({
  project,
  report,
  overview,
  now,
  flags,
  siteIssues = [],
  operatorSites = null,
}: {
  project: Project;
  report: AutopilotReport | null;
  /** criticalCronIssues for THIS site (getCronHealth scoped to its slug):
   *  the autopilot's own health row, its pause row and its articles' way
   *  out. Before 2026-10-24 the hosted Home rendered none of them, so a site
   *  whose articles had stopped looked exactly like a healthy quiet week. */
  siteIssues?: CronHealth[];
  /** Every hosted site's issues, for the operator only
   *  (OPERATOR_USER_IDS); null for everyone else. */
  operatorSites?: OperatorSite[] | null;
  /** Journey + Google's daily series (overview-data.ts), loaded alongside
   *  the report; null when it failed - the report's 90 days still chart. */
  overview: OverviewData | null;
  now: number;
  flags: ReportFlags;
}) {
  if (!report) {
    return (
      <div className="mx-auto max-w-5xl space-y-10">
        <PageHeading title={project.name} meta={<DomainLink domain={project.domain} />} />
        <Callout tone="warn" title="The report didn't load" role="status">
          Your articles keep writing and publishing in the background. Reload in a minute; if this stays, tell us on the{" "}
          <Link href="/feedback" className={LINK}>
            feedback page
          </Link>
          .
        </Callout>
      </div>
    );
  }

  const r = report;
  const google = overview ?? { journey: null, daily: r.traffic.days };
  const plan = planLabel(r.plan);
  // A lapsed plan also reads as "no keyword source" (platform data needs an
  // active plan); the plan message already covers it, so no second card.
  const gaps = setupGaps({ ...r.setup, keywordSource: r.plan.articlesPerWeek === 0 ? undefined : r.setup.keywordSource });
  const missing = gaps.filter((g) => !g.done);
  const message = messageOf(r, gaps);
  const month = monthCards(r, now);
  const sort = parseSort(flags.sort ?? undefined);
  const recent = sortArticles(r.articles, sort).slice(0, 8);
  const published = r.articles
    .filter((a) => a.status === "published" && a.publishedAt)
    .map((a) => ({ at: a.publishedAt!, title: a.title, href: articleHref(a) }));
  const tally = {
    live: month.liveThisMonth,
    writing: inProgress(r.articles).length,
    waiting: r.articles.filter((a) => ARTICLE_STATUS[a.status].attention).length,
  };
  const pauseControl = r.paused ? (
    <ActionForm action={resumeAutopilot} slug={project.slug} submitLabel="Resume autopilot" size="sm" className="[&_p:empty]:hidden" />
  ) : (
    <ActionForm action={pauseAutopilot} slug={project.slug} submitLabel="Pause autopilot" variant="secondary" size="sm" className="[&_p:empty]:hidden" />
  );

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      {/* ---- header: the site, and where it is on the road ----
          A phone gets the name on a row of its own (never truncated), then
          the plan line beside the dispatcher, then the road. From sm the
          dispatcher takes a column of its own, sitting at the end of the
          road. relative z-10: the dispatcher's message opens down over the
          sections below, so the header has to stack above them (and stays
          under the sticky top bar, z-20, when scrolled). */}
      <header className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-6 lg:gap-x-12">
        <div className="arrive-up col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1 sm:col-start-1 sm:row-start-1" style={at(0)}>
          <SiteIcon domain={project.domain} />
          <h1 className="min-w-0 break-words text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:truncate sm:text-[2rem]">{project.name}</h1>
        </div>
        <div className="arrive-up col-start-1 row-start-2 -mt-3 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2 self-start text-[13px] text-ink-muted" style={at(0, 1)}>
          <DomainLink domain={project.domain} />
          {plan ? <Badge>{plan}</Badge> : null}
          <OnAir on={!r.paused}>{r.paused ? "Paused" : "Autopilot on"}</OnAir>
        </div>

        {/* The dispatcher at its desk, the autopilot's switch right under
            it. Its once-a-session walk-in is decided in the component. */}
        <div
          className="arrive-in col-start-2 row-start-2 flex flex-col items-center gap-2 justify-self-end sm:row-span-3 sm:row-start-1 sm:self-end"
          style={at(300)}
        >
          <DispatcherButton mood={moodOf(r)} steam={r.thisWeek.published > 0}>
            {message ? <DispatcherMessage message={message} slug={project.slug} /> : null}
          </DispatcherButton>
          {pauseControl}
        </div>

        {google.journey ? <JourneyBar journey={google.journey} className="col-span-2 row-start-3 sm:col-span-1 sm:col-start-1" /> : null}
      </header>

      {flags.gsc ? (
        flags.gsc === "connected" ? (
          <Callout tone="ok" role="status" title="Google Search Console is connected">
            Traffic lands with the next sync. Google&apos;s own data runs two to three days behind.
          </Callout>
        ) : (
          <Callout tone="danger" role="alert" title="Google Search Console didn't connect" action={<Link href="/google" className={buttonClass("secondary", "sm")}>Try again</Link>}>
            {flags.gsc}
          </Callout>
        )
      ) : null}
      {flags.msg ? (
        <Callout tone="warn" role="status" title="Something needs a look">
          {flags.msg}
        </Callout>
      ) : null}

      {operatorSites ? <OperatorStrip sites={operatorSites} /> : null}

      <SiteIssues issues={siteIssues.filter((h) => !(r.paused && h.job.startsWith("autopilot-pause--")))} />

      {/* ---- the main event ---- */}
      <OverviewChart
        daily={packDays(google.daily.length ? google.daily : r.traffic.days)}
        published={published}
        publishedCapped={r.articlesTruncated}
        connectAction={
          r.setup.google ? undefined : (
            <Link href="/google" className={buttonClass("primary", "md")}>
              Connect Search Console
            </Link>
          )
        }
      />

      {missing.length ? <SetupChecklist gaps={gaps} /> : null}

      {/* ---- this month ---- */}
      <section aria-labelledby="week-title" className="space-y-5">
        <div className="arrive-up flex flex-wrap items-end justify-between gap-x-8 gap-y-3" style={at(880)}>
          <div>
            <h2 id="week-title" className="text-xl font-semibold tracking-tight text-ink">
              This month <span className="font-normal text-ink-faint">{month.monthName}</span>
            </h2>
            {r.plan.articlesPerWeek > 0 ? (
              <p className="mt-1 text-[14px] text-ink-muted">
                {r.plan.articlesPerWeek} {r.plan.articlesPerWeek === 1 ? "article" : "articles"} a week on your plan, researched, fact-checked and published for you.
              </p>
            ) : null}
          </div>
          {/* The month in counts, each with its word - no legend. */}
          <p className="flex flex-wrap gap-x-5 gap-y-1.5">
            <StatusPill tone="ok" className="text-[14px]">
              {tally.live} live
            </StatusPill>
            {tally.writing ? (
              <StatusPill tone="active" live className="text-[14px]">
                {tally.writing} being written
              </StatusPill>
            ) : null}
            {tally.waiting ? (
              <StatusPill tone="warn" className="text-[14px]">
                {tally.waiting} waiting for you
              </StatusPill>
            ) : null}
          </p>
        </div>
        <MonthBoard cards={month.cards} today={month.today} at={940} />
      </section>

      {/* ---- articles: the same list as the Articles page, latest 8 ---- */}
      <section aria-labelledby="articles-title" className="scroll-mt-24 space-y-4">
        <CardHeader
          id="articles-title"
          title="Articles"
          description="Open one for the facts that matter. Clicks are people Google sent in the last 28 days."
          className="arrive-up"
          action={
            r.articles.length ? (
              <Link href="/articles" className={buttonClass("ghost", "sm")}>
                All articles
              </Link>
            ) : null
          }
        />
        {recent.length ? (
          <>
            {r.articles.length > 1 ? <SortChips base="/dashboard" sort={sort} anchor="articles-title" className="arrive-up" /> : null}
            {/* Below the fold: streams in after the overview, so its
                per-article Google reads never hold up the top of the page. */}
            <Suspense fallback={<ArticleRowsSkeleton rows={recent.length} />}>
              <HomeArticles projectId={project.id} articles={recent} slug={project.slug} paused={Boolean(r.paused)} />
            </Suspense>
          </>
        ) : (
          <EmptyState title="No articles yet" icon={<PixelDesk className="w-[150px]" />}>
            {r.paused
              ? "Resume autopilot and the first one starts on the next run."
              : r.nextArticleAt
                ? `The first one starts ${dayDate(r.nextArticleAt, now)} and shows up here the moment writing starts.`
                : "The first one shows up here the moment writing starts, with its status at every step."}
          </EmptyState>
        )}
      </section>

      {/* ---- up next ---- */}
      <section aria-labelledby="next-title" className="arrive-up grid gap-8 border-t border-line pt-10 lg:grid-cols-2 lg:gap-14" style={at(1250)}>
        <div>
          <CardHeader
            id="next-title"
            title="Up next"
            description={
              r.ideas.approved
                ? `${r.ideas.approved} ${r.ideas.approved === 1 ? "topic" : "topics"} researched and ready, written in this order.`
                : "We research new topics for your site every week."
            }
          />
          {r.ideas.nextTitles.length ? (
            <ol className="mt-5 space-y-3">
              {r.ideas.nextTitles.slice(0, 3).map((t, i) => (
                <li key={i} className="flex gap-3.5 text-[15px]">
                  <span className="mt-px w-4 shrink-0 text-right font-medium text-ink-faint tabular-nums">{i + 1}</span>
                  <span className="min-w-0 text-ink">{t}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 text-sm text-ink-muted">
              {r.ideas.lastResearchAt
                ? "No winnable keywords found yet; we retry weekly. Suggesting a topic below is the fastest way to get the next article."
                : "The queue is empty right now. The next research run fills it."}
            </p>
          )}
        </div>
        <div>
          <ActionForm action={suggestTopicAction} slug={project.slug} submitLabel="Add topic" successLabel="Dispatched" variant="secondary" inline resetOnSuccess>
            <Field id="suggest-topic" label="Suggest a topic" hint="We check it fits your site and isn't already covered, then add it to the queue.">
              <Input id="suggest-topic" name="topic" placeholder="e.g. how to price a first SaaS plan" maxLength={TOPIC_LIMITS.max} required minLength={TOPIC_LIMITS.min} />
            </Field>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}

async function HomeArticles({ projectId, articles, slug, paused }: { projectId: string; articles: AutopilotReport["articles"]; slug: string; paused: boolean }) {
  const glances = await loadGlances(projectId, articles);
  return <ArticleList articles={articles} glances={glances} slug={slug} paused={paused} at={0} />;
}

// What the dispatcher says when clicked. Server-rendered into its popover
// (hidden until opened), so the sentence is real text in the page.
function DispatcherMessage({ message, slug }: { message: Message; slug: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-warn">
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-warn-soft font-bold">
          !
        </span>
        From your dispatcher
      </p>
      <p className="mt-2.5 text-[17px] font-semibold leading-snug tracking-tight text-ink">{message.title}</p>
      {message.sub ? <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{message.sub}</p> : null}
      {message.link ? (
        <Link href={message.link.href} className={`${buttonClass("primary", "sm")} mt-4`}>
          {message.link.label}
        </Link>
      ) : null}
      {message.resume ? (
        <div className="mt-4">
          <ActionForm action={resumeAutopilot} slug={slug} submitLabel="Resume autopilot" size="sm" />
        </div>
      ) : null}
    </div>
  );
}

function DomainLink({ domain }: { domain: string }) {
  return (
    <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="text-ink-muted underline-offset-[3px] hover:text-ink hover:underline">
      {domain}
    </a>
  );
}

function SetupChecklist({ gaps }: { gaps: ReturnType<typeof setupGaps> }) {
  const done = gaps.filter((g) => g.done).length;
  const blocking = gaps.some((g) => !g.done && g.blocksPublishing);
  // The one to do next gets the quiet nudge; the rest wait their turn.
  const nextKey = gaps.find((g) => !g.done)?.key;
  let drawn = 0;
  return (
    <Card as="section" aria-labelledby="setup-title" style={at(820)} className="arrive-up border-l-2 border-l-accent">
      <CardHeader id="setup-title" title="Finish setup" description={`${done} of ${gaps.length} done.${blocking ? " Articles need these to go out." : ""}`} />
      <ul className="mt-5 divide-y divide-line-soft">
        {gaps.map((g) => {
          const next = g.key === nextKey;
          // Done items tick off in order: the check draws, then the strike
          // wipes across the title.
          const tick = g.done ? 380 + drawn++ * 150 : 0;
          return (
            <li key={g.key} className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  g.done ? "border-ok/40 bg-ok-soft text-ok" : next ? "dispatch-breathe border-accent/60 text-transparent" : "border-line text-transparent"
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className={g.done ? "dispatch-draw" : undefined} style={g.done ? ({ "--rise": `${tick}ms` } as React.CSSProperties) : undefined} />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${g.done ? "text-ink-faint" : "text-ink"}`}>
                  <span className="relative">
                    {g.title}
                    {g.done ? (
                      <span aria-hidden="true" style={{ "--rise": `${tick + 200}ms` } as React.CSSProperties} className="dispatch-strike absolute inset-x-0 top-1/2 h-px bg-ink-faint/60" />
                    ) : null}
                  </span>
                  <span className="sr-only">{g.done ? " (done)" : " (to do)"}</span>
                </p>
                {g.done ? null : <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{g.detail}</p>}
              </div>
              {!g.done && g.href ? (
                /^https?:\/\//.test(g.href) ? (
                  // The forwarding pull request lives on GitHub.
                  <a href={g.href} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm", next ? "border-accent/45 hover:border-accent/80" : "")}>
                    Open it
                  </a>
                ) : (
                  <Link href={g.href} className={buttonClass("secondary", "sm", next ? "border-accent/45 hover:border-accent/80" : "")}>
                    Set up
                  </Link>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** The site's own critical issues, in plain words (friendly.ts). Calm on
 *  purpose: amber, one box, at most three lines - the owner's question is
 *  "is something wrong and do I need to do anything", and each line answers
 *  both. */
function SiteIssues({ issues }: { issues: CronHealth[] }) {
  if (!issues.length) return null;
  const lines = issues.slice(0, 3).map(siteIssueLine);
  return (
    <Callout tone="warn" role="status" title={lines.length === 1 ? lines[0].title : "A few things need a look"}>
      {lines.length === 1 ? (
        lines[0].detail
      ) : (
        <ul className="mt-1 space-y-1.5">
          {lines.map((l, i) => (
            <li key={i}>
              <span className="font-medium text-ink">{l.title}.</span> {l.detail}
            </li>
          ))}
        </ul>
      )}
    </Callout>
  );
}

/** The operator's view across every hosted site (OPERATOR_USER_IDS only;
 *  see autopilot/operator.ts). Raw error text on purpose - this reader
 *  debugs it. */
function OperatorStrip({ sites }: { sites: OperatorSite[] }) {
  return (
    <Card as="section" aria-labelledby="ops-title" className="border-l-2 border-l-warn">
      <CardHeader
        id="ops-title"
        title="All sites"
        description={sites.length ? `${sites.length} ${sites.length === 1 ? "site needs" : "sites need"} a look. Only operators see this.` : "Every hosted site is healthy. Only operators see this."}
      />
      {sites.length ? (
        <ul className="mt-4 divide-y divide-line-soft">
          {sites.map((site) => (
            <li key={site.slug || "instance"} className="space-y-2 py-3.5 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-ink">
                {site.name} <span className="font-normal text-ink-faint">{site.domain}</span>
              </p>
              {site.issues.map((i) => (
                <p key={i.job} className="break-words text-[13px] text-ink-muted">
                  <span className="font-mono text-ink-faint">{i.job}</span> {i.error}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
