// What a container wraps and what it leaves reachable. The point of the split:
// the container contains the PROCESS (commands, installed tools, the home
// directory), but whatever you mount or pass in is inside the blast radius.
// Facts follow code.claude.com/docs/en/devcontainer's warning.

function Lock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-emerald-400" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Door() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-amber-300" aria-hidden="true">
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01" />
    </svg>
  );
}

const WALLED = [
  "Every shell command the agent runs",
  "Packages it installs and files it writes outside the mounts",
  "The rest of the host's filesystem and its other projects",
  "Processes, and the host's own ~/.ssh and cloud keys - unless you mount them",
];

const REACHABLE = [
  "The bind-mounted repo - edits land on the host as they happen",
  "Anything in the container's environment, including the Claude token",
  "Files in the ~/.claude volume, where credentials are stored",
  "Any host the network policy allows - open by default",
];

export function ContainerBoundarySplit() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Lock />
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Behind the container wall</h3>
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-300">
          {WALLED.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Door />
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Still inside the blast radius</h3>
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-300">
          {REACHABLE.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>
    </div>
  );
}
