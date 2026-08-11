// The actual page-1 organic results for "google search console mcp", pulled
// live via check_serp during the session that wrote this guide - real
// positions, domains, and titles, not a paraphrase. Positions 1 and 6 came
// back as non-organic (ad/PAA) blocks and are omitted, not skipped.

function RepoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M8 5 3 12l5 7M16 5l5 7-5 7M14 4l-4 16" />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M6 4h9l4 4v12H6z" />
      <path d="M15 4v4h4M9 12h6M9 16h6" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 18v-1a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v1M9 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM14 18v-1a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v1M17.5 11A2.25 2.25 0 1 0 17.5 6.5" />
    </svg>
  );
}

function DirectoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="4" y="4" width="16" height="4" rx="1" />
      <rect x="4" y="10" width="16" height="4" rx="1" />
      <rect x="4" y="16" width="16" height="4" rx="1" />
    </svg>
  );
}

function ConnectorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M9 3v4M15 3v4M6 7h12l-1.5 6h-9L6 7ZM9 13v3a3 3 0 0 0 6 0v-3" />
    </svg>
  );
}

const ICONS = {
  repo: <RepoIcon />,
  guide: <GuideIcon />,
  community: <CommunityIcon />,
  directory: <DirectoryIcon />,
  connector: <ConnectorIcon />,
} as const;

const KIND_LABEL = {
  repo: "open-source repo",
  guide: "setup guide",
  community: "community thread",
  directory: "directory listing",
  connector: "SaaS connector",
} as const;

const ROWS = [
  { pos: 2, domain: "github.com", kind: "repo" as const, label: "AminForou/mcp-gsc: Google Search Console Insights" },
  { pos: 3, domain: "suganthan.com", kind: "guide" as const, label: "Google Search Console MCP: Step by Step Setup Guide" },
  { pos: 4, domain: "reddit.com", kind: "community" as const, label: "I built an MCP server for Google Search Console so AI can..." },
  { pos: 5, domain: "mcpservers.org", kind: "directory" as const, label: "Google Search Console MCP Server" },
  { pos: 7, domain: "mcpmarket.com", kind: "directory" as const, label: "Google Search Console MCP: Analyze Search Data" },
  { pos: 8, domain: "ekamoira.com", kind: "guide" as const, label: "Google Search Console MCP Servers Compared" },
  { pos: 9, domain: "windsor.ai", kind: "connector" as const, label: "Google Search Console MCP: Claude, ChatGPT & More" },
  { pos: 10, domain: "openseo.so", kind: "connector" as const, label: "No Google Cloud Setup - Search Console MCP" },
] as const;

export function GscMcpFieldGrid() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl bg-neutral-900">
      {ROWS.map((r, i) => (
        <div
          key={r.pos}
          className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-neutral-800/70" : ""}`}
        >
          <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-500">
            {r.pos}
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
            {ICONS[r.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm text-neutral-100">{r.domain}</p>
            <p className="truncate text-xs text-neutral-500">{r.label}</p>
          </div>
          <span className="hidden shrink-0 text-xs uppercase tracking-wide text-neutral-600 sm:block">
            {KIND_LABEL[r.kind]}
          </span>
        </div>
      ))}
    </div>
  );
}
