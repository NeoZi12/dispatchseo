// The tactics that repeat across page 1 for "how to rank in chatgpt" -
// condensed from the live SERP read done for this guide (Reddit, LinkedIn,
// Neil Patel, Power Digital, Omnius), not invented from scratch.

function TargetIcon() {
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
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

const TACTICS = [
  {
    title: "Answer the question in the first two sentences",
    detail: "the model quotes a self-contained answer, not a page it has to interpret - bury the answer under three paragraphs of preamble and it has nothing clean to lift.",
  },
  {
    title: "Structure the page so a paragraph can stand alone",
    detail: "clear H2s per subtopic, one claim per paragraph - the model pulls a chunk, not the whole page, so each chunk needs to make sense without the ones around it.",
  },
  {
    title: "Carry a real signal of authority",
    detail: "a named author, a cited source, a specific number - the checklist advice everywhere calls this \"E-E-A-T\" without saying what to actually put on the page.",
  },
  {
    title: "Stay demonstrably current",
    detail: "a dated stat, a version number, a \"checked as of\" line - the freshness signal AI engines weigh more heavily than Google ever did.",
  },
  {
    title: "Mark up FAQs as structured data",
    detail: "schema.org FAQPage markup that mirrors the visible FAQ word for word - a low-effort way to hand the model pre-chunked question/answer pairs.",
  },
] as const;

export function ChatgptRankTacticsChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {TACTICS.map((item) => (
          <li key={item.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 text-violet-400">
              <TargetIcon />
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
