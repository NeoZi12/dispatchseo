// The commands and real output from building and running the minimal image in
// this guide's Dockerfile section (Docker 28.0.4, Claude Code 2.1.287, run
// while writing it). Every number here is a pasted result, not an estimate.

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

const ROWS = [
  { check: "docker build, warm layer cache for apt", result: "13 s", note: "ten-line Dockerfile on node:22-bookworm-slim" },
  { check: "image size", result: "682 MB", note: "Node, git, curl and the claude CLI" },
  { check: "claude --version inside the image", result: "2.1.287", note: "npm install -g @anthropic-ai/claude-code@latest" },
  { check: "id with USER node", result: "uid=1000(node)", note: "non-root, which bypass mode requires" },
  { check: "--dangerously-skip-permissions as root", result: "refused", note: "\"cannot be used with root/sudo privileges for security reasons\"" },
  { check: "touch into a bind mount owned by uid 1001", result: "Permission denied", note: "fixed with --user $(id -u):$(id -g)" },
  { check: "curl api.anthropic.com with --network none", result: "could not resolve host", note: "curl exit 6 - the container has no route out" },
] as const;

export function ContainerRunFactRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-neutral-400">
        <BoxIcon />
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Built and run on a GitHub Actions runner while writing this guide
        </h3>
      </div>
      <ul className="mt-4 divide-y divide-neutral-800">
        {ROWS.map((r) => (
          <li key={r.check} className="grid gap-1 py-3 sm:grid-cols-[1.3fr_1fr_1.5fr] sm:gap-4">
            <span className="text-sm text-neutral-300">{r.check}</span>
            <span className="font-mono text-sm font-semibold text-violet-400">{r.result}</span>
            <span className="text-sm text-neutral-400">{r.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
