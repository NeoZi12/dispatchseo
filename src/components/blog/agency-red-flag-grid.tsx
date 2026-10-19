// Six sales-call red flags when buying SEO from an agency, each paired with the
// question that exposes it. This is the guide's own judgment, not measured
// data - it exists so the reader can run the checklist on a live call.

const FLAGS = [
  {
    flag: "Guaranteed rankings",
    ask: "What happens to the fee if page one doesn't happen?",
    icon: <path d="M12 3l8 4v5c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V7l8-4zM9 12l2 2 4-4" />,
  },
  {
    flag: "No Search Console access",
    ask: "Will I be an owner on the property, with you added as a user?",
    icon: <path d="M4 5h16v11H4zM8 20h8M12 16v4M8 10l2.5 2.5L16 8" />,
  },
  {
    flag: "Content mill output",
    ask: "Who in your team has used a product like mine, and who edits the drafts?",
    icon: <path d="M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5" />,
  },
  {
    flag: "Reports about activity, not pages",
    ask: "Which URLs shipped last month, and what did each one get?",
    icon: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  },
  {
    flag: "Bought links in the deliverables",
    ask: "Where do the links come from, and can I see the pages?",
    icon: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  },
  {
    flag: "Long lock-in, no exit file",
    ask: "If I leave in month four, what do I keep?",
    icon: <path d="M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z" />,
  },
] as const;

export function AgencyRedFlagGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {FLAGS.map((f) => (
        <div key={f.flag} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-amber-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
              {f.icon}
            </svg>
            <h3 className="text-[15px] font-semibold text-neutral-100">{f.flag}</h3>
          </div>
          <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">Ask</p>
          <p className="text-sm leading-relaxed text-neutral-300">{f.ask}</p>
        </div>
      ))}
    </div>
  );
}
