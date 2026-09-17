// This project's own get_automations registry, called live while writing
// this guide - the actual order these four jobs run in on dispatchseo.com,
// not a hypothetical priority list. Each evidence line is the tool's real
// response, not a paraphrase.

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function DraftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ShipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}

const ORDER = [
  {
    icon: <ClockIcon />,
    name: "Rank + Search Console tracking",
    why: "closes the drift stage above first - the monitoring step nobody remembers to open becomes a job nobody has to remember",
    evidence: "get_automations: nightly rank check - \"Last ran Sep 17 - checked 2 keywords.\" Traffic snapshot - \"Latest snapshot is from Sep 17.\"",
  },
  {
    icon: <SearchIcon />,
    name: "Keyword and topic research",
    why: "the slowest part to do well by hand every week - validating an idea against real search volume before writing a word",
    evidence: "get_automations: weekly research run - \"Last queued suggestions on Sep 16.\"",
  },
  {
    icon: <DraftIcon />,
    name: "Drafting the weekly page",
    why: "only worth automating once tracking and research already feed it real targets - otherwise it's just shipping faster in the wrong direction",
    evidence: "get_automations: daily guide builder - \"Last guide built Sep 16 (PR #76).\"",
  },
  {
    icon: <ShipIcon />,
    name: "Publishing the result",
    why: "last on purpose - this is the one step most owners keep for themselves even after everything upstream runs unattended",
    evidence: "get_automations: hands-off publishing - merges once build, preview deploy, and review checks all pass.",
  },
] as const;

export function AutomateFirstOrderFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {ORDER.map((s, i) => {
        const last = i === ORDER.length - 1;
        return (
          <li key={s.name} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <div className="flex items-center gap-1.5 text-neutral-100">
                {s.icon}
                <p className="text-sm font-medium">{s.name}</p>
              </div>
              <p className="mt-1 text-sm text-neutral-400">{s.why}</p>
              <p className="mt-1 font-mono text-xs text-neutral-600">{s.evidence}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
