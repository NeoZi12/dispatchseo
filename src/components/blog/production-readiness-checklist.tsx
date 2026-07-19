// Five questions that separate a demo MCP server from one you'd trust with
// real tenants - the checklist version of the three-pattern comparison above,
// for skimming against whatever example you're actually looking at.

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
    title: "Auth resolves an identity, not just a key",
    detail: "Does the server know WHO is calling, or only that a valid-looking key showed up?",
  },
  {
    title: "Two callers get two different answers",
    detail: "If tenant scoping is real, the same tool call returns different data for different callers - one shared key can't do that.",
  },
  {
    title: "Descriptions are written for a chooser, not a reader",
    detail: "A model picking between dozens of tools needs a sentence or two per tool, not a one-line label written for a human skimming docs.",
  },
  {
    title: "A failed call returns structured JSON, not a stack trace",
    detail: "Errors round-trip a message the caller can act on instead of taking the whole process down.",
  },
  {
    title: "Something persists between calls",
    detail: "A database, a queue, a file - state that outlives the single request, not just variables that die when it returns.",
  },
] as const;

export function ProductionReadinessChecklist() {
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
