// What actually happens to one authenticated tool call on dispatchseo.com's
// own MCP server - real function and identifier names from
// src/app/api/[transport]/route.ts, not a generic "client -> server" diagram.

const STEPS = [
  { label: "POST /api/mcp", detail: "Authorization: Bearer <token>" },
  { label: "authed()", detail: "reads the header, extracts the token" },
  { label: "getProjectByToken(token)", detail: "no match -> 401, stop here" },
  { label: "projectStore.run(project, ...)", detail: "AsyncLocalStorage scopes this request to one tenant" },
  { label: "mcpHandler(req)", detail: "routes to the requested tool" },
  { label: "currentProject()", detail: "the tool callback reads the scoped project - no project param passed in" },
  { label: "ok() / fail()", detail: "pretty-printed JSON text back to the client" },
] as const;

export function McpRequestFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="font-mono text-sm text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
