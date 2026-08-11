// The two shapes side by side: what every public GSC MCP server on page 1
// does (reads Search Analytics data back to a chat window, then stops) next
// to what DispatchSEO's own get_site_stats/get_overview tools feed into -
// the nightly stale-page detector and the suggestions queue this build's own
// operating instructions describe. Structural, not a benchmark claim.

function ReadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </svg>
  );
}

const REPORTING_CHAIN = [
  { title: "GSC Search Analytics API", detail: "clicks, impressions, CTR, position - queried by an MCP tool call" },
  { title: "Answer lands in the chat", detail: "the numbers reach the person asking, formatted as a reply" },
  { title: "A person reads it", detail: "and decides, by hand, whether anything is worth doing about it" },
  { title: "Nothing persists", detail: "ask again tomorrow and the same read happens from zero" },
];

const LOOP_CHAIN = [
  { title: "get_site_stats + get_overview", detail: "same Search Analytics data, joined to rank history and the build queue" },
  { title: "Nightly stale-page detector", detail: "flags a published guide sitting at position 5-20 for its own keyword" },
  { title: "propose_suggestion -> update_suggestion", detail: "the gap becomes a queued decision, not a number in a transcript" },
  { title: "A page ships or an existing one gets refreshed", detail: "and the next GSC pull checks whether it worked" },
];

export function ReportingVsLoopFlow() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-400">
          <ReadIcon />
          <h3 className="text-sm font-semibold text-neutral-200">Every public GSC MCP server - reads, then stops</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {REPORTING_CHAIN.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-cyan-300">
          <LoopIcon />
          <h3 className="text-sm font-semibold">DispatchSEO&apos;s MCP - reads, then closes the loop</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {LOOP_CHAIN.map((item) => (
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
