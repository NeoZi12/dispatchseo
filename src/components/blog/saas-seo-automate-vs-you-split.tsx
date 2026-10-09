// Which SaaS SEO jobs a schedule can run unattended and which stay with the
// founder. Two columns, so the line between them is visible at a glance.

const AUTOMATE = [
  "Rank and Search Console snapshots",
  "Keyword research and the idea queue",
  "Drafting a page to your site's template",
  "Opening the pull request",
] as const;

const YOURS = [
  "Choosing which ideas get built",
  "Product claims, pricing and screenshots",
  "Reading the PR before it merges",
  "Deciding what the product is for",
] as const;

function Column({ title, items, tone }: { title: string; items: readonly string[]; tone: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-sm leading-relaxed text-neutral-300">
            <svg viewBox="0 0 24 24" className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5 9-10" />
            </svg>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SaasSeoAutomateVsYouSplit() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      <Column title="A schedule can run" items={AUTOMATE} tone="text-emerald-400" />
      <Column title="Still yours" items={YOURS} tone="text-amber-300" />
    </div>
  );
}
