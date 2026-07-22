import { requireDashboard } from "@/lib/auth-gate";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { getAnalyticsOverview } from "@/lib/analytics-data";
import { sortQueue, type Suggestion, type TrendTopic } from "@/lib/metrics";
import {
  DismissTopicButton,
  ExpandTopicButton,
  QueueRemoveButton,
} from "@/components/client";
import { TrendScanButton, TrendScanPoller, TrendScanSweep } from "@/components/trend-scan";
import { CollapsibleCard } from "@/components/collapsible-card";
import { AgeBadge, IdeaCard, KeywordLine, SeedLine, specLines } from "@/components/idea-card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// The two-stage trend pipeline in one screen. Stage 1 (Scan now) puts the
// SUBJECTS the niche is talking about on the radar. Stage 2 (Get takes on a
// subject) expands the ones you pick into concrete guide angles, which land
// under their subject for your call: add to queue or skip.
// Approving a take places it at the front of the visible build queue
// (decideSuggestion does the placement), so the ship forecast here is just
// the queue order; the 14-day hype window still drives the freshness badges
// and the scan's stale-topic cleanup.

const HYPE_WINDOW_DAYS = 14;
const EXPAND_COOLDOWN_MIN = 30;
// A scan run normally reports back within 3-6 minutes; past this it is
// presumed dead and the page stops showing the sweep.
const SCAN_TIMEOUT_MIN = 15;

function daysOld(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function minutesOld(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The daily guide builder fires at 05:00 UTC. Slot 0 is the next run.
function buildRunLabel(slot: number) {
  const now = new Date();
  const run = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5),
  );
  if (now.getTime() >= run.getTime()) run.setUTCDate(run.getUTCDate() + 1);
  run.setUTCDate(run.getUTCDate() + slot);
  const day = run.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const daysAway = Math.round(
    (run.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86400000,
  );
  const when = daysAway === 0 ? "this morning" : daysAway === 1 ? "tomorrow morning" : day;
  return `${when} · ${day} 05:00 UTC`;
}

// AgeBadge, KeywordLine, and specLines moved to components/idea-card.tsx -
// shared with Home's radar so both surfaces render ideas identically.

// Topic evidence is structured by propose_trend_topic: why_now + signals[] +
// sources[]. Same tolerant rendering as idea specs.
function topicEvidenceLines(evidence: TrendTopic["evidence"]) {
  return specLines((evidence ?? null) as Record<string, unknown> | null);
}

export default async function TrendsPage() {
  await requireDashboard();
  await requireOnboarded();

  const project = await getActiveProject();
  const [sugRes, topicRes, scanRes, overview] = await Promise.all([
    db()
      .from("suggestions")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    db()
      .from("trend_topics")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    // Selected apart from the project row so a pre-0016 schema (column
    // missing) reads as "not scanning" instead of breaking the page - same
    // tolerance as topicsMissing below.
    db()
      .from("projects")
      .select("trend_scan_requested_at")
      .eq("id", project.id)
      .maybeSingle(),
    getAnalyticsOverview(project),
  ]);
  const suggestions = (sugRes.data ?? []) as Suggestion[];

  // A scan is out when it was requested after the last completed scan and the
  // request is recent enough to still be running. Older than that without a
  // completion = the run died; the amber note re-arms the button.
  const scanRequestedAt = scanRes.error
    ? null
    : ((scanRes.data as { trend_scan_requested_at?: string | null } | null)
        ?.trend_scan_requested_at ?? null);
  const scanPending =
    scanRequestedAt != null &&
    (!project.last_trend_scan_at ||
      new Date(scanRequestedAt).getTime() > new Date(project.last_trend_scan_at).getTime());
  const scanning = scanPending && minutesOld(scanRequestedAt as string) < SCAN_TIMEOUT_MIN;
  const scanStale = scanPending && !scanning;
  // A failed topics query means migration 0016 hasn't run - the radar shows
  // the nudge and the rest of the page keeps working.
  const topicsMissing = Boolean(topicRes.error);
  const allTopics = (topicRes.data ?? []) as TrendTopic[];
  const topics = allTopics.filter((t) => t.status !== "dismissed");
  // Titles for the "from:" line on idea cards - includes dismissed topics so
  // an idea never loses its source subject.
  const topicTitleOf = new Map(allTopics.map((t) => [t.id, t.title]));

  const trend = suggestions.filter((s) => s.source === "trend-scan");
  const pendingTakes = trend.filter((s) => s.status === "pending");
  const takesByTopic = new Map<string, Suggestion[]>();
  for (const s of pendingTakes) {
    if (!s.trend_topic_id) continue;
    takesByTopic.set(s.trend_topic_id, [
      ...(takesByTopic.get(s.trend_topic_id) ?? []),
      s,
    ]);
  }
  const approved = trend.filter((s) => s.status === "approved");
  const building = trend.filter((s) => s.status === "in_progress");
  const shipped = trend
    .filter((s) => s.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const expired = trend.filter((s) => s.status === "rejected").length;

  // Mirror of the build-guide pick rule, so "when will this ship" is honest:
  // the visible queue order (owner positions first, then FIFO). One guide per
  // morning; slot index = mornings away.
  const guideQueue = suggestions.filter(
    (s) => s.status === "approved" && s.type === "guide",
  );
  const buildOrder = sortQueue(guideQueue);
  const slotOf = new Map(buildOrder.map((s, i) => [s.id, i]));
  // Still worth flagging: an approved trend idea past its hype window ships
  // with its edge gone - the amber note nudges a re-think, not a rule.
  const isFreshTrend = (s: Suggestion) =>
    s.source === "trend-scan" && daysOld(s.created_at) < HYPE_WINDOW_DAYS;

  // Live traffic for shipped trend guides, matched by primary keyword.
  const trafficFor = (s: Suggestion) =>
    overview.guides.find(
      (g) =>
        g.primary_keyword &&
        s.primary_keyword &&
        g.primary_keyword.toLowerCase() === s.primary_keyword.toLowerCase(),
    ) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Trends"
          hint={`Two moves: Scan now sweeps your niche for the subjects being talked about right now (launches, Reddit and Hacker News buzz, Google Trends) - just subjects, nothing queued. Hit Get ideas on one you like and concrete guide angles land under it for your call: add to queue or skip. An approved idea jumps to the front of the queue and ships on the next build your publishing pace allows - the pace keeps a young site from reading as spam to Google.${
            project.last_trend_scan_at
              ? ` Last scan: ${shortDate(project.last_trend_scan_at)}.`
              : " No scan recorded yet."
          }`}
        />
        <TrendScanButton scanning={scanning} />
        <TrendScanPoller scanning={scanning} />
      </div>

      {/* ---------- ON THE RADAR (subjects - stage 1) ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="what your niche is talking about right now - pick a subject to get ideas on it">
          On the radar
        </SectionTitle>
        {/* The sweep sits above the topic cards: a scan adds to the radar,
            it doesn't replace what's already on it. */}
        {scanning ? <TrendScanSweep /> : null}
        {scanStale ? (
          <p className="text-sm text-amber-400/90">
            The scan didn&apos;t report back - it may have failed. Safe to fire again.
          </p>
        ) : null}
        {topicsMissing ? (
          <p className="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-300">
            The radar needs migration 0016_trend_topics.sql - paste it into the Supabase SQL
            editor once and scans will start landing subjects here.
          </p>
        ) : topics.length === 0 ? (
          scanning ? null : (
            <EmptyState>
              Nothing on the radar. Hit Scan now to sweep your niche - trending subjects land
              here, and nothing is queued until you pick one.
            </EmptyState>
          )
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {topics.map((t) => {
              const takes = takesByTopic.get(t.id) ?? [];
              const expandStale =
                t.status === "expanding" &&
                (!t.expand_requested_at ||
                  minutesOld(t.expand_requested_at) >= EXPAND_COOLDOWN_MIN);
              const evidence = topicEvidenceLines(t.evidence);
              return (
                <CollapsibleCard
                  key={t.id}
                  toggleLabel="Show the evidence"
                  header={
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-xs font-medium text-sky-400">Trending now</span>
                        <AgeBadge createdAt={t.created_at} />
                      </div>
                      <p className="font-medium">{t.title}</p>
                      {/* Short status one-liner stays visible - it IS the card's
                          state, not detail. */}
                      {t.status === "expanding" && !expandStale ? (
                        <p className="text-sm text-neutral-400">
                          ⏳ Working on ideas - requested{" "}
                          {t.expand_requested_at
                            ? `${minutesOld(t.expand_requested_at)} min ago`
                            : "just now"}
                          , they land here when the run finishes.
                        </p>
                      ) : null}
                      {/* The ideas themselves live in the "Ideas - your call"
                          section below - this static pointer keeps the link. */}
                      {t.status === "expanded" && takes.length > 0 ? (
                        <p className="text-sm text-sky-400">
                          {takes.length} idea{takes.length === 1 ? "" : "s"} below - your call
                        </p>
                      ) : null}
                    </>
                  }
                  teaser={
                    t.status === "expanded" && takes.length === 0
                      ? "No ideas waiting - get more or dismiss"
                      : undefined
                  }
                  actions={
                    t.status === "new" || expandStale ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <ExpandTopicButton id={t.id} />
                        <DismissTopicButton id={t.id} />
                      </div>
                    ) : undefined
                  }
                >
                  {expandStale ? (
                    <p className="text-sm text-neutral-400">
                      The ideas run hasn&apos;t reported back - it may have failed. Safe to
                      fire again.
                    </p>
                  ) : null}

                  {evidence.length > 0 || t.evidence?.seed_url ? (
                    <div className="space-y-1 border-t border-neutral-800/70 pt-2">
                      <SeedLine from={t.evidence} />
                      {evidence.map((l) => (
                        <p key={l.label} className="text-xs text-neutral-400">
                          <span className="font-medium text-neutral-300">{l.label}:</span>{" "}
                          {l.text}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {t.status === "expanded" && takes.length === 0 ? (
                    <div className="space-y-2 border-t border-neutral-800/70 pt-3">
                      <p className="text-sm text-neutral-400">
                        No ideas waiting on this subject - you decided them all, or none
                        survived validation.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <ExpandTopicButton id={t.id} again />
                        <DismissTopicButton id={t.id} />
                      </div>
                    </div>
                  ) : null}
                </CollapsibleCard>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- IDEAS AWAITING A CALL (pulled out of the topic cards, and
           where the pre-topic legacy ideas fold in - same call either way) ---------- */}
      {pendingTakes.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle sub="concrete guide angles from the subjects you picked - queue the winners, skip the rest">
            Ideas - your call
          </SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {pendingTakes.map((s) => (
              <IdeaCard
                key={s.id}
                s={s}
                fromTopic={s.trend_topic_id ? (topicTitleOf.get(s.trend_topic_id) ?? null) : null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- APPROVED (the build schedule) ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="approved trend ideas and the morning each one ships - fresh ones cut the line, one guide per day">
          In the build queue
        </SectionTitle>
        {approved.length === 0 ? (
          <EmptyState>No approved trend ideas queued right now.</EmptyState>
        ) : (
          <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 p-4 sm:p-5">
            {approved
              .slice()
              .sort((a, b) => (slotOf.get(a.id) ?? 99) - (slotOf.get(b.id) ?? 99))
              .map((s) => {
                const slot = slotOf.get(s.id);
                const fresh = isFreshTrend(s);
                return (
                  <div key={s.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-xs font-medium text-neutral-400">
                        #{slot != null ? slot + 1 : "?"} in queue
                      </span>
                      <AgeBadge createdAt={s.created_at} />
                      {!fresh ? (
                        <span className="text-xs text-neutral-400">
                          hype window closed - builds in normal order
                        </span>
                      ) : null}
                    </div>
                    <p className="font-medium">{s.title}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-neutral-400">
                        {slot != null
                          ? `Builds ${buildRunLabel(slot)}`
                          : "Waiting for a build slot"}
                        {slot === 0 ? " - next up" : ""}
                      </p>
                      <QueueRemoveButton id={s.id} />
                    </div>
                  </div>
                );
              })}
            <p className="pt-3 text-xs text-neutral-500">
              Times assume the daily builder&apos;s 05:00 UTC run and one guide per morning; an
              already-open SEO PR pauses the queue until it merges, and the publishing pace
              can hold a morning&apos;s build - on purpose, so the site never bursts content.
            </p>
          </div>
        )}
      </section>

      {/* ---------- BUILDING NOW ---------- */}
      {building.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle sub="the builder picked it up - a PR appears when it's done">
            Building now
          </SectionTitle>
          {building.map((s) => (
            <p key={s.id} className="text-sm text-neutral-400">
              ⏳ {s.title}
            </p>
          ))}
        </section>
      ) : null}

      {/* ---------- SHIPPED ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="trend guides that made it to the site, with the search traffic they've earned">
          Shipped
        </SectionTitle>
        {shipped.length === 0 ? (
          <EmptyState>
            No trend guides shipped yet - the first one lands on the next paced build after
            you approve a take.
          </EmptyState>
        ) : (
          <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 p-4 sm:p-5">
            {shipped.map((s) => {
              const traffic = trafficFor(s);
              return (
                <div key={s.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {s.completed_at ? (
                      <span className="text-xs text-emerald-400">
                        shipped {shortDate(s.completed_at)}
                      </span>
                    ) : null}
                    <KeywordLine s={s} />
                  </div>
                  <p className="font-medium">{s.title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {traffic ? (
                      <span className="text-neutral-400">
                        {traffic.clicks} clicks · {traffic.impressions} impressions (28d)
                      </span>
                    ) : (
                      <span className="text-neutral-400">no search traffic recorded yet</span>
                    )}
                    {s.result_pr_url ? (
                      <a
                        href={s.result_pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                      >
                        View PR
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {expired > 0 ? (
          <p className="text-xs text-neutral-500">
            {expired} trend idea{expired === 1 ? "" : "s"} expired or skipped along the way -
            hype that didn&apos;t survive its window.
          </p>
        ) : null}
      </section>

      <p className="text-sm text-neutral-400">
        The radar&apos;s behavior is a playbook, not code - tune both stages on the{" "}
        <Link href="/instructions" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
          Instructions
        </Link>{" "}
        page. Scans and takes fire only from these buttons, and nothing builds without your
        approve.
      </p>
    </div>
  );
}
