// What checking your own AI visibility by hand actually involves, tied to
// the real MCP tools that automate the last two steps (record_ai_citations,
// get_ai_visibility) - not a generic "monitor your brand" list.

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
    title: "Write down 8-10 real target queries",
    detail: "What your buyer actually types into an AI chat, not your brand name - \"ai visibility tracking tool\" gets checked, \"DispatchSEO\" doesn't tell you anything yet.",
  },
  {
    title: "Ask each one to Claude, ChatGPT, Perplexity, and Gemini separately",
    detail: "Same query, different engines, different answers and different cited sources - a citation on one says nothing about the other three.",
  },
  {
    title: "Read the actual answer, not just the yes/no",
    detail: "Note every domain the engine did cite. Not being named is a targeting list in disguise - it's who to study, not just a miss to log.",
  },
  {
    title: "Log it somewhere that outlives this session",
    detail: "record_ai_citations writes the engine, query, whether an answer ran, whether it cited you, and every source it did cite - a spreadsheet works too, as long as next month's check lands next to this one.",
  },
  {
    title: "Repeat monthly, not once",
    detail: "get_ai_visibility's trend line is only real once there's a second data point beside the first - a single check is a snapshot, not visibility tracking.",
  },
] as const;

export function CitationCheckChecklist() {
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
