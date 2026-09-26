// The signals that actually distinguish a hung run from a slow-but-alive one,
// pulled from what Claude Code's own docs document as legitimate long waits
// (subagent stall timeout, Monitor's default window, API retry events) versus
// what has no such budget at all (an unanswered permission prompt, a
// no-timeout MCP call to a server that stopped responding).

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

const STUCK = [
  { title: "No tool call is running, and nothing streams", detail: "the last event in the log is a permission prompt or an AskUserQuestion call, and there's no TTY or host to answer it" },
  { title: "An MCP call to a server that already dropped", detail: "no per-server timeout was set, so there's no wall-clock cap - only the idle timeout will ever end it, and idle timeouts default to 5-30 minutes" },
  { title: "CPU and network on the runner have gone flat", detail: "not thinking, not calling out, not writing - the process is holding a socket open on something that will never answer" },
];

const SLOW = [
  { title: "A Bash command you know takes a while", detail: "a full test suite or a dependency install, still inside BASH_MAX_TIMEOUT_MS's 10-minute ceiling" },
  { title: "Thin but real output keeps arriving", detail: "an MCP call's idle timeout resets on every progress notification, so a trickle of updates is a still-alive call, not a stuck one" },
  { title: "A subagent or background task inside its own budget", detail: "the 10-minute idle wait cap on background work, or a Monitor watch's 5-minute default, hasn't been hit yet" },
  { title: "system/api_retry events in the stream", detail: "the API is backing off from a rate limit or an overload, which looks idle in the terminal but is actively retrying underneath" },
];

export function StuckVsSlowSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-amber-300">
          <StopIcon />
          <h3 className="text-sm font-semibold">Actually stuck</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {STUCK.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <ClockIcon />
          <h3 className="text-sm font-semibold">Actually just slow</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {SLOW.map((item) => (
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
