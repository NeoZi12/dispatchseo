import Link from "next/link";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { getDomainRating } from "@/lib/domain-rating";
import { kdZones } from "@/lib/kd-zones";
import { getHostedQueue, type HostedQueue } from "@/lib/autopilot/queue";
import { weekStartUtc } from "@/lib/autopilot/math";
import { Callout } from "@/components/ui/callout";
import { PageHeading } from "@/components/ui/page-heading";
import { loadReport, redirectIfAgent } from "../mode";
import { QueueBoard } from "./queue-board";
import { UpgradePanel, fmtCount } from "@/components/upgrade-panel";

export const dynamic = "force-dynamic";

// The hosted writer's queue: every idea it will write, in the order it will
// write them, with the day each is expected to start. The list and the dates
// come from lib/autopilot/queue.ts (shared with get_autopilot's `upcoming`),
// which mirrors the writer's pick stage exactly. Agent projects keep their
// own queue on /research.
//
// Read-only (owner, 2026-11-05): owners see what's coming and when, they
// don't reorder or remove it. The agent still can, over MCP.
//
// Not behind requireOnboarded, same as Articles: the queue fills during
// setup, and an owner mid-setup should be able to see it.
//
// Free tier (billing.ts isFreePlan, on the report): the screen is locked -
// Overview shows the next three topics; the whole list and its dates come
// with a plan.

const DAY = 86_400_000;
const LINK = "text-sm font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";

export default async function QueuePage() {
  await requireDashboard();
  await redirectIfAgent("/research");
  const project = await getActiveProject();
  const now = Date.now();

  const [queue, dr, report] = await Promise.all([
    getHostedQueue(project).catch((e: unknown): HostedQueue | null => {
      console.error("[queue] could not read the queue", e);
      return null;
    }),
    // The weekly snapshot only (creds null): rendering never buys DataForSEO.
    getDomainRating(project.id, project.domain, null).catch(() => null),
    // Only for the days this week's articles started on (the week strip's
    // filled cells). Cached per request; a failed read leaves them unplaced.
    loadReport(project.id),
  ]);
  const zones = kdZones(dr?.dr);

  const heading = (
    <PageHeading
      className="arrive-up"
      title="Queue"
      description="What gets written next, and when. Articles are written from the top down."
      actions={
        <Link href="/articles" className={LINK}>
          Articles
        </Link>
      }
    />
  );

  if (report?.plan.free) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        {heading}
        <FreeQueue waiting={queue?.upcoming.length ?? 0} />
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        {heading}
        <Callout tone="warn" title="The queue didn't load" role="status">
          Writing carries on in the background. Reload in a minute.
        </Callout>
      </div>
    );
  }

  // The UTC day each of this week's counted articles started on. The count
  // itself is the queue's usedThisWeek (the same number the scheduler
  // reads); the report only says WHICH days, so it never adds cells.
  const weekStart = weekStartUtc(new Date(now)).getTime();
  const started = (report?.articles ?? [])
    .map((a) => ({ t: Date.parse(a.createdAt), failed: a.status === "failed" }))
    .filter((a) => Number.isFinite(a.t) && a.t >= weekStart && a.t < weekStart + 7 * DAY)
    // A stopped run may not have used a slot, so it is the first to drop.
    .sort((a, b) => Number(a.failed) - Number(b.failed) || a.t - b.t)
    .slice(0, queue.usedThisWeek)
    .map((a) => Math.floor(a.t / DAY) * DAY);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {heading}
      <QueueBoard
        now={now}
        zones={zones}
        upcoming={queue.upcoming}
        nextStart={queue.nextStart}
        usedThisWeek={queue.usedThisWeek}
        quota={queue.quota}
        monthShare={queue.monthShare}
        usedThisMonth={queue.usedThisMonth}
        paused={queue.paused}
        startedDays={started}
      />
    </div>
  );
}

/** The locked Queue screen for a free-tier site (see UpgradePanel). */
function FreeQueue({ waiting }: { waiting: number }) {
  return (
    <UpgradePanel
      art="queue"
      stat={waiting > 0 ? fmtCount(waiting) : undefined}
      title={waiting > 0 ? `${waiting === 1 ? "topic" : "topics"} researched and waiting` : "See what gets written next"}
    />
  );
}
