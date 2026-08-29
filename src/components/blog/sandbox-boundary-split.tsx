// What the built-in Bash sandbox actually wraps versus what keeps running
// straight on the host process - from the "Scope" and "Sandboxed Bash tool"
// sections of Claude Code's own sandboxing docs, not a generic inside/outside
// diagram. The split is the whole point: Read/Edit/Write, MCP servers, and
// hooks are NOT inside the boundary unless the separate sandbox runtime wraps
// the entire process.

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function OpenLockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 7-2.5" />
    </svg>
  );
}

const INSIDE = [
  { title: "Bash commands", detail: "every shell command Claude runs, plus their child processes" },
  { title: "Filesystem writes from those commands", detail: "walled to the working directory, --add-dir paths, and the session temp dir" },
  { title: "Network calls those commands make", detail: "routed through the sandbox proxy and its domain allowlist" },
];

const OUTSIDE = [
  { title: "Read, Edit, Write tools", detail: "run inside the Claude Code process itself - gated by permission rules, not the sandbox" },
  { title: "MCP servers", detail: "separate processes; unconstrained on the host unless the whole session runs inside the sandbox runtime" },
  { title: "Hooks", detail: "same as MCP servers - a PreToolUse or PostToolUse script runs on the host, not in the Bash boundary" },
];

export function SandboxBoundarySplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <LockIcon />
          <h3 className="text-sm font-semibold">Inside the sandbox boundary</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {INSIDE.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <OpenLockIcon />
          <h3 className="text-sm font-semibold">Still running straight on the host</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {OUTSIDE.map((item) => (
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
