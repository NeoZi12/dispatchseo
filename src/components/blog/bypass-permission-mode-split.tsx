// What --dangerously-skip-permissions (bypassPermissions mode) actually turns
// off versus the fixed short list Claude Code's own "actions no mode
// auto-approves" section says still requires a decision regardless of mode -
// plus the PreToolUse hook exception, which sits outside the permission
// system the flag disables entirely.

function UnlockedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 7-2.5" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StopHandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5" />
      <path d="M11 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M14 11V6a1.5 1.5 0 0 1 3 0v7" />
      <path d="M17 13v-2a1.5 1.5 0 0 1 3 0v5c0 3.3-2.2 6-6 6h-2c-2.3 0-3.4-.8-4.7-2.4l-3-3.7c-.6-.8-.4-1.7.3-2.2.7-.5 1.7-.4 2.4.3L9 16" />
    </svg>
  );
}

const SKIPPED = [
  { title: "Every tool call's permission prompt", detail: "file writes, shell commands, MCP tool invocations - none of them stop to ask" },
  { title: "Protected-path writes", detail: ".git, .claude, .mcp.json, shell startup files - normally never auto-approved, allowed here" },
  { title: "The one-time warning dialog", detail: "shown once interactively, then remembered - skipped entirely in non-interactive (-p) runs" },
];

const STILL_DECIDED = [
  { title: "Explicit ask rules and AskUserQuestion", detail: "a rule you wrote, or a tool built to require an answer, still stops the session" },
  { title: "rm / rmdir against a critical path", detail: "filesystem root, home directory, your working directory and its parents - still prompts" },
  { title: "A PreToolUse hook that denies", detail: "exits with code 2 and blocks the call before permissions are even evaluated - outside this system" },
];

export function BypassPermissionModeSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-amber-300">
          <UnlockedIcon />
          <h3 className="text-sm font-semibold">Skipped entirely</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {SKIPPED.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <StopHandIcon />
          <h3 className="text-sm font-semibold">Still requires a decision</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {STILL_DECIDED.map((item) => (
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
