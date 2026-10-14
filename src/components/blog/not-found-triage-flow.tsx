// The decision path for one URL in Search Console's "Not found (404)" list.
// It shows the guide's triage section as three questions in order, each with
// the outcome it leads to. Every label is real DOM text.

const STEPS = [
  {
    q: "Does it still get impressions, clicks or backlinks?",
    no: "Leave the 404. Nothing is lost and Google drops it on its own.",
    yes: "Keep going - this URL has value worth keeping.",
  },
  {
    q: "Is there a page that now answers the same query?",
    no: "Return a real 404 or 410. Do not redirect to the homepage.",
    yes: "Add a 301/308 redirect to that one page.",
  },
  {
    q: "Does the URL return 200 but show an empty or error-looking page?",
    no: "It is a plain 404. You are done.",
    yes: "Soft 404: add real content, or make it return a true 404.",
  },
] as const;

function ArrowDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  );
}

export function NotFoundTriageFlow() {
  return (
    <ol className="not-prose my-6 space-y-2 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => (
        <li key={s.q}>
          <div className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">{s.q}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <p className="rounded-lg bg-neutral-950 p-3 text-sm text-neutral-300">
                  <span className="block text-xs uppercase tracking-wide text-neutral-500">No</span>
                  {s.no}
                </p>
                <p className="rounded-lg bg-neutral-950 p-3 text-sm text-neutral-300">
                  <span className="block text-xs uppercase tracking-wide text-emerald-400">Yes</span>
                  {s.yes}
                </p>
              </div>
            </div>
          </div>
          {i < STEPS.length - 1 ? (
            <div className="ml-1.5 mt-2 text-neutral-600">
              <ArrowDown />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
