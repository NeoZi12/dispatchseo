// Which job actually needs which shape - the decision this guide argues
// most "programmatic SEO tools" roundups skip in favor of a straight tool
// list.

function DatasetIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
    </svg>
  );
}

function CompassIcon() {
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
      <path d="M15 9l-2 6-6 2 2-6 6-2Z" />
    </svg>
  );
}

const SCALE_FIT = [
  { title: "A real dataset already exists", detail: "locations, SKUs, integrations, listings - rows that genuinely differ" },
  { title: "The template repeats safely", detail: "each row fills the same shape without reading as filler" },
  { title: "Volume is the point", detail: "coverage across hundreds of near-duplicate intents, not one competitive query" },
];

const JUDGMENT_FIT = [
  { title: "No dataset to merge", detail: "the query needs an argument made, not a field filled in" },
  { title: "The keyword is competitive", detail: "page 1 already has authority sites; sameness gets discounted, not rewarded" },
  { title: "One wrong page costs more than one right page is worth", detail: "a gate that can say no matters more than a bigger run" },
];

export function ScaleVsJudgmentFitSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <DatasetIcon />
          <h3 className="text-sm font-semibold">Reach for template + dataset</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {SCALE_FIT.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <CompassIcon />
          <h3 className="text-sm font-semibold">Reach for one-page-a-day judgment</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {JUDGMENT_FIT.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
