// The decision path DispatchSEO's own seo-auto-merge workflow walks for each
// open `seo` PR, read from .github/workflows/seo-auto-merge.yml. Shows that the
// gate answers two narrow questions (is every file in an allowed directory, are
// all checks green) and says nothing about what the content of those files does.

function Step({ n, title, body, tone }: { n: number; title: string; body: string; tone: "ok" | "warn" }) {
  return (
    <li className="flex gap-3 rounded-lg bg-neutral-950/60 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 font-mono text-xs font-semibold text-violet-400">{n}</span>
      <div>
        <p className="text-sm font-medium text-neutral-200">{title}</p>
        <p className={`mt-1 text-sm ${tone === "ok" ? "text-neutral-400" : "text-amber-300"}`}>{body}</p>
      </div>
    </li>
  );
}

export function AutoMergeGateDecisionFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">What the gate asks of each open PR, in order</h3>
      <ol className="mt-4 grid gap-2">
        <Step n={1} title="Does the PR carry the seo label?" body="No label, no sweep. Anything else is invisible to the gate." tone="ok" />
        <Step n={2} title="Is every changed file under an allowed directory?" body="src/content/blog/, src/components/blog/, public/blog/covers/. One file outside and the PR waits for the owner." tone="ok" />
        <Step n={3} title="Is every check green?" body="Pending: retry later. Failing: leave it. Zero checks reported: do not merge, because no gate is not safe." tone="ok" />
        <Step n={4} title="Squash-merge, delete the branch" body="Nothing here reads what the files do. A component in an allowed directory passes on path alone." tone="warn" />
      </ol>
    </div>
  );
}
