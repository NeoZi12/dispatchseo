// The four categories this guide actually argues for - sorted by what a
// server DOES to your data, not what product area it's in. Facts are real:
// Context7 and GitHub MCP setup details fetched from their own repos, the
// DispatchSEO figures counted straight from this repo's own route file.

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CursorClickIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M4 4l7 16 2.5-6.5L20 11 4 4Z" />
      <path d="M17 17l3 3" />
    </svg>
  );
}

function GitBranchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M6 8.5V15.5" />
      <path d="M6 15.5C6 12 9 9 12 9h3.7" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
    </svg>
  );
}

const CATEGORIES = [
  {
    icon: <SearchIcon />,
    title: "Research & context",
    example: "Context7",
    fact: "npx ctx7 setup wires an API key and installs the Claude Code skill in one pass; the server itself exposes two tools, resolve-library-id and query-docs.",
  },
  {
    icon: <CursorClickIcon />,
    title: "Action - browser",
    example: "Playwright MCP",
    fact: "65+ tools built on accessibility-tree snapshots, not screenshots, so no vision model is needed to drive a real page.",
  },
  {
    icon: <GitBranchIcon />,
    title: "Action - your repo",
    example: "GitHub MCP",
    fact: "One remote endpoint, OAuth login, and a GITHUB_TOOLSETS env var that decides whether issues, pull_requests, or actions even load.",
  },
  {
    icon: <DatabaseIcon />,
    title: "State",
    example: "This site's own server",
    fact: "58 registered tools; grepping the route file shows only 3 ever leave this project's own database.",
  },
] as const;

export function McpCategoryGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {CATEGORIES.map((c) => (
        <div key={c.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {c.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{c.title}</h3>
          </div>
          <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">{c.example}</p>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{c.fact}</p>
        </div>
      ))}
    </div>
  );
}
