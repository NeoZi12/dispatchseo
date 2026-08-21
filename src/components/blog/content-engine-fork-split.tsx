// Both products run the same underlying job - research a gap, draft it,
// publish it, exchange links for it - but the last two steps are where the
// models actually diverge: Outrank's engine auto-publishes straight through
// its own integrations, this project's stops at a pull request. Sourced from
// outrank.so's own product and pricing pages (publishing integrations,
// backlink exchange, auto-publish framing) plus this repo's actual pipeline
// (src/app/api/[transport]/route.ts, the build-guide workflow this run is
// executing).

function EngineIcon() {
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
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h6v6H9z" />
      <path d="M9 4v2M15 4v2M9 18v2M15 18v2M4 9h2M4 15h2M18 9h2M18 15h2" />
    </svg>
  );
}

function AgentIcon() {
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
      <path d="M9 4 4 6.5v6C4 16.5 6.2 19.3 9 20c2.8-.7 5-3.5 5-7.5v-6L9 4Z" />
      <path d="M7.3 12.2l1.4 1.4 3-3.4" />
    </svg>
  );
}

const OUTRANK_STEPS = [
  { title: "Niche + competitor plan generated", detail: "Outrank explores keywords and builds a 30-day content plan" },
  { title: "Article drafted and imaged automatically", detail: "AI writes it, AI-generated images auto-insert" },
  { title: "Auto-published through an integration", detail: "WordPress, Webflow, Shopify, Notion, or a webhook - no review gate" },
  { title: "Backlink exchange runs in the background", detail: "AI adds links to your site inside partner articles, and back" },
];

const DISPATCH_STEPS = [
  { title: "Suggestion queued, SERP-gated", detail: "Only proposed if the draft can genuinely beat page 1" },
  { title: "Your own agent drafts it", detail: "Claude Code, Codex, or Cursor - whichever already knows your repo" },
  { title: "PR opened with a deploy preview", detail: "Nothing ships until the preview link is checked" },
  { title: "You click merge", detail: "The one step Outrank's engine skips entirely" },
];

export function ContentEngineForkSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <EngineIcon />
          <h3 className="text-sm font-semibold">Outrank&apos;s engine - runs to publish</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {OUTRANK_STEPS.map((s) => (
            <li key={s.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{s.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <AgentIcon />
          <h3 className="text-sm font-semibold">DispatchSEO&apos;s engine - runs to a PR</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {DISPATCH_STEPS.map((s) => (
            <li key={s.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{s.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
