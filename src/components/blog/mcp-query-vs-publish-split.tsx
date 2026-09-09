// SE Ranking's own homepage advertises an MCP integration - "query data
// through AI assistants like Claude" - so both products now speak MCP.
// The split below is structural, not a benchmark: what an agent sitting on
// each server can actually do, read against SE Ranking's own feature copy
// and this project's own tool registry (src/app/api/[transport]/route.ts).

function QueryIcon() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function PublishIcon() {
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
      <path d="M12 3v12M12 3l4 4M12 3 8 7" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

const SE_RANKING_MCP = [
  { title: "Ask for a keyword's current position", detail: "the MCP call reads the same rank data the dashboard shows" },
  { title: "Ask for a competitor's backlink count", detail: "a query against the existing dashboard modules" },
  { title: "Ask it to draft or publish a page", detail: "not part of the MCP surface - that stays a separate, paid Content Editor step, opened by hand" },
];

const DISPATCHSEO_MCP = [
  { title: "Ask for a keyword's current position", detail: "get_rankings reads the same nightly rank-check data" },
  { title: "Ask it to research and queue a content idea", detail: "keyword_ideas + propose_suggestion, from the same session" },
  { title: "Ask it to draft and publish a page", detail: "the agent writes the guide and opens the pull request itself - no second tool to open" },
];

export function McpQueryVsPublishSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <QueryIcon />
          <h3 className="text-sm font-semibold">SE Ranking&apos;s MCP server - query only</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {SE_RANKING_MCP.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <PublishIcon />
          <h3 className="text-sm font-semibold">DispatchSEO&apos;s MCP server - query and act</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {DISPATCHSEO_MCP.map((item) => (
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
