import Link from "next/link";
import { Suspense } from "react";
import { writerMode, type Project } from "@/lib/projects";
import { isCloudMode } from "@/lib/cloud";
import type { AutopilotArticle, AutopilotReport } from "@/lib/autopilot/report";
import { ArticleList } from "@/components/ui/article-list";
import { ArticleRowsSkeleton } from "@/components/ui/skeleton";
import { loadGlances } from "../articles/article-data";
import type { HostedQueue } from "@/lib/autopilot/queue";
import type { OverviewData } from "./overview-data";
import { pauseAutopilot, resumeAutopilot, suggestTopicAction } from "@/app/autopilot-actions";
import { PixelReporter, type DispatcherMood } from "@/components/pixel-dispatcher";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { DispatcherButton } from "@/components/ui/dispatcher-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { JourneyBar } from "@/components/ui/journey-bar";
import { packDays, type Landed } from "@/components/ui/overview-pack";
import { pagePath } from "@/lib/metrics";
import { OverviewChart, TopPosts, type OverviewDay } from "@/components/ui/overview-chart";
import { PageHeading } from "@/components/ui/page-heading";
import { SiteIcon } from "@/components/ui/site-icon";
import { StatusPill } from "@/components/ui/status-pill";
import { MonthBoard, type CalCard } from "@/components/ui/month-board";
import { ARTICLE_STATUS, articleHref, articleStep, dayDate, inProgress, shortDate, statusLabel, stepLine, toArticleRow } from "../article-status";
import { setupGaps } from "../mode";
import { TOPIC_LIMITS } from "@/lib/autopilot/controls";
import type { CronHealth } from "@/lib/cron-alerts";
import { siteIssueLine } from "@/lib/autopilot/friendly";
import { articlesPerMonthFor, FREE_ARTICLES_PER_MONTH, freeSpacingDays } from "@/lib/billing";
import type { OperatorSite } from "@/lib/autopilot/operator";
import { OperatorIssue } from "./operator-issue";
import { repoMismatchOf } from "@/lib/site-root";
import { PublishModeMenu } from "@/components/publish-mode-switch";
import { GrowFasterCard } from "@/components/grow-faster-card";

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
//   up next   the queue, and a box to suggest a topic
//
// It arrives rather than appears (globals.css "Arrival"): header, road,
// card, the chart drawing itself, then the week and the rows, all inside
// ~1.5s. After that only the dispatcher moves.

const LINK = "font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";
const DAY = 86_400_000;
// Starter's cadence, read from the engine's own table (billing.ts), for the
// free tier's upgrade line.
const STARTER_PER_MONTH = articlesPerMonthFor("starter");
// Where an owner changes how their plan's articles are split between their
// sites (Task D's Websites page; set_site_share over MCP).
const SPLIT_HREF = "/settings/websites";
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
function messageOf(r: AutopilotReport, gaps: ReturnType<typeof setupGaps>, project: Project): Message | null {
  // The connected repo is empty or isn't the site's code: a finished article
  // is waiting, and only the owner can point us at the right repo. Comes
  // before the generic "nowhere to publish" so they get the real reason.
  const mismatch = repoMismatchOf(project);
  if (mismatch && r.articles.some((a) => a.status === "needs_setup")) {
    return {
      title: "Connect the repository your site is built from.",
      sub: `${mismatch.repo} ${mismatch.empty ? "is empty" : `doesn't hold ${project.domain}'s code`}, so new articles can't reach your site. Your finished article goes out as soon as you connect the right one.`,
      link: { href: "/api/github/install/start?slug=" + encodeURIComponent(project.slug), label: "Connect your site's repository" },
    };
  }
  // A site still in setup gets a share of 0 until it connects, so without
  // this it would read as "this site gets no articles, change the split".
  // The real reason is the unfinished setup, and that is where to send them.
  if (inSetup(project)) {
    return {
      title: `${project.domain} isn't set up yet.`,
      sub: "Finish its setup and I start writing for it.",
      link: { href: `/onboarding?site=${encodeURIComponent(project.slug)}`, label: "Finish setup" },
    };
  }
  if (r.articles.some((a) => a.status === "needs_setup")) {
    return {
      title: "An article is finished, with nowhere to publish.",
      sub: "Choose where articles go and it goes out straight away.",
      link: { href: "/settings#publishing", label: "Choose where articles go" },
    };
  }
  if (r.plan.articlesPerWeek === 0) {
    if (r.plan.free) {
      return {
        title: "You're on the free plan.",
        sub: `Upgrade for ${STARTER_PER_MONTH} articles per month, with the full queue and analytics.`,
        link: { href: "/billing#plans", label: "See plans" },
      };
    }
    // A live plan with a pool gives this site 0 for one of two reasons,
    // and neither is a lapsed plan (multi-site plans, 2026-11-11).
    const m = r.thisMonth;
    // 0 because the site cannot write, not because of the split: an
    // unfinished setup says so (also for an older site with a repo and
    // Google but no setup stamp, which the top check leaves alone), and a
    // paused site falls through to its own "I'm paused" message below.
    if (m.pool != null && m.covered === true && isCloudMode() && writerMode(project) === "hosted" && !project.setup_connected_at) {
      return {
        title: `${project.domain} isn't set up yet.`,
        sub: "Finish its setup and I start writing for it.",
        link: { href: `/onboarding?site=${encodeURIComponent(project.slug)}`, label: "Finish setup" },
      };
    }
    if (m.pool != null && m.covered === true && r.paused) {
      return {
        title: `I'm paused, since ${shortDate(r.paused.at)}.`,
        sub: `${r.paused.reason} Nothing is written or published until you resume.`,
        resume: true,
      };
    }
    if (m.pool != null && m.covered === true) {
      return {
        title: "This site gets no articles this month.",
        sub: `Your plan's ${m.pool} articles are going to your other sites this month. Change how they're split in Settings.`,
        link: { href: SPLIT_HREF, label: "Change the split" },
      };
    }
    if (m.pool != null && m.covered === false) {
      return {
        title: "Your plan doesn't cover this site.",
        sub: "You have more sites than your plan includes, so this one gets no articles. Upgrade, or remove a site you no longer need.",
        link: { href: "/billing#plans", label: "See plans" },
      };
    }
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
      sub: `${r.paused.reason} Nothing is written or published until you resume.`,
      resume: true,
    };
  }
  // Last, so setup gaps and a pause speak first. Free tier (billing.ts isFreePlan): FREE_ARTICLES_PER_MONTH articles a
  // month, the number the engine's free cadence reads.
  if (r.plan.free && FREE_ARTICLES_PER_MONTH > 0) {
    const cap = freeCapOf(r);
    if (cap) {
      return {
        title: `That's your ${cap.share} free articles for ${monthNameOf(Date.now())}.`,
        sub: `The next one goes out on ${nextFreeLabel(r, Date.now())}. Starter writes ${STARTER_PER_MONTH} a month, so I'd keep going instead of waiting.`,
        link: { href: "/billing#plans", label: "See plans" },
      };
    }
    return {
      title: `You're on the free plan: ${FREE_ARTICLES_PER_MONTH} articles per month.`,
      sub: `Upgrade for ${STARTER_PER_MONTH} articles per month, with the full queue and analytics.`,
      link: { href: "/billing#plans", label: "See plans" },
    };
  }
  return null;
}

/** The line under "This month": this site's real monthly number and what it
 *  has used, always per month. Its share of a pool when the owner's plan
 *  is split between sites; the free plan's number; and only where there is
 *  no monthly number at all (self-host, the operator's override) the pace
 *  as a month. Null when there is nothing to promise. */
function monthLineOf(r: AutopilotReport, project: Project): React.ReactNode {
  const m = r.thisMonth;
  const used = `${m.used} started so far.`;
  if (m.share != null) {
    if (m.share <= 0) {
      // In setup the share is 0 only until it connects; the dispatcher's
      // "Finish setup" message says why, not "change the split".
      // Paused or unfinished: the share is 0 because the site cannot write,
      // and the dispatcher's message says which.
      if (m.pool == null || m.covered !== true || inSetup(project) || r.paused || (isCloudMode() && writerMode(project) === "hosted" && !project.setup_connected_at)) return null;
      return (
        <>
          None of your plan&apos;s {m.pool} articles go to this site this month.{" "}
          <Link href={SPLIT_HREF} className={LINK}>
            Change the split in Settings
          </Link>
          .
        </>
      );
    }
    const n = `${m.share} ${m.share === 1 ? "article" : "articles"}`;
    if (m.pool != null && m.share < m.pool) {
      return `${n} of your plan's ${m.pool} this month for this site, researched, fact-checked and published for you. ${used}`;
    }
    return `${n} a month on ${r.plan.free ? "the free plan" : "your plan"}, researched, fact-checked and published for you. ${used}`;
  }
  if (r.plan.articlesPerWeek > 0) {
    return `About ${r.plan.articlesPerWeek * 4} articles a month, researched, fact-checked and published for you. ${used}`;
  }
  return null;
}

/** A free site that has used its whole month (the month gate's own count,
 *  usage.ts): the moment an owner most wants more, so Home says so there.
 *  Null on any paid plan, or while the free month still has room. */
function freeCapOf(r: AutopilotReport): { share: number; used: number } | null {
  if (!r.plan.free) return null;
  const share = r.thisMonth.share ?? FREE_ARTICLES_PER_MONTH;
  if (share <= 0 || r.thisMonth.used < share) return null;
  return { share, used: r.thisMonth.used };
}

/** A cloud hosted site whose setup isn't finished: it gets no articles (a
 *  share of 0) until it connects, which is not a split the owner chose. */
function inSetup(project: Project): boolean {
  // "Still a step to do" as setup itself asks it (setup-flow.ts
  // resolveSetupStage): no repo yet, or no Google yet. A site with both and
  // no stamp is an older site from before the stamp existed - sending that
  // one to setup would launch it a second time.
  return isCloudMode() && writerMode(project) === "hosted" && !project.setup_connected_at && (!project.github_repo || !project.gsc_oauth_refresh_token);
}

const monthNameOf = (now: number) => new Date(now).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
/** When the next free article can start: the 1st of next month (the month
 *  resets in UTC, like the gate), or later when the spacing since the last
 *  free start runs past it (free-gate.ts freeStartAllowed). A start late in
 *  the month pushes the next one into the following month's first weeks.
 *  The last start is read from this site's writer articles (createdAt: the
 *  run's start, or the draft's creation once written, which trails it by
 *  the writing time). Free covers one site, so that is the owner's start. */
function nextFreeLabel(r: AutopilotReport, now: number): string {
  const d = new Date(now);
  const firstOfNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  let last = 0;
  for (const a of r.articles) {
    if (a.source !== "writer") continue;
    const t = Date.parse(a.createdAt);
    if (Number.isFinite(t) && t > last) last = t;
  }
  // The daily pass runs at 05:30 UTC: a wait that ends later in the day is
  // really tomorrow's article, so the date never promises a day early.
  const spaced = last ? last + freeSpacingDays() * DAY : 0;
  const spacedDay = spaced ? Math.floor(spaced / DAY) * DAY : 0;
  const spacedRun = spaced && spaced - spacedDay > 5.5 * 60 * 60 * 1000 ? spacedDay + DAY : spacedDay;
  const next = Math.max(firstOfNext, spacedRun);
  return new Date(next).toLocaleString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
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
 *  the days they're due - the Queue page's own dates (queue.ts
 *  expected_start), so Home and /queue always agree. Only when the queue
 *  didn't load does it fall back to spacing by the plan's cadence. */
function monthCards(r: AutopilotReport, now: number, queue: HomeQueue | null): { cards: CalCard[]; today: number; monthName: string; liveThisMonth: number } {
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
  if (queue) {
    queue.upcoming.forEach((q) => {
      const day = q.expected_start ? Date.parse(q.expected_start) : NaN;
      if (Number.isFinite(day) && inMonth(day)) cards.push({ key: `next-${q.suggestion_id}`, day, title: q.title, word: "Up next", tone: "neutral", upcoming: true, href: "/queue" });
    });
    // An empty queue still has a next slot: that morning researches first.
    if (!queue.upcoming.length && queue.nextStart && inMonth(Date.parse(queue.nextStart))) {
      cards.push({ key: "next-research", day: Date.parse(queue.nextStart), title: "A fresh topic from the research queue", word: "Up next", tone: "neutral", upcoming: true });
    }
  } else if (!r.paused && r.nextArticleAt && r.plan.articlesPerWeek > 0) {
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

/** What Home needs of the queue (getHostedQueue): its order and its dates. */
type HomeQueue = Pick<HostedQueue, "upcoming" | "nextStart">;

export async function HostedReport({
  project,
  report,
  overview,
  now,
  flags,
  siteIssues = [],
  operatorSites = null,
  queue = null,
}: {
  project: Project;
  report: AutopilotReport | null;
  /** The Queue page's list and dates; null when it didn't load (the
   *  report's own idea summary and a cadence estimate stand in). */
  queue?: HomeQueue | null;
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
  const google: OverviewData = overview ?? { journey: null, daily: r.traffic.days, landed: {} };
  const plan = planLabel(r.plan);
  // A lapsed plan also reads as "no keyword source" (platform data needs an
  // active plan); the plan message already covers it, so no second card.
  const gaps = setupGaps({ ...r.setup, keywordSource: r.plan.articlesPerWeek === 0 ? undefined : r.setup.keywordSource });
  const missing = gaps.filter((g) => !g.done);
  const message = messageOf(r, gaps, project);
  const month = monthCards(r, now, queue);
  // "Up next" in the queue's own order (the owner's drag order included).
  const nextCount = queue ? queue.upcoming.length : r.ideas.approved;
  const nextTitles = queue ? queue.upcoming.slice(0, 3).map((q) => q.title) : r.ideas.nextTitles;
  const published = r.articles
    .filter((a) => a.status === "published" && a.publishedAt)
    .map((a) => ({ at: a.publishedAt!, title: a.title, href: articleHref(a) }));
  // Home's "Latest articles": the three that went live most recently.
  const latest = r.articles
    .filter((a) => a.status === "published" && a.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
    .slice(0, 3);
  const liveCount = r.articles.filter((a) => a.status === "published").length;
  // The next article's date, in the queue's own projection when it loaded
  // (spacing, quota, the 05:30 run), else the scheduler's stamp. None while
  // paused or on a plan with no articles: there is no date to promise.
  const nextAt = r.paused || r.plan.articlesPerWeek <= 0 ? null : (queue?.upcoming[0]?.expected_start ?? queue?.nextStart ?? r.nextArticleAt);
  // The top-posts lists name our articles by their own titles and publish
  // dates, and open the article's own page; anything else keeps what the
  // pages table had, or its path, and links to the live post.
  const ours = new Map<string, { title: string; publishedAt: string | null; href: string | null }>();
  for (const a of r.articles) if (a.url) ours.set(pagePath(a.url), { title: a.title, publishedAt: a.publishedAt, href: articleHref(a) });
  const landed: Landed = {};
  for (const [key, rows] of Object.entries(google.landed ?? {}) as Array<[keyof Landed, NonNullable<Landed[keyof Landed]>]>) {
    landed[key] = rows.map((p) => {
      const o = ours.get(p.path);
      return o ? { ...p, title: o.title, publishedAt: o.publishedAt ?? p.publishedAt, href: o.href } : p;
    });
  }
  const chartDays = packDays(google.daily.length ? google.daily : r.traffic.days);
  const tally = {
    live: month.liveThisMonth,
    writing: inProgress(r.articles).length,
    waiting: r.articles.filter((a) => ARTICLE_STATUS[a.status].attention).length,
  };
  const monthLine = monthLineOf(r, project);
  // Paused, the dispatcher's own "I'm paused" says why nothing goes out; a
  // coffee-break date on top would promise an article that won't come.
  const freeCap = r.paused ? null : freeCapOf(r);
  const pauseControl = r.paused ? (
    <ActionForm action={resumeAutopilot} slug={project.slug} submitLabel="Resume Dispatcher" size="sm" className="[&_p:empty]:hidden" />
  ) : (
    <ActionForm action={pauseAutopilot} slug={project.slug} submitLabel="Pause Dispatcher" variant="secondary" size="sm" className="[&_p:empty]:hidden" />
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
          {/* The site's status IS the publishing switch: "Autopilot on" /
              "Review mode on" opens the Autopilot / Manual review menu
              (components/publish-mode-switch.tsx). */}
          <PublishModeMenu variant="status" paused={Boolean(r.paused)} slug={project.slug} mode={project.publish_mode} waiting={r.articles.filter((a) => a.status === "review").length} />
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

      {operatorSites?.length ? <OperatorStrip sites={operatorSites} /> : null}

      <SiteIssues issues={siteIssues.filter((h) => !(r.paused && h.job.startsWith("autopilot-pause--")))} />

      {/* ---- the main event ---- */}
      <OverviewChart
        daily={chartDays}
        published={published}
        publishedCapped={r.articlesTruncated}
        periodHref="/dashboard/period"
        connectAction={
          r.setup.google ? undefined : (
            <Link href="/google" className={buttonClass("primary", "md")}>
              Connect Search Console
            </Link>
          )
        }
      />

      {missing.length ? <SetupChecklist gaps={gaps} /> : null}

      {/* ---- latest articles: the three newest live ones, with how
          Google is treating each - the Articles page's own rows. ---- */}
      {latest.length ? (
        <section aria-labelledby="latest-title" className="space-y-4">
          <h2 id="latest-title" className="arrive-up text-xl font-semibold tracking-tight text-ink" style={at(860)}>
            Latest articles
          </h2>
          {/* No date while the free month is used up (the card below has
              the real one) or while setup blocks publishing: either way the
              promised article wouldn't go out that day. */}
          {nextAt && !freeCap && !gaps.some((g) => !g.done && g.blocksPublishing) ? (
            <NextArticleLine at={nextAt} now={now} review={project.publish_mode === "review"} />
          ) : null}
          <Suspense fallback={<ArticleRowsSkeleton rows={latest.length} />}>
            <LatestRows projectId={project.id} articles={latest} liveCount={liveCount} />
          </Suspense>
        </section>
      ) : null}

      {/* ---- your top posts: its own section, its own range ---- */}
      {r.setup.google ? <TopPosts landed={landed} daily={chartDays} at={940} /> : null}

      {/* ---- this month ---- */}
      <section aria-labelledby="week-title" className="space-y-5">
        <div className="arrive-up flex flex-wrap items-end justify-between gap-x-8 gap-y-3" style={at(880)}>
          <div>
            <h2 id="week-title" className="text-xl font-semibold tracking-tight text-ink">
              This month <span className="font-normal text-ink-faint">{month.monthName}</span>
            </h2>
            {monthLine ? <p className="mt-1 text-[14px] text-ink-muted">{monthLine}</p> : null}
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
        {freeCap ? <GrowFasterCard share={freeCap.share} used={freeCap.used} next={nextFreeLabel(r, now)} now={now} arriveAt={920} /> : null}
        <MonthBoard cards={month.cards} today={month.today} at={940} />
      </section>

      {/* ---- up next ---- */}
      <section aria-labelledby="next-title" className="arrive-up grid gap-8 border-t border-line pt-10 lg:grid-cols-2 lg:gap-14" style={at(1250)}>
        <div>
          <CardHeader
            id="next-title"
            title="Up next"
            description={
              nextCount
                ? `${nextCount} ${nextCount === 1 ? "topic" : "topics"} researched and ready, written in this order.`
                : "We research new topics for your site every week."
            }
            action={
              <Link href="/queue" className={buttonClass("ghost", "sm")}>
                Open the queue
              </Link>
            }
          />
          {nextTitles.length ? (
            <ol className="mt-5 space-y-3">
              {nextTitles.slice(0, 3).map((t, i) => (
                <li key={i} className="flex gap-3.5 text-[15px]">
                  <span className="mt-px w-4 shrink-0 text-right font-medium text-ink-faint tabular-nums">{i + 1}</span>
                  <span className="min-w-0 text-ink">{t}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 text-sm text-ink-muted">
              {r.ideas.lastResearchAt
                ? "No winnable keywords found yet; we look again within two days, and dig deeper each time. Suggesting a topic below also works."
                : "The queue is empty right now. The next research run fills it."}
            </p>
          )}
          {r.ideas.note ? <p className="mt-4 text-sm text-ink-muted">{r.ideas.note}</p> : null}
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

/** The next article, told by the dispatcher: the clay agent at its desk
 *  (typing when it's close, coffee while it waits), one line in its voice,
 *  and a tear-off calendar page with the day. Colour lives in the glow and
 *  the calendar's band, never in a tile around an icon (owner, 2026-11-11). */
function NextArticleLine({ at: iso, now, review }: { at: string; now: number; review: boolean }) {
  const days = Math.floor(Date.parse(iso) / 86_400_000) - Math.floor(now / 86_400_000);
  const d = new Date(iso);
  const soon = days <= 1;
  const title =
    days <= 0 ? "Your next article starts today" : days === 1 ? "Your next article starts tomorrow" : `Your next article is on ${dayDate(iso, now)}`;
  const say = soon
    ? // Review mode holds every finished article for the owner's Publish.
      `I'm lining it up now: research, writing, a check of every fact, then ${review ? "it waits for your OK" : "it goes live on your site"}.`
    : `That's ${days} days away. Until then I keep your topic queue fresh and watch how Google treats what's live.`;
  return (
    <div
      className="arrive-up relative isolate flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface py-3 pl-2 pr-4 sm:gap-5 sm:py-3.5 sm:pl-3 sm:pr-6"
      style={at(880)}
    >
      {/* One soft violet glow behind the dispatcher. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 top-1/2 -z-10 h-56 w-72 -translate-y-1/2 rounded-full bg-accent-strong/15 blur-3xl" />
      <div className="relative shrink-0">
        <PixelReporter mood={soon ? "working" : "idle"} steam={!soon} decorative className="w-[108px] sm:w-[150px]" />
        <span aria-hidden="true" className="absolute inset-x-2 -bottom-1 h-1.5 rounded-[50%] bg-black/40 blur-[3px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-balance text-[16px] font-semibold leading-snug tracking-tight text-ink sm:text-[17px]">{title}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{say}</p>
      </div>
      {/* The tear-off calendar page: month band, the day, its weekday. */}
      <div aria-hidden="true" className="relative hidden shrink-0 rotate-[3deg] transition-transform duration-300 hover:rotate-0 motion-reduce:transition-none sm:block">
        <span className="absolute -top-1 left-[18px] z-10 h-2.5 w-1.5 rounded-full bg-ink-faint/70" />
        <span className="absolute -top-1 right-[18px] z-10 h-2.5 w-1.5 rounded-full bg-ink-faint/70" />
        <div className="w-[76px] overflow-hidden rounded-xl border border-line bg-surface-2 text-center shadow-xl shadow-black/40">
          <div className="bg-gradient-to-b from-accent to-accent-strong py-1 text-[11px] font-bold tracking-[0.16em] text-white">
            {d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}
          </div>
          <div className="pt-2 text-[30px] font-semibold leading-none tracking-tight tabular-nums text-ink">{d.getUTCDate()}</div>
          <div className="pb-2 pt-1 text-[11px] font-medium text-ink-faint">{d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" })}</div>
        </div>
      </div>
    </div>
  );
}

/** The latest rows, streamed: their keyword numbers and liveness are one
 *  small read (loadGlances), and the chart below never waits on it. */
async function LatestRows({ projectId, articles, liveCount }: { projectId: string; articles: AutopilotArticle[]; liveCount: number }) {
  const glances = await loadGlances(projectId, articles);
  return (
    <ArticleList
      articles={articles.map(toArticleRow)}
      glances={glances}
      at={900}
      hideStatus
      more={{ href: "/articles?status=live", label: liveCount > articles.length ? `See all ${liveCount} live articles` : "Open your articles" }}
    />
  );
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
          <ActionForm action={resumeAutopilot} slug={slug} submitLabel="Resume Dispatcher" size="sm" />
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
 *  debugs it. Only rendered when a site has an issue: a healthy fleet shows
 *  nothing, and dismissing the last line removes the box. */
function OperatorStrip({ sites }: { sites: OperatorSite[] }) {
  return (
    <Card as="section" aria-labelledby="ops-title" className="border-l-2 border-l-warn">
      <CardHeader
        id="ops-title"
        title="All sites"
        description={`${sites.length} ${sites.length === 1 ? "site needs" : "sites need"} a look. Only operators see this. A dismissed line comes back if its job fails again.`}
      />
      <ul className="mt-4 divide-y divide-line-soft">
        {sites.map((site) => (
          <li key={site.slug || "instance"} className="space-y-2 py-3.5 first:pt-0 last:pb-0">
            <p className="text-sm font-medium text-ink">
              {site.name} <span className="font-normal text-ink-faint">{site.domain}</span>
            </p>
            {site.issues.map((i) => (
              <OperatorIssue key={i.job} job={i.job} error={i.error} />
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
