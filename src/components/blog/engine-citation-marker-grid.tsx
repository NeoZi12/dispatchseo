// The three answer engines don't show a citation the same way, and none of
// them put "you were cited" in plain words - this is the actual UI element
// to look for in each one, and the closest thing that looks like a citation
// but isn't. Built for this guide's engine-by-engine spine.

function CardLinkIcon() {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h6M7 12h10M7 15h4" />
    </svg>
  );
}

function FootnoteIcon() {
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
      <circle cx="12" cy="12" r="8.5" />
      <text
        x="12"
        y="15.6"
        fontSize="9"
        fontFamily="ui-monospace, Menlo, monospace"
        textAnchor="middle"
        stroke="none"
        fill="currentColor"
      >
        1
      </text>
    </svg>
  );
}

function ChipExpandIcon() {
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
      <rect x="3" y="7" width="18" height="7" rx="3.5" />
      <path d="M9 18l3 2.2 3-2.2" />
    </svg>
  );
}

const ENGINES = [
  {
    name: "ChatGPT",
    icon: <CardLinkIcon />,
    does: "A small source card or inline link sits right under the sentence it backs, and only appears on a response that actually shows the browsing/search indicator.",
    doesNot: "Your brand named from memory, with no search indicator anywhere on that response and no card attached - a well-known product gets described without ChatGPT ever looking it up.",
  },
  {
    name: "Perplexity",
    icon: <FootnoteIcon />,
    does: "A bracketed number sits immediately after the sentence, on essentially every answer - Perplexity runs a search by default, so this isn't a mode you have to turn on.",
    doesNot: "Your brand named in a sentence with no bracket sitting next to it. No number nearby means that clause wasn't sourced from your page, whoever it's talking about.",
  },
  {
    name: "Google AI Overview / Gemini",
    icon: <ChipExpandIcon />,
    does: "Your URL shows up as one of the small linked cards under the generated summary, including inside the expanded list behind a \"Show more\" control.",
    doesNot: "Your brand or product described in the summary paragraph with no matching card in that source strip once you expand it.",
  },
] as const;

export function EngineCitationMarkerGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {ENGINES.map((e) => (
        <div key={e.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-neutral-200">
            {e.icon}
            <h3 className="text-sm font-semibold">{e.name}</h3>
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-emerald-400">Counts as cited</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-300">{e.does}</p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-amber-300">Doesn&apos;t count</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-400">{e.doesNot}</p>
        </div>
      ))}
    </div>
  );
}
