import { Suspense } from "react";
import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { canMerge, openSeoPrs } from "@/lib/github";
import { dataforseoBalance } from "@/lib/dataforseo-balance";
import {
  AddIdeaCard,
  CopyBlock,
  CopyButton,
  CronFixedButton,
  DecideButtons,
  DismissTopicButton,
  ExpandTopicButton,
  IndexRequestedDone,
  IndexRequestedDoneAll,
  MergeButton,
} from "@/components/client";
import { GhTokenConnect } from "@/components/gh-token-connect";
import { BuilderTokenConnect } from "@/components/builder-token-connect";
import { DispatchingInline } from "@/components/dispatching";
import { IdeaCard } from "@/components/idea-card";
import { TrafficByPage } from "@/components/seo-cards";
import { TrendScanButton, TrendScanPoller, TrendScanSweep } from "@/components/trend-scan";
import { sortQueue, type Suggestion, type TrendTopic } from "@/lib/metrics";
import { EmptyState, GscChart, Mono, ProgressMeter, SectionTitle } from "@/components/ui";
import { GlanceSection } from "@/components/glance-stats";
import { FREE_BACKLINKS, PAID_BACKLINKS } from "@/lib/playbook-data";
import { getActivityReport, type ActivityLine } from "@/lib/activity";
import {
  getCronHealth,
  criticalCronIssues,
  isManualReviewNotice,
  looksLikeQuotaFailure,
} from "@/lib/cron-alerts";
import { PipelineUpdateNotice } from "@/components/pipeline-update-notice";
import { queueHealth } from "@/lib/jobs";
import { buildCronFixPrompt, buildPipelineUpdatePrompt } from "@/lib/cron-fix-prompt";
import { isLive } from "@/lib/page-liveness";
import { getAnalyticsOverview } from "@/lib/analytics-data";
import { getJourney } from "@/lib/journey";
import { getWeeklyProgress } from "@/lib/progress";
import { JourneyCard } from "@/components/journey-card";
import { NextUpdate } from "@/components/next-update";
import { getActiveProject } from "@/lib/active-project";
import { projectAgent } from "@/lib/agents";
import { effectiveAutomations, fetchProjectToken, publishTarget } from "@/lib/projects";
import { aiKind } from "@/lib/wizard-branch";
import { credsForProject } from "@/lib/dataforseo";
import {
  platformBudgetGate,
  platformUsageStatus,
  TIER_BUDGET_MICROUSD,
} from "@/lib/dataforseo-usage";
import { DataforseoConnectForm } from "@/components/dataforseo-connect";
import { gscAccessOk, serviceAccountEmail, serviceAccountProbeAllowed } from "@/lib/gsc";
import { buildsActive } from "@/lib/builder-status";
import { isCloudMode } from "@/lib/cloud";
import {
  indexingBrowserCommand,
  indexingManualSteps,
  indexingQueue,
  type IndexingPageRow,
} from "@/lib/indexing";
import { getPacing } from "@/lib/pacing";
import { mcpAddCommand, mcpServerName, setupCommand, setupCommandPS } from "@/lib/mcp-connect";
import { requestOrigin } from "@/lib/request-origin";
import { ShellCommandTabs } from "@/components/shell-command-tabs";
import { PacingLine } from "@/components/pacing-info";
import { NextBuildCountdown } from "@/components/agent-status";
import { DispatcherBriefing } from "@/components/dispatcher-briefing";
import { computeBriefing } from "@/lib/briefing";
import { getAuthority } from "@/lib/authority";
import { CHANGELOG_COOKIE, unseenRelease } from "@/lib/changelog";
import { STAR_COOKIE, shouldAskForStar } from "@/lib/star-prompt";
import { StarPrompt } from "@/components/star-prompt";
import { cookies } from "next/headers";
import { DockerAccessTip } from "@/components/docker-access-tip";
import { ChromeExtensionTip } from "@/components/chrome-extension-tip";
import { FirstRunBackground } from "@/components/first-run-background";
import { ChatNextSteps, type ChatStep } from "@/components/chat-next-steps";
import AiVisibilitySection from "./ai-visibility-section";

export const dynamic = "force-dynamic";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// A plain external link, styled to read as a link inside body/step text.
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
    >
      {children}
    </a>
  );
}

function SetupStep({
  title,
  state,
  why,
  commandLabel,
  command,
  commandPs,
  command2Label,
  command2,
  steps,
  closing,
  coming,
  children,
}: {
  title: string;
  // Green status chip ("connected, syncing") - the card's own answer to
  // "didn't I already do this?".
  state?: string;
  why: string;
  commandLabel?: string;
  command?: string;
  // PowerShell twin of `command` - when present the card renders shell
  // tabs instead of a single box, because the paste runs on the owner's
  // machine and bash chains die in the default Windows terminal.
  commandPs?: string;
  // A second copy box (e.g. connect command + the paste that uses it).
  command2Label?: string;
  command2?: string;
  steps?: React.ReactNode[];
  closing?: string;
  coming?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className={`font-medium ${coming ? "text-neutral-400" : ""}`}>{title}</p>
        {coming ? <span className="text-xs text-neutral-500">coming</span> : null}
        {state ? (
          <span className="shrink-0 text-xs font-medium text-emerald-400">{state}</span>
        ) : null}
      </div>
      <p className={`text-sm ${coming ? "text-neutral-500" : "text-neutral-400"}`}>{why}</p>
      {commandLabel ? <p className="pt-0.5 text-xs text-neutral-500">{commandLabel}</p> : null}
      {command ? (
        commandPs ? (
          <ShellCommandTabs bash={command} powershell={commandPs} box="card" />
        ) : (
          <CopyBlock text={command} />
        )
      ) : null}
      {command2 ? (
        <>
          <p className="pt-0.5 text-xs text-neutral-500">{command2Label}</p>
          <CopyBlock text={command2} />
        </>
      ) : null}
      {steps && steps.length > 0 ? (
        <details>
          <summary className="cursor-pointer select-none text-sm text-sky-400 hover:text-sky-300">
            Show me how
          </summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-neutral-400">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {closing ? <p className="mt-3 text-xs text-neutral-400">{closing}</p> : null}
        </details>
      ) : null}
      {children}
    </div>
  );
}

// One activity column: a checklist of what the manager did in the window.
function ActivityCard({
  title,
  lines,
  empty,
}: {
  title: string;
  lines: ActivityLine[];
  empty: string;
}) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</p>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lines.map((l) => (
            <li key={l.label} className="flex gap-2 text-sm">
              <span className="shrink-0 text-emerald-400" aria-hidden="true">
                ✓
              </span>
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One playbook column on Home: the next few undone links of one kind (free or
// paid), so both kinds stay visible side by side instead of whichever three
// undone items sort first.
function PlaybookColumn({
  heading,
  items,
  allDone,
}: {
  heading: string;
  items: typeof FREE_BACKLINKS;
  allDone: string;
}) {
  return (
    // min-w-0: without it this grid child sizes to the widest `truncate` line
    // below (nowrap counts as min-content), which blew the whole page out to
    // 2259px on a 390px screen.
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{heading}</p>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-emerald-400">{allDone}</p>
      ) : (
        <div className="divide-y divide-neutral-800/70">
          {items.map((item) => (
            <div key={item.slug} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <p className="text-sm">
                <span className="font-medium text-neutral-100">{item.name}</span>
                <span
                  className={`ml-2 text-xs ${item.price ? "text-amber-300" : "text-emerald-400"}`}
                >
                  {item.price ?? "free"}
                </span>
              </p>
              <p className="truncate text-sm text-neutral-400">{item.worth}</p>
              <a
                href={item.submitUrl}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
              >
                Open submission page <span aria-hidden="true">↗</span>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Streams in behind Suspense instead of riding the page's blocking fan-out.
// The activity log is the last thing on Home and nothing above it depends on
// the report, so making the page wait on it only ever delayed the parts
// people actually came for. Milestones still come from the journey (computed
// up top from the analytics overview) and arrive as a prop.
async function ActivitySection({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: { label: string }[];
}) {
  const activity = await getActivityReport(projectId);
  return (
    <div className="grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-2">
      <ActivityCard
        title="Done today"
        lines={activity.today}
        empty="Nothing yet today - the builders run each morning."
      />
      <ActivityCard
        title="This week"
        lines={[
          // First-time moments lead the week's feed - these are the lines
          // worth remembering while the traffic graph is still flat.
          ...milestones.map((m) => ({ label: `${m.label} 🎉` })),
          ...activity.week,
        ]}
        empty="Quiet week so far - the daily builder starts filling this."
      />
    </div>
  );
}

// Placeholder that reserves the same two-column shape the real section takes,
// so streaming it in doesn't shove the page around underneath the reader.
// The inline dispatcher above it says which of the two it is: a section still
// on its way, not an empty one.
function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <DispatchingInline />
      <div className="grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-2 rounded-xl bg-neutral-900 p-4">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-neutral-800" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  await requireDashboard();
  await requireOnboarded();

  const project = await getActiveProject();
  // Free-tier DIY: every DataForSEO call bills the project's own account.
  const dfsCreds = await credsForProject(project);

  // A site driven by the ordinary Claude/ChatGPT app rather than a coding
  // agent. Several things below read differently for it: there is no pipeline
  // to install (the conventions row its setup chat writes is NOT an install
  // footprint), nobody is "on duty" in the builder sense, and the owner needs
  // to be told which sentence to paste next.
  const chatProject = project.ai_choice != null && aiKind(project.ai_choice) === "chat";
  const chatAiName = project.ai_choice === "chatgpt" ? "Your ChatGPT" : "Your Claude";

  const client = db();
  const [
    sugRes,
    overview,
    kwCount,
    guidesRes,
    prs,
    balance,
    profileRes,
    conventionsRes,
    playbookRes,
    pagesRes,
    topicRes,
    scanRes,
    pacing,
    cronHealth,
    mergeReady,
    saEmail,
    dfsUsage,
    articleQueue,
    draftsRes,
  ] = await Promise.all([
    client
      .from("suggestions")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    getAnalyticsOverview(project),
    client
      .from("keywords")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("status", "tracking"),
    // Rows, not a head-count: the stat tile counts only pages verified live
    // (0033), while the setup cards care whether anything was ever logged -
    // two different numbers from the same cheap query. Tolerant of pre-0033
    // schemas by selecting * (a named missing column would error the query;
    // with * the key is simply absent and isLive treats that as live).
    client
      .from("pages")
      .select("*")
      .eq("project_id", project.id)
      .eq("type", "guide"),
    openSeoPrs(project),
    // Own-account balance only - bundled cloud customers run on OUR account,
    // so their dashboard must never show our balance or nudge them to fund it.
    dfsCreds?.billedTo === "own" ? dataforseoBalance(dfsCreds) : Promise.resolve(null),
    client.from("site_profile").select("id").eq("project_id", project.id).maybeSingle(),
    client.from("conventions").select("project_id").eq("project_id", project.id).maybeSingle(),
    client.from("playbook_status").select("slug, status").eq("project_id", project.id),
    client
      .from("pages")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(25),
    client
      .from("trend_topics")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    // Pre-0016 tolerance: a missing column reads as "not scanning" instead of
    // breaking the page - same pattern as the Trends screen.
    client
      .from("projects")
      .select("trend_scan_requested_at")
      .eq("id", project.id)
      .maybeSingle(),
    getPacing(project),
    // Cloud tenants must only see THEIR project's job health, never the
    // deployment-wide jobs (daily-ranks, deploy-check, secrets-canary) that
    // belong to us as the operator. Passing the slug scopes it; self-host
    // (single owner) keeps the full deployment view.
    getCronHealth(isCloudMode() ? project.slug : undefined),
    // Both were sequential awaits further down - each one stalled the whole
    // render on its first (uncached) call, so they ride the big fan-out now.
    canMerge(project),
    serviceAccountEmail(),
    // Bundled-DataForSEO spend, cloud only. Deliberately NOT gated on
    // dfsCreds?.billedTo === "platform": credsForProject returns null once the
    // budget gate denies, so keying off it would hide this notice at exactly
    // the moment it matters. platformUsageStatus keeps reporting "platform"
    // through exhaustion for this reason.
    isCloudMode() ? platformUsageStatus(project.id) : Promise.resolve(null),
    // The article queue behind the WordPress route: what is waiting, what is
    // in flight, what gave up. Counts only - see queueHealth's own note on why
    // it never returns rows.
    queueHealth(project.id),
    // Every article the owner's AI has handed in, by status - drives the
    // Claude-app next-steps card. Statuses only; the Drafts screen has the rest.
    client.from("article_drafts").select("status").eq("project_id", project.id),
  ]);
  const draftStatuses = ((draftsRes.data ?? []) as { status: string }[]).map((d) => d.status);

  // Two guide numbers from one query (0033): "logged" drives the setup cards
  // (the pipeline demonstrably works once anything lands, merged or not);
  // "live" is what the stat tile may honestly call published.
  const guideRows = (guidesRes.data ?? []) as { id: string; url: string; live_at?: string | null }[];
  const guidesLoggedCount = guideRows.length;
  const guidesLiveCount = guideRows.filter(isLive).length;

  // Cron alert banner (gap A4): the latest run per job, surfaced when it
  // failed or hasn't run within its expected window. In cloud mode, drop the
  // operator-owned global jobs entirely - a tenant can't act on those.
  // "Pipeline update available" reports split off into their own quiet
  // notice: an update waiting is the normal state after any backend deploy
  // that ships a new pack, not a job failure worth a red banner. On cloud it
  // isn't even news - the backend pushes the pack through the GitHub App on
  // its own (see the deploy-check report handler), so there is nothing for the
  // customer to know or do and the notice stays hidden entirely. Self-host has
  // no App, so there it stays: applying the pack is the owner's job.
  const jobIssues = cronHealth
    .filter((h) => !isCloudMode() || h.job.includes(`--${project.slug}`))
    .filter((h) => !h.ok || h.stale);
  const updateNotices = isCloudMode() ? [] : jobIssues.filter((h) => h.update_available);

  // Agent-quota waits split off the same way, and for the same reason: the
  // customer's own Claude/Codex account hitting its usage window is a NORMAL
  // state of a bring-your-own-credential product, not a fault in theirs or
  // ours. Red-boxing it was actively harmful - the failure box offers "Copy fix
  // prompt", and pasting that into their agent spends more of the quota they
  // just ran out of on a problem no agent can fix, while "Mark fixed" writes an
  // ok row that pushes their next build out by a full cadence.
  //
  // `stale` still wins: a job that is BOTH quota-blocked AND overdue has stopped
  // running for longer than its schedule allows, which is a real problem again.
  const quotaWaits = jobIssues.filter(
    (h) => !h.update_available && !h.ok && !h.stale && looksLikeQuotaFailure(h.errors),
  );
  // "Needs a human" outcomes - a tool PR the validator gave up on, a green PR
  // auto-merge couldn't land. A to-do for the owner, not a failing job: one
  // quiet line with a way out, never the red panel (see isManualReviewNotice).
  const manualReviews = jobIssues.filter(
    (h) => !h.update_available && !h.ok && !h.stale && isManualReviewNotice(h.job, h.errors),
  );
  // The pack version the update notice is about, from the report's own text
  // ("installed abc, current def"): the snooze key, so a dismissed notice
  // comes back once per new pack and not on every load.
  const packVersionPending =
    updateNotices
      .flatMap((h) => h.errors)
      .map((e) => /current ([0-9a-f]+)/i.exec(e)?.[1])
      .find(Boolean) ?? "unknown";
  // The red panel is reserved for CRITICAL issues: failures that persisted
  // across runs, missed a whole schedule window, or belong to an urgent class
  // (broken deploy, dead credentials, empty balance). A single flaky run stays
  // in the run log and get_cron_health, where the agent can still see it - the
  // next scheduled run either cures it quietly or promotes it here.
  const cronIssues = criticalCronIssues(jobIssues);

  // WHAT THE ARTICLE QUEUE IS DOING, in one line and only when it is worth a
  // line. Same policy as the cron banner above: an article in flight is the
  // system working, and a dashboard that narrates normal operation trains
  // people to stop reading it. Two things earn the line - work that gave up
  // for good (nothing will retry it, and an article is sitting unpublished),
  // and work that is far older than the ten-minute drain can explain, which
  // is what a wedged queue looks like from outside.
  const STUCK_MINUTES = 45;
  const stuck =
    articleQueue.oldestPendingMinutes !== null &&
    articleQueue.oldestPendingMinutes >= STUCK_MINUTES;
  // Named by what actually failed. A site scan giving up and an article never
  // reaching the site are different problems with different fixes, and one
  // sentence covering both would be true of neither.
  const failedArticleWork = articleQueue.failedKinds.some((k) =>
    ["finish", "publish", "verify"].includes(k),
  );
  const failedScan = articleQueue.failedKinds.includes("crawl");
  const articleQueueNote = failedArticleWork
    ? `${articleQueue.failed === 1 ? "An article was written but could not be published" : `${articleQueue.failed} articles were written but could not be published`} after repeated tries. The writing is safe - the last error is on the job's record.`
    : failedScan
      ? "We could not finish reading your site after repeated tries, so new articles may go out without links to your existing pages."
      : articleQueue.wedged > 0
        ? `${articleQueue.wedged} background ${articleQueue.wedged === 1 ? "job is" : "jobs are"} stuck and will not retry on their own.`
        : stuck
          ? `An article has been waiting ${articleQueue.oldestPendingMinutes} minutes to be processed, which is longer than it should take.`
          : null;

  // The last window before bundled DataForSEO runs out. Exhaustion itself is
  // already owned by the needsUsageLimit setup card below - this is the part
  // that was missing: by the time that card appears, rank tracking has ALREADY
  // stopped, and the drop is otherwise invisible (past the budget
  // credsForProject returns null, so every rank check reports
  // `{skipped: "no DataForSEO connected"}` - never hadError, never an alert).
  // Warning at 80% leaves room to connect an account or upgrade first.
  const budgetWarning =
    dfsUsage &&
    dfsUsage.billed_to === "platform" &&
    dfsUsage.percent_used >= 80 &&
    dfsUsage.percent_used < 100
      ? {
          percent: dfsUsage.percent_used,
          // Nothing above Scale to move to, so don't offer the top tier an
          // upgrade it can't buy - connecting an own account is the only real
          // way out for them.
          canUpgrade: dfsUsage.budget_usd < TIER_BUDGET_MICROUSD.scale / 1_000_000,
          resetsOn: new Date(dfsUsage.resets_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
          }),
        }
      : null;

  const suggestions = (sugRes.data ?? []) as Suggestion[];

  // The progress story (journey stage + weekly movers) - derived from the
  // overview already fetched above, plus one cheap query each. The authority
  // read rides along for the briefing's "today's move" nudge; cache-row +
  // history reads only, and a failure degrades to no nudge.
  const [journey, weekly, authority] = await Promise.all([
    getJourney(project, overview),
    getWeeklyProgress(project, overview),
    getAuthority(project).catch(() => null),
  ]);


  // Playbook progress for the summary at the bottom. A missing playbook_status
  // table (migration not applied yet) just means everything reads as todo.
  const playbookStatusOf = new Map<string, string>(
    (playbookRes.data ?? []).map((r: { slug: string; status: string }) => [r.slug, r.status]),
  );
  const playbookItems = [...FREE_BACKLINKS, ...PAID_BACKLINKS];
  const playbookDoneCount = playbookItems.filter(
    (i) => playbookStatusOf.get(i.slug) === "done",
  ).length;
  // Two side-by-side columns on Home: the next free links and the next paid
  // ones - so the paid opportunities are visible instead of buried behind
  // whichever three undone items happen to sort first.
  const playbookNextFree = FREE_BACKLINKS.filter(
    (i) => playbookStatusOf.get(i.slug) !== "done",
  ).slice(0, 3);
  const playbookNextPaid = PAID_BACKLINKS.filter(
    (i) => playbookStatusOf.get(i.slug) !== "done",
  ).slice(0, 3);

  // "Get it on Google" queue: every page published in the last few days that
  // has not had its manual indexing request marked done. Until migration 0005
  // runs, rows come back without the index_requested_at key - the cards still
  // show, and a nudge under the grid points at the migration so Mark as done
  // can stick.
  const pageRows = (pagesRes.data ?? []) as IndexingPageRow[];
  const indexingTasks = indexingQueue(pageRows);
  const indexingCommand =
    indexingTasks.length > 0
      ? indexingBrowserCommand(
          project,
          indexingTasks.map((p) => p.url),
        )
      : "";
  const indexingMigrationMissing =
    pageRows.length > 0 && !("index_requested_at" in pageRows[0]);

  // When auto-merge is on, open PRs are the repo CI's job, not the owner's -
  // the card becomes a status line instead of a Merge CTA.
  const automations = effectiveAutomations(project);
  const autoMergeOn = automations.auto_merge;

  // The two-stage radar: subjects the scan caught (trend_topics) plus the
  // pending takes under them. Before migration 0016 the topics query errors
  // and the radar shows subjects-less, exactly like before. Before 0013 the
  // source key is absent and every suggestion reads as research.
  const trendTopics = ((topicRes.data ?? []) as TrendTopic[]).filter(
    (t) => t.status !== "dismissed",
  );
  // Titles for the "from:" line on idea cards - unfiltered so an idea never
  // loses its source subject even after the subject is dismissed.
  const topicTitleOf = new Map(
    ((topicRes.data ?? []) as TrendTopic[]).map((t) => [t.id, t.title]),
  );
  // Same scanning derivation as the Trends screen: a scan is out when it was
  // requested after the last completed one and recently enough (< 15 min) to
  // still be running - so the sweep survives navigating away and back.
  const scanRequestedAt = scanRes.error
    ? null
    : ((scanRes.data as { trend_scan_requested_at?: string | null } | null)
        ?.trend_scan_requested_at ?? null);
  const scanning =
    scanRequestedAt != null &&
    (!project.last_trend_scan_at ||
      new Date(scanRequestedAt).getTime() > new Date(project.last_trend_scan_at).getTime()) &&
    Date.now() - new Date(scanRequestedAt).getTime() < 15 * 60000;
  const trendPending = suggestions.filter(
    (s) => s.status === "pending" && s.source === "trend-scan",
  );
  // Home shows TWO trend items total - subjects and ideas count together,
  // newest first; everything else collapses into one "+ N more on Trends".
  const trendMix = [
    ...trendTopics.map((t) => ({ kind: "topic" as const, at: t.created_at, id: t.id })),
    ...trendPending.map((s) => ({ kind: "idea" as const, at: s.created_at, id: s.id })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const shownTrendIds = new Set(trendMix.slice(0, 2).map((i) => i.id));
  const shownTopics = trendTopics.filter((t) => shownTrendIds.has(t.id));
  const shownIdeas = trendPending.filter((s) => shownTrendIds.has(s.id));
  const moreTrends = trendMix.length - shownTrendIds.size;
  const pendingSugs = suggestions.filter(
    (s) => s.status === "pending" && s.source !== "trend-scan",
  );
  // Build order, not insertion order - "Next up" must match what the daily
  // builder will actually pick from the visible queue.
  const approvedUnbuilt = sortQueue(suggestions.filter((s) => s.status === "approved"));
  const inProgress = suggestions.filter((s) => s.status === "in_progress");
  const hasShipped = suggestions.some((s) => s.status === "done");

  // The "agent active" heartbeat: only truthful when the pipeline is actually
  // wired into the repo (the install stamp, or the conventions row for
  // installs that predate it - same signals as the install card) AND at least
  // one builder automation is on. Purely derived - no new state, and every
  // ingredient is already readable over MCP (get_project, get_automations,
  // get_suggestions), so no parity tool is needed.
  const agentWired =
    !chatProject &&
    (project.pipeline_installed_at != null ||
      (!conventionsRes.error && conventionsRes.data != null));
  const agentActive =
    agentWired && (automations.auto_build_guides || automations.auto_build_tools);

  // One-time setup steps, derived from data. Each actionable card disappears
  // once done, and every condition is computed for the ACTIVE project. Cards
  // the wizard's power-ups step unchecked stay hidden (powerups_skipped).
  const skippedPowerup = (key: string) => project.powerups_skipped.includes(key);
  // Cloud never shows the PAT card - the GitHub App carries merge rights;
  // its loss has its own reconnect card below.
  const needsMergeToken = !isCloudMode() && !mergeReady && !skippedPowerup("merge");
  // The App was uninstalled (or the repo left the installation) while a
  // pipeline exists: customer workflows keep running, but approvals,
  // merges, and dispatches from here silently lost their credential.
  const needsAppReconnect =
    isCloudMode() && Boolean(project.github_repo) && project.github_installation_id == null;
  // A paid cloud project that would otherwise ride the bundled DataForSEO
  // plan, but its owner has spent through this month's shared usage budget
  // (see dataforseo-usage.ts) - gets its own card below, distinct from "go
  // connect an account" (needsDataforseo). Self-host and free-mode projects
  // never see this: platformBudgetGate fails open outside CLOUD_MODE.
  const platformBudget = isCloudMode() ? await platformBudgetGate(project.id) : { allowed: true as const };
  const needsUsageLimit =
    isCloudMode() && project.keyword_source === "dataforseo" && dfsCreds == null && !platformBudget.allowed;
  // Free-tier DIY: the project chose DataForSEO as its keyword source but has
  // no account connected yet. Free-mode projects (serpapi/gsc) never see this
  // card - their data source is already set.
  const needsDataforseo =
    project.keyword_source === "dataforseo" && dfsCreds == null && !needsUsageLimit;
  const needsFunding = balance != null && balance < 10;
  // The install's footprint: the workflow's final step stamps
  // pipeline_installed_at via mark_pipeline_installed (0018); the conventions
  // row (written by setup, which install chains into) stays as the fallback
  // signal for installs that predate the stamp.
  // A chat project never has a pipeline: its setup chat writes the same
  // conventions row, which used to read here as "pipeline installed" and put
  // the dispatcher into "still setting up" for a site that was simply waiting
  // for its owner's next sentence.
  const pipelineInstalled =
    !chatProject &&
    (project.pipeline_installed_at != null ||
      (!conventionsRes.error && conventionsRes.data != null));
  // Which of these three cards to show turns on whether the pipeline is
  // actually installed - NOT on project identity. It used to key off
  // `isDefaultProject` as a proxy for "the pipeline exists", which holds only
  // on the maintainer's own cloud deploy. On self-host the owner's FIRST site
  // claims DEFAULT_PROJECT_ID in place (actions.ts createProjectCore), so that
  // proxy inverted: the one project that most needs "install the pipeline"
  // could never show it, and after a successful install never flipped to the
  // installed state either. Both presets keep auto_build_guides on, so the
  // first-page card's `!auto_build_guides` couldn't cover the gap - a
  // self-hoster's Home showed neither card, and SKILL.md tells the installing
  // agent to verify that this very card flipped, a check it could only fail.
  // Same bug class as e23df8f (see the self-host-reuses-default-project-id
  // note): DEFAULT_PROJECT_ID does not mean "the operator's env-backed site".
  const autoBuildsGuides = effectiveAutomations(project).auto_build_guides;
  const needsPipeline = guidesLoggedCount === 0 && !hasShipped && !skippedPowerup("pipeline");
  const pipelineTodo = needsPipeline && !pipelineInstalled;
  // Pipeline is in, nothing has landed yet. In auto mode the daily builder gets
  // there on its own, so the honest card is "waiting"; in semi a human has to
  // press the button, so it's "build your first page".
  const pipelineWaiting = needsPipeline && pipelineInstalled && autoBuildsGuides;
  const needsFirstPage = needsPipeline && pipelineInstalled && !autoBuildsGuides;
  // Playbook personalization: show until the site_profile row exists. A table
  // error (migration 0003 not applied yet) suppresses the card - the playbook
  // page carries the migration nudge instead. Also hidden while the install
  // card shows: install runs setup, which saves the profile - two cards
  // would be the same ask twice.
  const needsProfile =
    !profileRes.error && profileRes.data == null && !skippedPowerup("playbook") && !pipelineTodo;
  // GSC connection: the project has a property configured but no traffic data
  // has ever landed - the service account is not on the property yet.
  const needsGsc =
    Boolean(project.gsc_site_url) &&
    overview.gscDaily.length === 0 &&
    (saEmail != null || isCloudMode());
  // Only probe Google when the card would show at all: a successful read
  // means the owner already added the service account and the card should
  // say "waiting on the first sync" instead of re-explaining the step.
  // Cloud connects via the one-click OAuth instead - a stored refresh token
  // means the owner's side is done, whatever the service account says.
  // serviceAccountProbeAllowed short-circuits the probe for a cloud TENANT:
  // gsc_site_url is tenant-writable, so probing it with the shared platform
  // service account would answer "can the operator read this property?" for
  // anything a customer cares to type. Their own OAuth token is the only
  // signal that means anything here anyway. Same boundary as gsc-readiness.ts.
  const gscWaiting =
    needsGsc && project.gsc_site_url
      ? (isCloudMode() && Boolean(project.gsc_oauth_refresh_token)) ||
        (serviceAccountProbeAllowed(project) && (await gscAccessOk(project.gsc_site_url)))
      : false;
  // Docker installs: automatic builds need SOME build path alive - the
  // in-stack builder or the repo's GitHub Actions pipeline. buildsActive()
  // accepts evidence from either, so this card only shows when nothing has
  // built or checked in - never while pages demonstrably ship another way
  // (the classic "unlocked the dashboard, forgot the token" hole is real,
  // but accusing a working install is worse).
  const needsBuilder = Boolean(process.env.POSTGREST_URL) && !(await buildsActive());
  // Auto mode publishes without a human, so nobody opens this dashboard on a
  // normal day - the failure email is the only passive signal. Self-host only:
  // cloud sends alerts from our own Resend with zero config. The card reads
  // the env directly and disappears on the restart that loads the two vars.
  const needsAlertEmail =
    !isCloudMode() &&
    autoMergeOn &&
    !(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL);
  // The project's own MCP key, only fetched when a card needs to show it.
  const mcpToken = needsPipeline ? await fetchProjectToken(project.id) : null;
  // Mirrors the wizard's connect command. The server name is unique per
  // project (dispatchseo-<slug>, via mcpAddCommand) so connecting a second
  // site never collides with or silently shadows the first one's token.
  const hdrs = await headers();
  const dashOrigin = requestOrigin(hdrs);
  // Built from THIS project's agent, not from Claude's builders. Before this
  // they called mcpAddCommand/setupCommand directly, so a Codex or Cursor
  // project was handed `claude mcp add` and a setup.sh invocation that would
  // connect the wrong agent - the card told every owner to run Claude
  // regardless of what they had chosen.
  const cardAgent = projectAgent(project);
  const connectCommand = mcpToken
    ? cardAgent.connect.mcpAddBash(project.slug, dashOrigin, mcpToken)
    : null;
  // The one-command onboarding (public/setup.sh): connect + verified secrets
  // + agent hand-off, run inside the site's repo. Cloud projects skip the
  // script's DataForSEO question - the platform bundles it server-side.
  const setupCmd =
    mcpToken && cardAgent.setup
      ? cardAgent.setup.bash(project.slug, dashOrigin, mcpToken, isCloudMode())
      : null;
  const setupCmdPs =
    mcpToken && cardAgent.setup
      ? cardAgent.setup.powershell(project.slug, dashOrigin, mcpToken, isCloudMode())
      : null;

  // The funding card is the better surface for a low balance, so suppress the
  // amber nudge in Next actions whenever it shows.
  const showBalanceNudge = balance != null && balance < 5 && !needsFunding;
  // Approved items build themselves (guides: daily builder each morning;
  // tools: on dashboard approval) - the queue is a status line, not an action.
  const allClear =
    pendingSugs.length === 0 && prs.length === 0 && !showBalanceNudge && indexingTasks.length === 0;
  // Every setup card is conditional now (Phase 4 shipped, the "coming"
  // placeholder is gone) - hide the whole section once setup is complete.
  // CLOUD: the whole "Initial setup" section is self-host framing - it walks a
  // self-hoster through steps they do by hand. Cloud does all of it for them
  // (App install, OAuth GSC, bundled DataForSEO, auto-research), and the top
  // "setting up in the background" banner is the single honest progress
  // surface, so the section never renders on cloud.
  const hasSetupCards =
    !isCloudMode() &&
    (needsMergeToken ||
      needsDataforseo ||
      needsUsageLimit ||
      needsFunding ||
      needsProfile ||
      needsFirstPage ||
      needsPipeline ||
      needsGsc ||
      needsBuilder ||
      needsAlertEmail);
  // Cloud gets its OWN tiny section rather than the self-host one, because
  // most cards above are self-host framing that would actively mislead a cloud
  // customer (the "bring your own DataForSEO account" card, the PAT card, the
  // builder card). But two cloud states genuinely need a surface, and both
  // used to have NONE: needsAppReconnect and the cloud GSC connect card were
  // written, then rendered inside a section gated on !isCloudMode(), so they
  // could never appear (2026-07-27).
  //
  // needsAppReconnect is the serious one: when the App is uninstalled, the
  // customer's scheduled workflows keep running while approvals, one-tap merge
  // and every dashboard-triggered dispatch silently lose their credential -
  // exactly the "looks healthy, does nothing" state with no way to notice.
  //
  // The two below are the same shape of hole on the non-GitHub routes: a site
  // that is fully set up except for the one connection that decides whether
  // anything can ever come out of it. Both are skippable in the wizard on
  // purpose (a WordPress password nobody has to hand, a connector someone
  // wants to set up on their laptop later), so this is where the skip is
  // remembered - without it the owner is left with a dashboard that looks
  // finished and an article that never appears.
  const needsWordPress =
    isCloudMode() && publishTarget(project) === "wordpress" && !project.wp_app_password;
  // Only for an owner who TOLD us their AI is a chat app. A null ai_choice is
  // every project created before c0 asked, and those run a coding agent - the
  // card would be an instruction to connect something they do not use.
  const needsChatConnect =
    isCloudMode() &&
    project.ai_choice != null &&
    aiKind(project.ai_choice) === "chat" &&
    !project.chat_last_seen_at;
  const hasCloudSetupCards =
    isCloudMode() &&
    (needsAppReconnect || (needsGsc && !gscWaiting) || needsWordPress || needsChatConnect);

  // The dispatcher's briefing - Home's opening surface, where the agent reports
  // in the first person instead of the page narrating about it. Built from the
  // overview/journey/weekly already in hand plus the queue state this function
  // has loaded, so the card costs no extra query; getBriefing() (the MCP door)
  // fetches the same three itself. See briefing.ts for why the wins are the
  // wins, and why an empty list is a real answer rather than a bug.
  //
  // "DispatchSEO has been updated" rides in here too: the layout's grey bar is
  // the right shape on every screen except this one, where an agent is already
  // mid-sentence about the site, so the bar steps aside on /dashboard and the
  // dispatcher delivers the news itself.
  const jar = await cookies();
  const release = unseenRelease(jar.get(CHANGELOG_COOKIE)?.value, project.created_at);
  // The once-ever star ask. Gated on a page actually being live, so it can
  // only appear after the product has done the thing it was installed to do -
  // and gated on the cookie, so answering it either way ends it for good.
  const askStar = shouldAskForStar(jar.get(STAR_COOKIE)?.value, guidesLiveCount);
  const briefing = computeBriefing({
    overview,
    journey,
    weekly,
    // The same set that drives the red panel below - update notices are
    // deliberately excluded, because an outdated pipeline is not a failing job
    // and the dispatcher must not cry wolf about the normal state after a
    // backend deploy.
    failingJobs: cronIssues.length,
    // Pipeline is in, but the first research or the first rank check hasn't
    // landed yet. Rank tracking is the PAID half, so a free/GSC-only project
    // has no rank check coming - ever - and waiting on one would park the
    // dispatcher in "still setting up" permanently, describing work that isn't
    // pending, it's just not configured.
    settingUp:
      pipelineInstalled &&
      (suggestions.length === 0 ||
        (dfsCreds != null && !overview.rankings.some((r) => r.checked))),
    building: inProgress[0]?.title ?? null,
    queued: approvedUnbuilt.length,
    pendingDecisions: pendingSugs.length,
    onDuty: agentActive,
    chatClient: chatProject,
    authority,
    // Only Home can know this: "unseen" is a property of THIS browser's
    // cookie, which is why get_briefing leaves it null.
    release: release ? { version: release.version, summary: release.summary } : null,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {process.env.POSTGREST_URL ? <DockerAccessTip /> : null}
        {/* The dispatcher's briefing. This one card is what the status pill,
            the "researching in the background" strip and the red job-failure
            box used to be: three disconnected notices about the same agent,
            now one panel where that agent speaks. No PageHeader above it - the
            topbar already names the screen, and "How example.com is doing" is
            precisely what the dispatcher now says, in better words. */}
        <DispatcherBriefing
          briefing={briefing}
          agentName={chatProject ? chatAiName : projectAgent(project).displayName}
          // A chat app is never "dispatching" or "standing by" in the builder
          // sense; the one fact worth a chip is whether it has reached us.
          stateLabel={
            chatProject ? (project.chat_last_seen_at ? "connected" : "not connected yet") : undefined
          }
          // Only when a guide is actually queued for it: a countdown to a build
          // that has nothing to build is a promise about an empty morning.
          duty={
            agentActive &&
            automations.auto_build_guides &&
            approvedUnbuilt.some((s) => s.type === "guide") ? (
              <NextBuildCountdown />
            ) : null
          }
        >
          {cronIssues.length > 0 ? (
            <>
              <ul className="space-y-0.5 text-red-300/90">
                {cronIssues.map((h) => (
                  <li key={h.job}>
                    <span className="break-words font-mono">{h.job}</span>{" "}
                    {!h.ok
                      ? `failed on its last run${h.errors[0] ? ` - ${h.errors[0]}` : ""}`
                      : `hasn't run since ${new Date(h.last_run_at).toUTCString()}`}{" "}
                    <CronFixedButton job={h.job} />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CopyButton text={buildCronFixPrompt(project, cronIssues)} label="Copy fix prompt" />
                <p className="text-xs text-red-300/70">
                  Paste it into your coding agent - it inspects the job, fixes it, and clears this
                  alert over MCP once the fix is verified.
                </p>
              </div>
              <p className="mt-2 text-xs text-red-300/70">
                Full detail in your Vercel function logs (daily-ranks) and GitHub Actions runs
                (hourly-gsc, deploy-check, the seo-* workflows, and the secrets canary).
              </p>
            </>
          ) : null}
        </DispatcherBriefing>
        {/* Still mounted, now silent: its poll is what fires the first
            research / rank / GSC runs after the wizard closes, and the
            briefing above says "still setting up" in the dispatcher's own
            voice. Only its overdue branch - a promise that was NOT kept, with
            the command that fixes it - still renders. */}
        {pipelineInstalled ? (
          <FirstRunBackground slug={project.slug} cloud={isCloudMode()} quiet />
        ) : null}
        {/* The Claude-app owner's guide: which sentence to paste next, which
            screen to open, ticking itself off from real state. Leaves once the
            first article is live - by then the loop is understood. */}
        {chatProject && !draftStatuses.includes("published")
          ? (() => {
              const profileDone =
                (!profileRes.error && profileRes.data != null) ||
                (!conventionsRes.error && conventionsRes.data != null);
              const anyApproved = suggestions.some((s) =>
                ["approved", "in_progress", "done"].includes(s.status),
              );
              const steps: ChatStep[] = [
                {
                  title: `Connect ${project.ai_choice === "chatgpt" ? "ChatGPT" : "Claude"} to this site`,
                  done: project.chat_last_seen_at != null,
                  href: "/connect",
                  linkLabel: "Open Connect your AI",
                  hint: "One address to paste under Settings, then Connectors. The first time it uses each DispatchSEO tool it will ask you to allow it - choose Always allow.",
                },
                {
                  title: "Let it learn your business (three short questions)",
                  done: profileDone,
                  paste: "Use the DispatchSEO connector and run the setup-chat workflow from get_instructions.",
                  hint: "Paste this in a new chat. It asks who buys from you, what never to say, and how it should sound - a sentence each is plenty.",
                },
                {
                  title: "Ask it for article ideas",
                  done: suggestions.length > 0,
                  paste: "Use the DispatchSEO connector and run the research-chat workflow from get_instructions. Find five article ideas and propose them.",
                  hint: "It checks what people search for and queues a handful of ideas with a one-line reason each.",
                },
                {
                  title: "Approve the ideas you like",
                  done: anyApproved,
                  href: "/research",
                  linkLabel: `Open the Queue${pendingSugs.length ? ` (${pendingSugs.length} waiting)` : ""}`,
                  hint: "Nothing is written until you say yes. Approve one or two to start.",
                },
                {
                  title: "Ask it to write the first one",
                  done: draftStatuses.length > 0,
                  paste: "Use the DispatchSEO connector and run the write-guide-chat workflow from get_instructions. Write my next approved article.",
                  hint: "It researches, writes and hands the article in. We check it, format it, add links and the cover, and publish it on your schedule.",
                },
                {
                  title: "Watch it go live on the Drafts screen",
                  done: false,
                  href: "/drafts",
                  linkLabel: "Open Drafts",
                  hint: "Checking, then Ready to publish (press Publish now to skip the wait), then Posted, then Live. After the first one, you only repeat the last two steps.",
                },
              ];
              return <ChatNextSteps steps={steps} aiName={chatAiName} />;
            })()
          : null}
        {budgetWarning ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-amber-200">
              You&apos;ve used {budgetWarning.percent}% of this month&apos;s included keyword data
            </p>
            <p className="mt-1 text-amber-300/90">
              When it runs out, daily rank checks and keyword research pause until the allowance
              resets on {budgetWarning.resetsOn}. Search Console traffic keeps updating either way.
            </p>
            <p className="mt-2 text-xs text-amber-300/70">
              To avoid the gap,{" "}
              <Link href="/settings" className="underline underline-offset-2">
                connect your own DataForSEO account
              </Link>{" "}
              - it&apos;s unmetered and takes over immediately
              {budgetWarning.canUpgrade ? (
                <>
                  {" "}
                  - or move to a bigger plan on{" "}
                  <Link href="/billing" className="underline underline-offset-2">
                    Billing
                  </Link>
                </>
              ) : null}
              .
            </p>
          </div>
        ) : null}
        {articleQueueNote ? (
          // A whisper, deliberately, and only when there is something to say.
          // The queue's resting state is empty, and an article moving through
          // it normally (submitted at midnight, published at nine) is not news
          // - so this stays silent unless something has genuinely given up or
          // has been sitting far longer than the ten-minute drain explains.
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-neutral-500">
            <span className="min-w-0">{articleQueueNote}</span>
            <Link href="/drafts" className="whitespace-nowrap text-neutral-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-neutral-200">
              Open Drafts
            </Link>
          </div>
        ) : null}
        {quotaWaits.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-amber-200">
              Waiting on your coding agent&apos;s usage limit
            </p>
            <p className="mt-1 text-amber-300/90">
              Your agent account has hit its limit, so {quotaWaits.length === 1 ? "a build is" : "some builds are"}{" "}
              paused. This resumes on its own once the limit resets - there is nothing to fix, and
              no need to mark anything.
            </p>
            <ul className="mt-2 space-y-0.5 text-amber-300/90">
              {quotaWaits.map((h) => (
                <li key={h.job}>
                  <span className="break-words font-mono">{h.job}</span>
                  {h.errors[0] ? ` - ${h.errors[0]}` : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-300/70">
              Hitting this often means the site is producing more than the plan on that account
              covers - upgrading it, or switching to a different agent in Settings, gives the
              builders more room.
            </p>
          </div>
        ) : null}
        {manualReviews.length > 0 ? (
          // A whisper in the article-queue grammar above: something is waiting
          // on a look from the owner, nothing is broken, nothing will retry.
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-neutral-500">
            <span className="min-w-0">
              Needs your review:{" "}
              {manualReviews.map((h, i) => (
                <span key={h.job}>
                  {i > 0 ? "; " : null}
                  <span className="text-neutral-400">{h.errors[0] ?? h.job}</span>
                </span>
              ))}
              {project.github_repo ? (
                <>
                  {" "}
                  -{" "}
                  <a
                    href={`https://github.com/${project.github_repo}/pulls`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-neutral-200"
                  >
                    open the repo&apos;s pull requests
                  </a>
                </>
              ) : null}
            </span>
            {manualReviews.map((h) => (
              <CronFixedButton key={h.job} job={h.job} label="mark handled" tone="sky" />
            ))}
          </div>
        ) : null}
        {updateNotices.length > 0 ? (
          // Deliberately a whisper, not a box: an update waiting is the NORMAL
          // state of every self-host install the morning after any backend
          // release, and it used to arrive as one more colored banner on all
          // of them at once. Publishing continues on the current version
          // either way, so this earns one line of small print and three quiet
          // actions - paste the update prompt into the coding agent, mark it
          // applied, or hide it until the next pack ships (the component
          // remembers the pack version it was hidden at).
          <PipelineUpdateNotice
            repo={project.github_repo}
            packVersion={packVersionPending}
            prompt={buildPipelineUpdatePrompt(project)}
            jobs={updateNotices.map((h) => h.job)}
          />
        ) : null}
      </div>

      {/* ---------- THE PROGRESS STORY (stage, weekly movers, milestones) ---------- */}
      <JourneyCard journey={journey} weekly={weekly} />

      {/* ---------- PUBLISHING PACE (one quiet line; the "why" is a dialog) ---------- */}
      <PacingLine pacing={pacing} />

      {/* ---------- STAT ROW (the numbers, first thing you see) ---------- */}
      <GlanceSection
        daily={overview.gscDaily}
        fresh24={overview.fresh24}
        keywordsTracked={kwCount.count ?? 0}
        guidesPublished={guidesLiveCount}
      />

      {/* ---------- THE ONE ASK (once ever, after the first page goes live) ---------- */}
      {askStar ? <StarPrompt livePages={guidesLiveCount} /> : null}

      {/* ---------- NEEDS YOU (cloud) - see hasCloudSetupCards ---------- */}
      {hasCloudSetupCards ? (
      <section className="space-y-3">
        <SectionTitle sub="the hosted version handles setup for you - these are the few things it cannot do on your behalf, and each disappears on its own once it's sorted">
          Needs you
        </SectionTitle>
        <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2 xl:grid-cols-3">
          {needsAppReconnect ? (
            <SetupStep
              title="Reconnect the GitHub App"
              why={`The DispatchSEO GitHub App has no access to ${project.github_repo} on record - it was never finished for this site, or it was uninstalled/the repo left the installation. Your repo's scheduled workflows keep running, but approving tools, one-tap merge, and every run triggered from this dashboard are paused until it's connected.`}
              steps={[
                <>
                  <a
                    href={`/api/github/install/start?slug=${project.slug}`}
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Reinstall the DispatchSEO GitHub App
                  </a>{" "}
                  and grant it access to {project.github_repo}.
                </>,
                "That's it - nothing else changed, and no data was lost.",
              ]}
            />
          ) : null}
          {needsGsc && !gscWaiting ? (
            <SetupStep
              title="Connect Google Search Console"
              why={`Traffic numbers come straight from Google. One click connects the Google account that owns the ${project.domain} property - read-only access, revocable any time. Skipped it during setup? This is where you pick it back up.`}
              steps={[
                <>
                  <Link
                    href="/google"
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Connect Google
                  </Link>{" "}
                  - sign in with the account that has Search Console access to {project.domain}.
                </>,
                "Pick the property if the guess was wrong - the connect page lists everything the account can see.",
                "Done - traffic starts landing with the next hourly sync. Google's data runs 2-3 days behind, so give it a day or two.",
              ]}
              closing="This card disappears on its own once the first day of search data arrives."
            />
          ) : null}
          {needsWordPress ? (
            <SetupStep
              title="Connect your WordPress site"
              why="Finished articles are waiting for somewhere to go. Connect WordPress from Settings and they publish on their own."
              steps={[
                <>
                  <Link
                    href="/settings"
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Open Settings
                  </Link>{" "}
                  - the WordPress section walks through making an application password.
                </>,
                "Anything that finished while there was nowhere to publish is on the Drafts screen, with a Publish now button.",
              ]}
              closing="This card disappears on its own the moment the connection is saved."
            />
          ) : null}
          {needsChatConnect ? (
            <SetupStep
              title="Connect your Claude app"
              why="Your Claude hasn't reached us yet. The Connect screen has the address and the three steps."
              steps={[
                <>
                  <Link
                    href="/connect"
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Open Connect
                  </Link>{" "}
                  - copy the connector address and add it in claude.ai&apos;s own Settings.
                </>,
                "Then start a chat with the connector on and paste the setup line that page gives you.",
              ]}
              closing="This card disappears on its own the first time your Claude reaches us - there is no button to press."
            />
          ) : null}
        </div>
      </section>
      ) : null}

      {/* ---------- INITIAL SETUP (hidden once every step is done) ---------- */}
      {hasSetupCards ? (
      <section className="space-y-3">
        <SectionTitle sub="everything needed to run this hands-off - cards watch live data, update to 'done, waiting' on their own, and disappear once each step truly completes">
          Initial setup
        </SectionTitle>
        <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2 xl:grid-cols-3">
          {needsDataforseo ? (
            <SetupStep
              title="Connect DataForSEO"
              why="Rank checks, keyword research, and Domain Rating all run on DataForSEO, and you bring your own account - your data, your balance, your control. It is cheap: one rank check a day works out to about 6 cents per tracked keyword per month, plus roughly 70 cents a month for the daily Domain Rating check. A site tracking 30 keywords spends about 2 to 3 dollars a month."
              steps={[
                <>
                  Create an account at{" "}
                  <ExtLink href="https://app.dataforseo.com">app.dataforseo.com</ExtLink> - new
                  accounts start with free trial credit, no card needed.
                </>,
                <>
                  Open the{" "}
                  <ExtLink href="https://app.dataforseo.com/api-access">API Access page</ExtLink>{" "}
                  and copy the API password shown there. This is a separate password DataForSEO
                  generates for the API - NOT the one you use to log into the dashboard.
                </>,
                "Your API login is simply the account email.",
                <>
                  If the API password field looks blank, note that it is hidden about 24 hours after
                  signup - click Send by e-mail on that page and it lands in your inbox.
                </>,
                "Paste both below - they are checked live against DataForSEO before saving, so green means the nightly rank checks will work tonight.",
              ]}
              closing="DataForSEO has no separate API token to hand out - this login and API password are the only credential it offers. Because the API password is not your dashboard login, it cannot be used to sign into or take over your account; it only makes API calls against your own prepaid balance, and you can regenerate it any time to cut this app off."
            >
              <DataforseoConnectForm />
            </SetupStep>
          ) : null}
          {needsUsageLimit ? (
            <SetupStep
              title="DataForSEO usage limit reached this month"
              why="This project runs on your plan's bundled DataForSEO - no account of your own needed. Your account has used its full monthly allowance across every site you run, so rank checks and keyword research pause here until the period resets."
              steps={[
                <>
                  <Link
                    href="/billing"
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Upgrade your plan
                  </Link>{" "}
                  for a bigger monthly budget, or
                </>,
                <>
                  connect your own DataForSEO account on{" "}
                  <Link
                    href="/settings"
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Settings
                  </Link>{" "}
                  for unlimited usage billed to your own balance instead.
                </>,
              ]}
              closing="This card disappears on its own once next month starts, or once usage is no longer capped."
            />
          ) : null}
          {needsGsc && gscWaiting ? (
            <SetupStep
              title="Google Search Console"
              state="connected, syncing"
              why={
                isCloudMode() && project.gsc_oauth_refresh_token
                  ? `Done on your side: your Google account is connected to the ${project.domain} property. Traffic lands with the next hourly sync, and Google's own data runs 2-3 days behind on top - this card disappears by itself once the first day arrives.`
                  : `Done on your side: the service account can read the ${project.domain} property. Traffic lands with the next hourly sync, and Google's own data runs 2-3 days behind on top - this card disappears by itself once the first day arrives.`
              }
            />
          ) : null}
          {needsGsc && !gscWaiting && !isCloudMode() ? (
            <SetupStep
              title="Connect Google Search Console"
              why={`Traffic numbers come straight from Google. One click there gives DispatchSEO read access to the ${project.domain} property - copy the email below and add it as a user.`}
              command={saEmail ?? ""}
              steps={[
                <>
                  Open{" "}
                  <ExtLink href="https://search.google.com/search-console">
                    Google Search Console
                  </ExtLink>{" "}
                  and pick the {project.domain} property (verify the site there first if it is
                  missing).
                </>,
                "Go to Settings, then Users and permissions.",
                "Click Add user, paste the email from this card, keep the Restricted permission, and save.",
                "Done - traffic starts landing with the next nightly sync. Google's data runs 2-3 days behind, so give it a day or two.",
              ]}
              closing="This card disappears on its own once the first day of search data arrives."
            />
          ) : null}
          {needsBuilder ? (
            <SetupStep
              title="Turn on automatic builds"
              why={`This install runs its own builder - your coding agent inside Docker, building approved ideas on schedule, no public URL needed. It hasn't checked in yet, so nothing builds automatically until this is done. One paste.`}
              steps={[
                // Agent-specific minting lives inside the box below (it names
                // the exact command or key page per agent) - the card's own
                // steps stay agent-neutral so the prose can never contradict
                // the tab the owner actually has selected.
                "Mint your agent's credential - the box below tells you exactly how for whichever agent you pick.",
                "Paste it in the box - stored encrypted, no files to touch.",
                "Within ~10 minutes the builder checks in and this card disappears by itself.",
              ]}
              closing="Until then everything else still works - research, approvals, rankings - only automatic building waits. Prefer the terminal? Add CLAUDE_CODE_OAUTH_TOKEN or OPENAI_API_KEY to the install folder's .env instead - env always wins."
            >
              <BuilderTokenConnect current={projectAgent(project).id} />
            </SetupStep>
          ) : null}
          {needsAlertEmail ? (
            <SetupStep
              title="Get emailed when something breaks"
              why="You're in automatic mode - pages publish themselves, so nobody opens this dashboard on a normal day. Failures show a red banner here, but the email is what actually reaches you. Two minutes: free Resend account, one key, two lines in .env."
              steps={[
                <>
                  Create a free account at{" "}
                  <ExtLink href="https://resend.com/signup">resend.com</ExtLink> - no credit
                  card, no domain setup needed.
                </>,
                <>
                  Open <ExtLink href="https://resend.com/api-keys">resend.com/api-keys</ExtLink>,
                  click Create API Key, and copy the key it shows (starts with re_).
                </>,
                "In the folder DispatchSEO was installed from (on a VPS: over SSH, on Windows: in Git Bash), paste the command below with both values swapped in. The email must be the one you signed up to Resend with - alerts go out through Resend's built-in sender, which only delivers to its own account's address.",
              ]}
              command={'[ -f start.sh ] && echo "RESEND_API_KEY=re_PASTE-YOUR-KEY-HERE" >> .env && echo "ALERT_EMAIL=you@example.com" >> .env && sh start.sh || echo "Wrong folder - run this inside the dispatchseo folder (on a VPS: ssh in first)"'}
              commandPs={'if (Test-Path start.sh) { [IO.File]::AppendAllText("$PWD/.env", "RESEND_API_KEY=re_PASTE-YOUR-KEY-HERE`nALERT_EMAIL=you@example.com`n"); .\\start.cmd } else { "Wrong folder - run this inside the dispatchseo folder (on a VPS: ssh in first)" }'}
              closing="At most one email per job per day, and a machine that was asleep or off never counts as broken. No email means everything is working."
            />
          ) : null}
          {needsMergeToken ? (
            <SetupStep
              title="Connect GitHub"
              why="With a GitHub token, approve = ship: PRs get a Merge button here. On a Docker install it is also how the bundled builder reaches your repo at all - without it nothing gets built. Verified against your repo the moment you paste it, stored encrypted."
              steps={[
                <>
                  <ExtLink href="https://github.com/settings/tokens/new?scopes=repo&description=DispatchSEO%20merge">
                    Create the token on GitHub
                  </ExtLink>{" "}
                  - the link pre-fills everything (classic token, repo scope). Pick an
                  expiration, press Generate token.
                </>,
                "Copy the token it shows (starts with ghp_) and paste it below.",
              ]}
            >
              <GhTokenConnect repoName={project.github_repo ?? "your repo"} />
            </SetupStep>
          ) : null}
          {needsFunding ? (
            <SetupStep
              title="Fund DataForSEO"
              why="Rank checks and keyword research draw from a prepaid balance. The free credit runs out after about a week."
              steps={[
                <>
                  Log in at{" "}
                  <ExtLink href="https://app.dataforseo.com">app.dataforseo.com</ExtLink>.
                </>,
                "Open Billing and add funds. The minimum deposit is 50 dollars, it is pay as you go, and the balance never expires.",
                "A tracked keyword costs about 6 cents a month (one rank check a day), plus roughly 70 cents a month for the Domain Rating check. The bill grows as you publish, because every guide adds a keyword to track: about 2 to 3 dollars a month at 30 keywords, nearer 12 at 180. The 50 dollar minimum lasts well over a year at a steady pace, or six to nine months publishing daily.",
                "Optional but smart: in API Settings, set a daily spend limit so nothing can ever run up your balance unexpectedly.",
              ]}
            />
          ) : null}
          {needsProfile ? (
            <SetupStep
              title="Fill in your backlink playbook"
              why="The Backlinks tab lists the best free and paid backlinks you can set up today, with every submission prefilled with your product's copy. Paste this into your connected coding agent, in your site's repo (not this dashboard's) - it researches your product and personalizes all of it. This card watches the saved profile and disappears the moment your agent writes it; still here means that run hasn't happened yet."
              command={`Call the ${mcpServerName(project.slug)} MCP tool get_instructions with workflow setup and follow it exactly.`}
            />
          ) : null}
          {needsFirstPage ? (
            <SetupStep
              title="Build your first page"
              // The get_instructions form rather than /seo-build: slash
              // commands are a Claude Code file convention, and Codex has no
              // equivalent. Naming the tool works in both, and in anything
              // else that connects over MCP later.
              why="You have an approved guide waiting - the daily builder will build it and open a PR automatically tomorrow morning. To build it right now instead of waiting, paste this into your connected coding agent (in your site's repo). In Claude Code, /seo-build is the shorthand for the same thing."
              command={`Call the ${mcpServerName(project.slug)} MCP tool get_instructions with workflow build-guide and follow it exactly.`}
            />
          ) : null}
          {pipelineWaiting ? (
            <SetupStep
              title="Content pipeline"
              state="installed, first build pending"
              why={`Done on your side: your agent ran the install and setup for ${project.name}. The daily builder picks up the top approved idea each morning (05:00 UTC) - approve ideas in the Queue and the first PR shows up under Next actions. This card disappears once the first page ships.`}
            />
          ) : null}
          {pipelineTodo && isCloudMode() ? (
            <SetupStep
              title="Finish setting up your site"
              why={`Setup didn't finish for ${project.name} - the pipeline isn't fully installed yet. The wizard picks up exactly where it stopped and re-runs the remaining steps itself.`}
              steps={[
                <>
                  <Link
                    href="/onboarding"
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Resume setup
                  </Link>{" "}
                  - it re-checks everything and continues from the exact step that's missing.
                </>,
              ]}
              closing="This card disappears once the pipeline install verifies."
            />
          ) : null}
          {pipelineTodo && !isCloudMode() ? (
            <SetupStep
              title="Install the content pipeline in your repo"
              why={`The automations - daily guides, weekly tools, validation, auto-merge - run as GitHub Actions in your site's repo, on your own coding agent. One command sets up everything: it talks you through each step, checks every value actually works before saving it, then your own agent installs the pipeline and marks this card done.`}
              commandLabel={`Paste in a terminal, inside your site's repo${project.github_repo ? ` (${project.github_repo})` : ""}:`}
              command={setupCmd ?? undefined}
              commandPs={setupCmdPs ?? undefined}
              steps={[
                <>
                  Run it inside your site&apos;s repo
                  {project.github_repo ? (
                    <>
                      {" "}
                      (
                      <ExtLink href={`https://github.com/${project.github_repo}`}>
                        {project.github_repo}
                      </ExtLink>
                      )
                    </>
                  ) : null}{" "}
                  - the repo DispatchSEO publishes to. The script checks it&apos;s the right folder
                  before touching anything.
                </>,
                "It will ask you to: approve once in the browser (your coding agent's token - verified before it's saved), and type your DataForSEO email + the API password from app.dataforseo.com/api-access (only if this project uses DataForSEO; NOT your login password).",
                "It ends by launching your coding agent, which fetches the pipeline, adapts it to your stack, opens the install PR, and flips this card green itself.",
                // A named prerequisite with no way to satisfy it is a dead
                // end, and this card is where a half-finished install lands
                // when the wizard was closed - so it links out like the
                // wizard's own Claude Code screens do.
                <>
                  Needs: a coding agent (Claude Code, Codex, or Cursor) and the GitHub CLI (gh, logged in). The script tells you
                  exactly what&apos;s missing if anything is - and{" "}
                  <Link
                    href="/docs/install-claude-code"
                    target="_blank"
                    className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    installing either one
                  </Link>{" "}
                  is a one-time, five-minute detour.
                </>,
                "Connecting more than one site? Each site's repo gets its own command with its own key - that key is what sends each repo's work to the right project. Safe to re-run any time.",
              ]}
              closing="The key in the command only sees this project's data. In Semi mode nothing merges without you; the PRs just appear under Next actions."
            />
          ) : null}
        </div>
      </section>
      ) : null}

      {/* ---------- THE GRAPH ---------- */}
      <section className="space-y-3">
        <SectionTitle sub={<>clicks and impressions from Google - pick the window on the card · <NextUpdate hourly /></>}>Search traffic</SectionTitle>
        <GscChart rows={overview.gscDaily} />
      </section>

      {/* ---------- TRAFFIC BY PAGE (back on Home by request - Neo wants the
          per-page split right under the graph) ---------- */}
      <section className="space-y-3">
        <SectionTitle
          sub={<>where every Google click landed, last 28 days · <NextUpdate hourly /></>}
        >
          Traffic by page
        </SectionTitle>
        <TrafficByPage breakdown={overview.breakdown} maxRows={5} />
      </section>

      {/* ---------- ANALYTICS TEASER (the deep numbers live on one page now) ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="domain rating, keyword rankings, top queries - the full breakdown">
          Analytics
        </SectionTitle>
        <Link
          href="/analytics"
          className="group block rounded-xl bg-neutral-900 p-4 transition-colors hover:bg-neutral-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div>
              <p className="text-xs text-neutral-400">Domain Rating</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                {overview.dr?.dr ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Keywords in the top 100</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                {overview.rankingCount}
                <span className="ml-1 text-sm font-normal tracking-normal text-neutral-400">
                  of {overview.rankings.length}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Clicks to built pages · 28d</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                {[...overview.guides, ...overview.tools]
                  .reduce((a, p) => a + p.clicks, 0)
                  .toLocaleString("en-US")}
              </p>
            </div>
            <span className="ml-auto text-sm text-sky-400 group-hover:text-sky-300">
              Open Analytics <span aria-hidden="true">→</span>
            </span>
          </div>
        </Link>
      </section>

      {/* ---------- AI VISIBILITY (GEO) - do AI assistants cite this site? ---------- */}
      <Suspense fallback={<SectionSkeleton rows={4} />}>
        <AiVisibilitySection project={project} />
      </Suspense>

      {/* ---------- TREND RADAR (high on purpose - hype decays by the day) ---------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <SectionTitle
            sub={
              <>
                what your niche is talking about right now - pick a subject, get ideas, ship
                the winner ·{" "}
                {project.last_trend_scan_at
                  ? `last scan ${shortDate(project.last_trend_scan_at)}`
                  : "scans only when you fire it"}{" "}
                ·{" "}
                <Link
                  href="/trends"
                  className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                >
                  All trends
                </Link>
              </>
            }
          >
            Trend radar
          </SectionTitle>
          <TrendScanButton scanning={scanning} />
        </div>
        <TrendScanPoller scanning={scanning} />
        {scanning ? <TrendScanSweep /> : null}
        {trendTopics.length === 0 && trendPending.length === 0 ? (
          scanning ? null : (
            <EmptyState>
              Nothing on the radar. Hit Scan now to sweep your niche - the subjects being talked
              about right now land here, and nothing is queued until you pick one.
            </EmptyState>
          )
        ) : (
          <div className="space-y-4">
            {/* Subjects awaiting a pick - compact rows; the Trends page has the
                full evidence and the takes flow. */}
            {shownTopics.length > 0 ? (
              <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 p-4 sm:p-5">
                {shownTopics.map((t) => {
                  const days = Math.floor(
                    (Date.now() - new Date(t.created_at).getTime()) / 86400000,
                  );
                  return (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-xs font-medium text-sky-400">Trending now</span>
                          <span
                            className={`text-xs ${days > 7 ? "text-amber-400/90" : "text-emerald-400"}`}
                          >
                            {days === 0
                              ? "caught today"
                              : `${days} day${days === 1 ? "" : "s"} old`}
                          </span>
                        </div>
                        <p className="font-medium">{t.title}</p>
                        {t.evidence?.why_now ? (
                          <p className="text-sm text-neutral-400">{t.evidence.why_now}</p>
                        ) : null}
                      </div>
                      {t.status === "new" ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <ExpandTopicButton id={t.id} />
                          <DismissTopicButton id={t.id} />
                        </div>
                      ) : t.status === "expanding" ? (
                        <span className="shrink-0 text-sm text-neutral-400">
                          ⏳ working on ideas
                        </span>
                      ) : (
                        <Link
                          href="/trends"
                          className="shrink-0 text-sm text-sky-400 underline underline-offset-2 hover:text-sky-300"
                        >
                          ideas below · decide on Trends
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Ideas waiting on a decision - queue or skip. Collapsed by
                default; same IdeaCard the Trends page renders. */}
            {shownIdeas.length > 0 ? (
              <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
                {shownIdeas.map((s) => (
                  <IdeaCard
                    key={s.id}
                    s={s}
                    fromTopic={
                      s.trend_topic_id ? (topicTitleOf.get(s.trend_topic_id) ?? null) : null
                    }
                  />
                ))}
              </div>
            ) : null}

            {moreTrends > 0 ? (
              <Link
                href="/trends"
                className="inline-block text-sm font-medium text-sky-400 hover:text-sky-300"
              >
                + {moreTrends} more on Trends →
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {/* ---------- NEXT ACTIONS ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="things waiting on you">Next actions</SectionTitle>

        <AddIdeaCard />

        {allClear ? (
          <EmptyState>All clear. Nothing needs a decision right now.</EmptyState>
        ) : (
          <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
            {showBalanceNudge ? (
              <div className="rounded-xl bg-neutral-900 p-4 text-sm text-amber-300 sm:p-5 lg:col-span-2">
                DataForSEO balance is ${balance?.toFixed(2)} - top up before the daily rank checks run dry.
              </div>
            ) : null}

            {prs.map((pr) => (
              <div key={pr.number} className="space-y-3 rounded-xl bg-neutral-900 p-4 sm:p-5">
                <p className="text-xs font-medium text-emerald-400">
                  {autoMergeOn ? "Merging itself" : "Ready to ship"}
                </p>
                <p className="font-medium">{pr.title}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={pr.html_url}
                    target="_blank"
                    className="text-sm text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  >
                    Review PR #{pr.number} (preview link inside)
                  </a>
                  {autoMergeOn ? (
                    mergeReady ? (
                      <span className="text-xs text-neutral-400">
                        merges on its own once checks pass - no action needed
                      </span>
                    ) : (
                      // autoMergeOn used to claim "no action needed" here
                      // unconditionally, even with no merge token connected -
                      // the sweep that's supposed to merge this silently has
                      // nothing to authenticate with, and nothing said so.
                      <span className="text-xs text-amber-400">
                        auto-merge is on, but no GitHub token is connected - this won&apos;t merge
                        until you connect one (Home&apos;s &quot;Connect GitHub&quot; card)
                      </span>
                    )
                  ) : mergeReady ? (
                    <MergeButton number={pr.number} />
                  ) : null}
                </div>
              </div>
            ))}

            {indexingTasks.length > 0 ? (
              <div className="space-y-4 rounded-xl bg-neutral-900 p-4 sm:p-5 lg:col-span-2">
                {/* What + why, two short lines. */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-emerald-400">Get it on Google</p>
                  <p className="font-medium">
                    One paste indexes{" "}
                    {indexingTasks.length > 1
                      ? `all ${indexingTasks.length} new pages`
                      : "your new page"}
                  </p>
                  <p className="text-xs text-neutral-400">
                    Bing and Yandex were pinged automatically. Google only takes requests by
                    hand.
                  </p>
                </div>

                {/* The whole job in three steps. */}
                <ol className="space-y-3">
                  <li className="flex gap-3">
                    <span className="mt-2 flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-md bg-neutral-800 text-xs font-medium text-neutral-400">
                      1
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <CopyButton text={indexingCommand} label="Copy the paste" />
                      <details>
                        <summary className="cursor-pointer select-none text-xs text-sky-400 hover:text-sky-300">
                          See the full command
                        </summary>
                        <div className="mt-2">
                          <CopyBlock text={indexingCommand} />
                        </div>
                      </details>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-md bg-neutral-800 text-xs font-medium text-neutral-400">
                      2
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm text-neutral-400">
                        Paste it into Claude Code (the VS Code prompt box). It clicks through
                        Search Console in Chrome, so be signed in there.
                      </p>
                      <ChromeExtensionTip />
                    </div>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-md bg-neutral-800 text-xs font-medium text-neutral-400">
                      3
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <IndexRequestedDoneAll ids={indexingTasks.map((p) => p.id)} />
                      <span className="text-sm text-neutral-400">
                        if it could not mark them itself - with the MCP connected, the agent
                        clears this card on its own
                      </span>
                    </div>
                  </li>
                </ol>

                {/* The pages themselves - a checklist, not the main event. The
                    per-row Done covers partial runs (quota hit, already indexed). */}
                <div className="divide-y divide-neutral-800/40 border-t border-neutral-800/70 pt-1">
                  {indexingTasks.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 py-2 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{p.title ?? p.url}</p>
                        <p className="truncate text-xs text-neutral-600">
                          {p.url} · shipped {shortDate(p.published_at ?? p.created_at)}
                        </p>
                      </div>
                      <IndexRequestedDone id={p.id} />
                    </div>
                  ))}
                </div>

                <details className="border-t border-neutral-800/70 pt-3">
                  <summary className="cursor-pointer select-none text-xs text-sky-400 hover:text-sky-300">
                    Do it manually instead
                  </summary>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-neutral-400">
                    {indexingManualSteps(project).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-neutral-500">
                    Google allows roughly 10 manual indexing requests per property per day.
                  </p>
                </details>
              </div>
            ) : null}

            {pendingSugs.map((s) => (
              <div key={s.id} className="space-y-3 rounded-xl bg-neutral-900 p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-sky-400">Approve this {s.type}?</span>
                  {s.keyword_volume != null ? (
                    <span className="text-xs text-neutral-400">
                      {s.primary_keyword} · {s.keyword_volume}/mo · KD {s.keyword_difficulty ?? "?"}
                    </span>
                  ) : null}
                </div>
                <p className="font-medium">{s.title}</p>
                {s.rationale ? <p className="text-sm text-neutral-400">{s.rationale}</p> : null}
                <DecideButtons id={s.id} />
              </div>
            ))}

          </div>
        )}

        {indexingMigrationMissing && indexingTasks.length > 0 ? (
          <p className="text-sm text-amber-300">
            One-time step: paste supabase/migrations/0005_index_requested.sql into the Supabase
            SQL editor so Mark as done sticks.
          </p>
        ) : null}

        {/* Status lines, not actions: the automated builders own the queue
            (guides ship one per morning via the daily builder; tools build the
            moment they are approved). */}
        {approvedUnbuilt.length > 0 ? (
          <p className="text-sm text-neutral-400">
            {approvedUnbuilt.length} approved item{approvedUnbuilt.length > 1 ? "s" : ""} queued for
            the automated builders - guides ship one per morning, top of the queue first (reorder on
            the{" "}
            <Link href="/research" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
              Queue
            </Link>
            ). Next up: {approvedUnbuilt[0].title}
          </p>
        ) : null}
        {inProgress.map((s) => (
          <p key={s.id} className="text-sm text-neutral-400">
            ⏳ Building now: {s.title}
          </p>
        ))}
      </section>

      {/* ---------- BACKLINK PLAYBOOK ---------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <SectionTitle sub={`${playbookDoneCount} of ${playbookItems.length} done`}>
            Backlink playbook
          </SectionTitle>
          <Link
            href="/backlinks"
            className="whitespace-nowrap text-sm text-sky-400 underline underline-offset-2 hover:text-sky-300"
          >
            Full playbook
          </Link>
        </div>
        <div className="space-y-4 rounded-xl bg-neutral-900 p-4 sm:p-5">
          <ProgressMeter done={playbookDoneCount} total={playbookItems.length} />
          <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
            <PlaybookColumn
              heading="Free"
              items={playbookNextFree}
              allDone="Every free link is done."
            />
            <PlaybookColumn
              heading="Paid"
              items={playbookNextPaid}
              allDone="Every paid link is done."
            />
          </div>
        </div>
      </section>

      {/* ---------- ACTIVITY (the instant-wins log - deliberately last) ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="what your SEO manager has been doing, without you asking">
          Activity
        </SectionTitle>
        <Suspense fallback={<SectionSkeleton />}>
          <ActivitySection projectId={project.id} milestones={journey.fresh_milestones} />
        </Suspense>
      </section>
    </div>
  );
}
