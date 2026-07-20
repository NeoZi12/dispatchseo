// Five ways a Claude Code <-> MCP server connection silently isn't working
// yet, pulled from the MCP docs' own documented failure modes - not a
// generic "check your config" list.

function CheckIcon() {
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
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

const ITEMS = [
  {
    title: "/mcp lists it with a nonzero tool count",
    detail: "A server that advertises tools but exposes none gets flagged right there in the panel - connected isn't the same as useful.",
  },
  {
    title: "It isn't stuck at \"pending approval\"",
    detail: "A project-scoped server from an untracked .mcp.json waits for you to run claude interactively and accept the workspace trust dialog before it connects at all.",
  },
  {
    title: "The JSON entry has a type field, not just a url",
    detail: "An entry with a url but no type is read as a stdio server and skipped, with an explicit error naming the misconfigured server - not a silent no-op.",
  },
  {
    title: "A 401 resolved itself once, not on every call",
    detail: "Claude Code refreshes an expired token and retries automatically; only a second failure marks the server as needing re-authentication in /mcp.",
  },
  {
    title: "The name isn't one of the five reserved ones",
    detail: "workspace, claude-in-chrome, computer-use, Claude Preview, and Claude Browser belong to Claude Code's own built-in servers - claude mcp add rejects any of them outright.",
  },
] as const;

export function ConnectionChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 text-violet-400">
              <CheckIcon />
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
