// The honest decision split this guide argues for: refreshing an old post and
// catching a topic while it's rising are different tools for different jobs,
// not competing philosophies - this is the "when NOT to" half of the piece.

function RefreshIcon() {
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
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function TrendUpIcon() {
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
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

const REFRESH_WINS = [
  {
    title: "Evergreen reference pages",
    detail: "glossary and definition pages get searched for the fact, not the novelty - update the fact, not the whole page",
  },
  {
    title: "A page already ranking well",
    detail: "a refresh protects authority a page already earned; front-loading only helps a page that doesn't exist yet",
  },
  {
    title: "Anything tied to a fixed external fact",
    detail: 'pricing pages, version numbers, "best X in [year]" roundups - the trigger is the fact changing, not a calendar',
  },
];

const FRONTLOAD_WINS = [
  {
    title: "Anything an AI engine cites recency-first",
    detail: "per Ahrefs' own numbers, that's most of what ChatGPT and Perplexity cite - a polished rewrite still loses to a genuinely new post",
  },
  {
    title: "A subject still forming",
    detail: "being early to a real, rising topic beats being thorough about a settled one - less competition, more room to be the first citable source",
  },
  {
    title: "A small team's actual time budget",
    detail: "catching ten rising topics costs less than rewriting one old post ten times, and only one of those compounds",
  },
];

export function RefreshVsFrontloadSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <RefreshIcon />
          <h3 className="text-sm font-semibold">Refresh still wins</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {REFRESH_WINS.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-amber-300">
          <TrendUpIcon />
          <h3 className="text-sm font-semibold">Front-loading wins instead</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {FRONTLOAD_WINS.map((item) => (
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
