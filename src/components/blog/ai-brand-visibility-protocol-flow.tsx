// The weekly measurement protocol as a four-step flow: fixed prompts, each
// engine, a mention-vs-citation log, then the share-of-mentions number.
// Shows the guide's method at a glance so the table below it is the detail.

const STEPS = [
  {
    title: "Fix 20 prompts",
    detail: "What a buyer types, never your brand name. Frozen for 8 weeks.",
    icon: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>
    ),
  },
  {
    title: "Ask each engine",
    detail: "ChatGPT, Perplexity, Gemini, Google AI Overviews. Fresh chat, logged out.",
    icon: (
      <>
        <path d="M4 5h16v10H9l-5 4z" />
        <path d="M8 9h8" />
      </>
    ),
  },
  {
    title: "Log two columns",
    detail: "Named in the text, and linked as a source. They are different events.",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M12 5v14M4 11h16" />
      </>
    ),
  },
  {
    title: "Divide",
    detail: "Mentions over answers seen, per engine. One number, same day every week.",
    icon: (
      <>
        <path d="M5 12h14" />
        <circle cx="12" cy="6.5" r="1.5" />
        <circle cx="12" cy="17.5" r="1.5" />
      </>
    ),
  },
];

export function AiBrandVisibilityProtocolFlow() {
  return (
    <ol className="not-prose my-6 grid gap-3 sm:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 text-violet-400"
              aria-hidden="true"
            >
              {s.icon}
            </svg>
            <span className="text-xs uppercase tracking-wide text-neutral-500">Step {i + 1}</span>
          </div>
          <h3 className="mt-3 text-[15px] font-semibold text-neutral-100">{s.title}</h3>
          <p className="mt-1 text-sm text-neutral-400">{s.detail}</p>
        </li>
      ))}
    </ol>
  );
}
