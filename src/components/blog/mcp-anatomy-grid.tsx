// The three pieces every MCP server needs (transport, tools, auth), each
// paired with the real choice dispatchseo.com's own server makes - concrete
// proof next to the abstract definition, not a generic bullet list.

function PlugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8Z" />
      <path d="M12 16v5" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

const PIECES = [
  {
    icon: <PlugIcon />,
    title: "Transport",
    spec: "How JSON-RPC messages physically move between client and server.",
    real: "mcp-handler ^1.1.0 on Streamable HTTP - no SSE, no Redis, one route.",
  },
  {
    icon: <WrenchIcon />,
    title: "Tools",
    spec: "Functions the model can call, each with a name, a description, and a typed input schema.",
    real: "40 tools registered via @modelcontextprotocol/sdk 1.26.0's server.registerTool.",
  },
  {
    icon: <LockIcon />,
    title: "Auth",
    spec: "Who's calling, and what data they're allowed to touch.",
    real: "One bearer token per tenant, resolved to a project row before any tool runs.",
  },
] as const;

export function McpAnatomyGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {PIECES.map((p) => (
        <div key={p.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {p.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{p.title}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{p.spec}</p>
          <p className="mt-2.5 border-t border-neutral-800/70 pt-2.5 text-xs leading-relaxed text-neutral-500">
            {p.real}
          </p>
        </div>
      ))}
    </div>
  );
}
