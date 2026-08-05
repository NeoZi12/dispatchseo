// The actual division of labor in an agent-driven, self-hosted setup - drawn
// from this project's own build-guide and build-tool instructions, not a
// pitch: most of the job runs on a schedule, and the owner's job shrinks to
// the review step, not the research or the drafting.

function RunsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}

const RUNS_UNATTENDED = [
  {
    title: "Keyword research and idea queueing",
    detail: "search volume, difficulty, and SERP weakness checked against your own DataForSEO account",
  },
  {
    title: "Drafting, visuals, and the humanizer pass",
    detail: "template, thin-content gate, mandatory bespoke visuals, then a pass to kill AI tells",
  },
  {
    title: "Rank tracking and Search Console sync",
    detail: "SERP position and GSC stats pulled on their own cron cadence, no one has to remember to check",
  },
];

const YOU_REVIEW = [
  {
    title: "The finished pull request",
    detail: "guides ship build-first - you review the merge-ready PR, not the idea behind it",
  },
  {
    title: "Tool ideas, before the weekly build",
    detail: "unless you've turned auto-approve on, a new tool waits for your call on the dashboard",
  },
  {
    title: "What the dashboard actually shows",
    detail: "rank history, GSC trends, and cron health, on whatever schedule you check it - not a client call",
  },
];

export function FounderWorkflowSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <RunsIcon />
          <h3 className="text-sm font-semibold">Runs unattended</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {RUNS_UNATTENDED.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <ReviewIcon />
          <h3 className="text-sm font-semibold">You review</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {YOU_REVIEW.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
