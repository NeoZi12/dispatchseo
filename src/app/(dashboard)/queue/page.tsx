import Link from "next/link";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { getDomainRating } from "@/lib/domain-rating";
import { kdZones } from "@/lib/kd-zones";
import { getHostedQueue, type HostedQueue } from "@/lib/autopilot/queue";
import { weekStartUtc } from "@/lib/autopilot/math";
import { TOPIC_LIMITS } from "@/lib/autopilot/controls";
import { suggestTopicAction } from "@/app/autopilot-actions";
import { ActionForm } from "@/components/ui/action-form";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeading } from "@/components/ui/page-heading";
import { loadReport, redirectIfAgent } from "../mode";
import { QueueBoard } from "./queue-board";

export const dynamic = "force-dynamic";

// The hosted writer's queue: every idea it will write, in the order it will
// write them, with the day each is expected to start. The list and the dates
// come from lib/autopilot/queue.ts (shared with get_autopilot's `upcoming`),
// which mirrors the writer's pick stage exactly. Agent projects keep their
// own queue on /research.
//
// Server-rendered in full (the board is a client component, so it still
// arrives as HTML and reads without JS); drag, reorder, set aside, put back
// and add are the client's enhancements. Every one of them is reversible,
// so there is no confirm dialog anywhere on this screen.
//
// Not behind requireOnboarded, same as Articles: the queue fills during
// setup, and an owner mid-setup should be able to see and shape it.

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
      description="Articles are written from the top down. Reorder or set aside anything here; it can all be undone."
      actions={
        <Link href="/articles" className={LINK}>
          Articles
        </Link>
      }
    />
  );

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
        slug={project.slug}
        now={now}
        zones={zones}
        upcoming={queue.upcoming}
        parked={queue.parked}
        nextStart={queue.nextStart}
        usedThisWeek={queue.usedThisWeek}
        quota={queue.quota}
        paused={queue.paused}
        startedDays={started}
        addForm={
          <ActionForm action={suggestTopicAction} slug={project.slug} submitLabel="Add topic" successLabel="Added" variant="secondary" inline resetOnSuccess>
            <Field id="queue-topic" label="A topic or keyword you want an article on" hint="We check it fits your site and isn't covered yet, then add it to the end.">
              <Input id="queue-topic" name="topic" placeholder="e.g. how to price a first SaaS plan" maxLength={TOPIC_LIMITS.max} required minLength={TOPIC_LIMITS.min} />
            </Field>
          </ActionForm>
        }
      />
    </div>
  );
}
