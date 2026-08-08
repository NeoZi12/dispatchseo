// The line this guide draws in its last section: what "ranking in ChatGPT"
// shares with ordinary SEO versus what's actually a different job. Most
// page-1 advice blurs the two together as one flat checklist.

function FoundationIcon() {
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
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function SparkIcon() {
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
      <path d="M12 3v5M12 16v5M4.5 12h5M14.5 12h5" />
      <path d="M7 7l3 3M14 14l3 3M17 7l-3 3M10 14l-3 3" />
    </svg>
  );
}

const CLASSIC = [
  {
    title: "Crawlable, indexable pages",
    detail: "an AI engine still has to be able to fetch and parse the page before it can ever cite it - the same technical floor Google has always required.",
  },
  {
    title: "Backlinks and third-party mentions",
    detail: "authority signals AI engines lean on too, same as organic rank - a page nobody else references is a page few models reach for.",
  },
  {
    title: "Genuinely matching the query's intent",
    detail: "the oldest SEO rule of all - a page answering a different question than the one asked doesn't get cited by an algorithm or a model.",
  },
];

const NEW = [
  {
    title: "Answer-first, chunk-friendly structure",
    detail: "Google tolerates a slow build-up before the point; a model reads in chunks and quotes whichever one already stands alone.",
  },
  {
    title: "Freshness weighted far more heavily",
    detail: "AI-cited pages run measurably newer than organic results for the same query - a stronger recency bias than classic ranking factors carry.",
  },
  {
    title: "A tracked metric, not a one-time audit",
    detail: "there's no AI-engine equivalent of checking a SERP position by eye - citation only shows up if something actually logs it over time.",
  },
];

export function ClassicVsAiTacticsSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <FoundationIcon />
          <h3 className="text-sm font-semibold">Still just SEO fundamentals</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {CLASSIC.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-300">
          <SparkIcon />
          <h3 className="text-sm font-semibold">Genuinely different for AI answers</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {NEW.map((item) => (
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
