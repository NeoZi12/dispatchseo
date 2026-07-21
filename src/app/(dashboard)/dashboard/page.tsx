import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isValidCookie } from "@/lib/dashboard-auth";
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
import { IdeaCard } from "@/components/idea-card";
import { TrafficByPage } from "@/components/seo-cards";
import { TrendScanButton, TrendScanPoller, TrendScanSweep } from "@/components/trend-scan";
import { sortQueue, type Suggestion, type TrendTopic } from "@/lib/metrics";
import { EmptyState, GscChart, Mono, PageHeader, ProgressMeter, SectionTitle } from "@/components/ui";
import { GlanceSection } from "@/components/glance-stats";
import { FREE_BACKLINKS, PAID_BACKLINKS } from "@/lib/playbook-data";
import { getActivityReport, type ActivityLine } from "@/lib/activity";
import { getCronHealth } from "@/lib/cron-alerts";
import { buildCronFixPrompt } from "@/lib/cron-fix-prompt";
import { getAnalyticsOverview } from "@/lib/analytics-data";
import { getJourney } from "@/lib/journey";
import { getWeeklyProgress } from "@/lib/progress";
import { JourneyCard } from "@/components/journey-card";
import { NextUpdate } from "@/components/next-update";
import { getActiveProject } from "@/lib/active-project";
import { DEFAULT_PROJECT_ID, effectiveAutomations, fetchProjectToken } from "@/lib/projects";
import { credsForProject } from "@/lib/dataforseo";
import { DataforseoConnectForm } from "@/components/dataforseo-connect";
import { gscAccessOk, serviceAccountEmail } from "@/lib/gsc";
import {
  indexingBrowserCommand,
  indexingManualSteps,
  indexingQueue,
  type IndexingPageRow,
} from "@/lib/indexing";
import { getPacing } from "@/lib/pacing";
import { mcpAddCommand, setupCommand } from "@/lib/mcp-connect";
import { PacingLine } from "@/components/pacing-info";
import { AgentStatus } from "@/components/agent-status";
import { FirstRunBackground } from "@/components/first-run-background";
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
      <div className="flex items-baseline justify-between gap-2">
        <p className={`font-medium ${coming ? "text-neutral-400" : ""}`}>{title}</p>
        {coming ? <span className="text-xs text-neutral-500">coming</span> : null}
        {state ? (
          <span className="shrink-0 text-xs font-medium text-emerald-400">{state}</span>
        ) : null}
      </div>
      <p className={`text-sm ${coming ? "text-neutral-500" : "text-neutral-400"}`}>{why}</p>
      {commandLabel ? <p className="pt-0.5 text-xs text-neutral-500">{commandLabel}</p> : null}
      {command ? <CopyBlock text={command} /> : null}
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
    <div className="space-y-2">
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

export default async function Home() {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");
  await requireOnboarded();

  const project = await getActiveProject();
  const isDefaultProject = project.id === DEFAULT_PROJECT_ID;
  // Free-tier DIY: every DataForSEO call bills the project's own account.
  const dfsCreds = await credsForProject(project);

  const client = db();
  const [
    sugRes,
    overview,
    kwCount,
    pageCount,
    prs,
    balance,
    profileRes,
    conventionsRes,
    playbookRes,
    activity,
    pagesRes,
    topicRes,
    scanRes,
    pacing,
    cronHealth,
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
    client
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("type", "guide"),
    openSeoPrs(project.github_repo),
    dataforseoBalance(dfsCreds),
    client.from("site_profile").select("id").eq("project_id", project.id).maybeSingle(),
    client.from("conventions").select("project_id").eq("project_id", project.id).maybeSingle(),
    client.from("playbook_status").select("slug, status").eq("project_id", project.id),
    getActivityReport(project.id),
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
    getCronHealth(),
  ]);

  // Cron alert banner (gap A4): the latest run per job, surfaced when it
  // failed or hasn't run within its expected window.
  const cronIssues = cronHealth.filter((h) => !h.ok || h.stale);

  // One-line version of the same trouble for the AgentStatus pill - the
  // green heartbeat flips red the moment any background job is unhealthy.
  const agentAlert =
    cronIssues.length === 0
      ? null
      : cronIssues.length === 1
        ? `${cronIssues[0].job} ${cronIssues[0].ok ? "is overdue" : "failed"}`
        : `${cronIssues.length} background jobs failing`;

  const suggestions = (sugRes.data ?? []) as Suggestion[];

  // The progress story (journey stage + weekly movers) - derived from the
  // overview already fetched above, plus one cheap query each.
  const [journey, weekly] = await Promise.all([
    getJourney(project, overview),
    getWeeklyProgress(project, overview),
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
    project.pipeline_installed_at != null ||
    (!conventionsRes.error && conventionsRes.data != null);
  const agentActive =
    agentWired && (automations.auto_build_guides || automations.auto_build_tools);

  // One-time setup steps, derived from data. Each actionable card disappears
  // once done, and every condition is computed for the ACTIVE project. Cards
  // the wizard's power-ups step unchecked stay hidden (powerups_skipped).
  const skippedPowerup = (key: string) => project.powerups_skipped.includes(key);
  const mergeReady = await canMerge();
  const needsMergeToken = !mergeReady && !skippedPowerup("merge");
  // Free-tier DIY: the project chose DataForSEO as its keyword source but has
  // no account connected yet. Free-mode projects (serpapi/gsc) never see this
  // card - their data source is already set.
  const needsDataforseo = project.keyword_source === "dataforseo" && dfsCreds == null;
  const needsFunding = balance != null && balance < 10;
  // "Build your first page" assumes the pipeline exists - that's true for the
  // default project; a newly added project gets the pipeline-install card
  // instead until content starts landing.
  // In auto mode the daily builder handles the first page on schedule - the
  // "build it right now" nudge only makes sense when a human drives.
  const needsFirstPage =
    isDefaultProject &&
    (pageCount.count ?? 0) === 0 &&
    !hasShipped &&
    !effectiveAutomations(project).auto_build_guides;
  const needsPipeline =
    !isDefaultProject && (pageCount.count ?? 0) === 0 && !hasShipped && !skippedPowerup("pipeline");
  // The install's footprint: the workflow's final step stamps
  // pipeline_installed_at via mark_pipeline_installed (0018); the conventions
  // row (written by setup, which install chains into) stays as the fallback
  // signal for installs that predate the stamp.
  const pipelineInstalled =
    project.pipeline_installed_at != null ||
    (!conventionsRes.error && conventionsRes.data != null);
  const pipelineTodo = needsPipeline && !pipelineInstalled;
  const pipelineWaiting = needsPipeline && pipelineInstalled;
  // Playbook personalization: show until the site_profile row exists. A table
  // error (migration 0003 not applied yet) suppresses the card - the playbook
  // page carries the migration nudge instead. Also hidden while the install
  // card shows: install runs setup, which saves the profile - two cards
  // would be the same ask twice.
  const needsProfile =
    !profileRes.error && profileRes.data == null && !skippedPowerup("playbook") && !pipelineTodo;
  // GSC connection: the project has a property configured but no traffic data
  // has ever landed - the service account is not on the property yet.
  const saEmail = await serviceAccountEmail();
  const needsGsc =
    Boolean(project.gsc_site_url) && overview.gscDaily.length === 0 && saEmail != null;
  // Only probe Google when the card would show at all: a successful read
  // means the owner already added the service account and the card should
  // say "waiting on the first sync" instead of re-explaining the step.
  const gscWaiting =
    needsGsc && project.gsc_site_url ? await gscAccessOk(project.gsc_site_url) : false;
  // The project's own MCP key, only fetched when a card needs to show it.
  const mcpToken = needsPipeline ? await fetchProjectToken(project.id) : null;
  // Mirrors the wizard's connect command. The server name is unique per
  // project (dispatchseo-<slug>, via mcpAddCommand) so connecting a second
  // site never collides with or silently shadows the first one's token.
  const hdrs = await headers();
  const dashOrigin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host") ?? "dispatchseo.com"}`;
  const connectCommand = mcpToken ? mcpAddCommand(project.slug, dashOrigin, mcpToken) : null;
  // The one-command onboarding (public/setup.sh): connect + verified secrets
  // + agent hand-off, run inside the site's repo.
  const setupCmd = mcpToken ? setupCommand(project.slug, dashOrigin, mcpToken) : null;

  // The funding card is the better surface for a low balance, so suppress the
  // amber nudge in Next actions whenever it shows.
  const showBalanceNudge = balance != null && balance < 5 && !needsFunding;
  // Approved items build themselves (guides: daily builder each morning;
  // tools: on dashboard approval) - the queue is a status line, not an action.
  const allClear =
    pendingSugs.length === 0 && prs.length === 0 && !showBalanceNudge && indexingTasks.length === 0;
  // Every setup card is conditional now (Phase 4 shipped, the "coming"
  // placeholder is gone) - hide the whole section once setup is complete.
  const hasSetupCards =
    needsMergeToken ||
    needsDataforseo ||
    needsFunding ||
    needsProfile ||
    needsFirstPage ||
    needsPipeline ||
    needsGsc;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {agentActive ? (
          <AgentStatus
            building={inProgress.length > 0}
            guidesQueued={
              automations.auto_build_guides && approvedUnbuilt.some((s) => s.type === "guide")
            }
            toolsQueued={
              automations.auto_build_tools && approvedUnbuilt.some((s) => s.type === "tool")
            }
            alert={agentAlert}
          />
        ) : null}
        <PageHeader
          title="Home"
          hint={`How ${project.domain} is doing, what's running on its own, and what needs you.`}
        />
        {cronIssues.length > 0 ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-red-200">Background jobs need attention</p>
            <ul className="mt-1 space-y-0.5 text-red-300/90">
              {cronIssues.map((h) => (
                <li key={h.job}>
                  <span className="font-mono">{h.job}</span>{" "}
                  {!h.ok
                    ? `failed on its last run${h.errors[0] ? ` - ${h.errors[0]}` : ""}`
                    : `hasn't run since ${new Date(h.last_run_at).toUTCString()}`}{" "}
                  <CronFixedButton job={h.job} />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <CopyButton
                text={buildCronFixPrompt(project, cronIssues)}
                label="Copy fix prompt for Claude Code"
              />
              <p className="text-xs text-red-300/70">
                Paste it into Claude Code - it inspects the job, fixes it, and clears this
                alert over MCP once the fix is verified.
              </p>
            </div>
            <p className="mt-2 text-xs text-red-300/70">
              Full detail in your Vercel function logs (daily-ranks) and GitHub Actions runs
              (hourly-gsc, deploy-check, the seo-* workflows, and the secrets canary).
            </p>
          </div>
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
        guidesPublished={pageCount.count ?? 0}
      />

      {/* ---------- INITIAL SETUP (hidden once every step is done) ---------- */}
      {hasSetupCards ? (
      <section className="space-y-3">
        <SectionTitle sub="everything needed to run this hands-off - cards watch live data, update to 'done, waiting' on their own, and disappear once each step truly completes">
          Initial setup
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          {needsGsc && gscWaiting ? (
            <SetupStep
              title="Google Search Console"
              state="connected, syncing"
              why={`Done on your side: the service account can read the ${project.domain} property. Traffic lands with the next hourly sync, and Google's own data runs 2-3 days behind on top - this card disappears by itself once the first day arrives.`}
            />
          ) : null}
          {needsGsc && !gscWaiting ? (
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
          {needsMergeToken ? (
            <SetupStep
              title="Enable one-tap merge"
              why="The dashboard can only see and merge pull requests on your private repo with a GitHub token. This is what makes approve = ship."
              steps={[
                <>
                  Open{" "}
                  <ExtLink href="https://github.com/settings/personal-access-tokens">
                    GitHub fine-grained tokens
                  </ExtLink>{" "}
                  and click Generate new token (fine-grained).
                </>,
                "Name it seo-dashboard-merge, set expiration to 1 year.",
                <>
                  Repository access: choose Only select repositories, and pick{" "}
                  {project.github_repo ?? "your content repo"}.
                </>,
                "Permissions: set Pull requests to Read and write, and Contents to Read and write. Leave everything else at No access.",
                "Generate the token and copy it.",
                <>
                  Open{" "}
                  <ExtLink href="https://vercel.com/dashboard">Vercel</ExtLink>, go to the
                  seo-manager-backend project, then Settings, then Environment Variables. Add
                  GH_MERGE_TOKEN with the token as its value, environment Production, and save.
                </>,
                "Go to the Deployments tab, open the menu on the latest deployment, and click Redeploy so the token loads.",
              ]}
              closing="When this is done, every open SEO pull request appears under Next actions with its review link and a Merge button, and this card disappears."
            />
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
              why="The Backlinks tab lists the best free and paid backlinks you can set up today, with every submission prefilled with your product's copy. Paste this in Claude Code, in your site's repo (not this dashboard's) - it researches your product and personalizes all of it. This card watches the saved profile and disappears the moment your agent writes it; still here means that run hasn't happened yet."
              command="Call the seo-manager MCP tool get_instructions with workflow setup and follow it exactly."
            />
          ) : null}
          {needsFirstPage ? (
            <SetupStep
              title="Build your first page"
              why="You have an approved guide waiting - the daily builder will build it and open a PR automatically tomorrow morning. To build it right now instead of waiting, paste this in Claude Code (in your site's repo)."
              command="/seo-build"
            />
          ) : null}
          {pipelineWaiting ? (
            <SetupStep
              title="Content pipeline"
              state="installed, first build pending"
              why={`Done on your side: your agent ran the install and setup for ${project.name}. The daily builder picks up the top approved idea each morning (05:00 UTC) - approve ideas in the Queue and the first PR shows up under Next actions. This card disappears once the first page ships.`}
            />
          ) : null}
          {pipelineTodo ? (
            <SetupStep
              title="Install the content pipeline in your repo"
              why={`The automations - daily guides, weekly tools, validation, auto-merge - run as GitHub Actions in your site's repo, on your own Claude Code subscription. One command sets up everything: it talks you through each step, checks every value actually works before saving it, then your own agent installs the pipeline and marks this card done.`}
              commandLabel={`Paste in a terminal, inside your site's repo${project.github_repo ? ` (${project.github_repo})` : ""}:`}
              command={setupCmd ?? undefined}
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
                "It will ask you to: approve once in the browser (your Claude Code token - verified before it's saved), and type your DataForSEO email + the API password from app.dataforseo.com/api-access (only if this project uses DataForSEO; NOT your login password).",
                "It ends by launching your Claude Code, which fetches the pipeline, adapts it to your stack, opens the install PR, and flips this card green itself.",
                "Needs: Claude Code and the GitHub CLI (gh, logged in). The script tells you exactly what's missing if anything is.",
                "Connecting more than one site? Each site's repo gets its own command with its own key - that key is what sends each repo's work to the right project. Safe to re-run any time.",
              ]}
              closing="The key in the command only sees this project's data. In Semi mode nothing merges without you; the PRs just appear under Next actions."
            />
          ) : null}
        </div>
      </section>
      ) : null}

      {/* Background first runs (research / rank check) - the wizard tracks
          only owner actions, so the machine work shows here, self-hiding. */}
      {pipelineInstalled ? <FirstRunBackground slug={project.slug} /> : null}

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
      <AiVisibilitySection project={project} />

      {/* ---------- TREND RADAR (high on purpose - hype decays by the day) ---------- */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
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
              <div className="grid gap-4 lg:grid-cols-2">
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
          <div className="grid gap-4 lg:grid-cols-2">
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
                    <span className="text-xs text-neutral-400">
                      merges on its own once checks pass - no action needed
                    </span>
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
                    <p className="text-sm text-neutral-400">
                      Paste it into Claude Code (the VS Code prompt box). It clicks through
                      Search Console in Chrome, so be signed in there.
                    </p>
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
        <div className="flex items-start justify-between gap-3">
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
          <div className="grid gap-6 lg:grid-cols-2">
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
        <div className="grid items-start gap-4 lg:grid-cols-2">
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
              ...journey.fresh_milestones.map((m) => ({ label: `${m.label} 🎉` })),
              ...activity.week,
            ]}
            empty="Quiet week so far - the daily builder starts filling this."
          />
        </div>
      </section>
    </div>
  );
}
