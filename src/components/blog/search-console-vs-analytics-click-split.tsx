// The one-line split of the guide as a picture: Search Console covers
// everything up to the click on a Google result, Analytics everything after
// the page loads. The same click sits on the border between them, which is
// why the two totals are close cousins and never twins. Every label is text.

const BEFORE = ["Queries typed", "Impressions", "Average position", "Click-through rate", "Indexing and crawl errors"];
const AFTER = ["Sessions and engaged time", "Pages per visit", "Conversions and revenue", "Traffic from every channel", "Visitors who left the site"];

function Column({ tone, title, tool, items }: { tone: "violet" | "neutral"; title: string; tool: string; items: readonly string[] }) {
  const accent = tone === "violet" ? "text-violet-400" : "text-neutral-300";
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{title}</p>
      <h3 className={`mt-1 text-[15px] font-semibold ${accent}`}>{tool}</h3>
      <ul className="mt-3 space-y-2 text-sm text-neutral-300">
        {items.map((i) => (
          <li key={i} className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 ${accent}`} aria-hidden="true">
              <path d="M5 12l4 4 10-10" />
            </svg>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SearchConsoleVsAnalyticsClickSplit() {
  return (
    <div className="not-prose my-6 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <Column tone="violet" title="Before the click" tool="Search Console" items={BEFORE} />
      <div className="flex flex-row items-center justify-center gap-2 sm:flex-col">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-amber-300" aria-hidden="true">
          <path d="M5 3l5 15 2.5-6L19 9.5z" />
          <path d="M13 13l5 5" />
        </svg>
        <span className="text-xs uppercase tracking-wide text-amber-300">The click</span>
      </div>
      <Column tone="neutral" title="After the click" tool="Google Analytics" items={AFTER} />
    </div>
  );
}
