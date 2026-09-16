// The honest split none of the page-1 checklists for "diy seo for small
// business" draw: which items on that checklist you do once and never touch
// again, versus which ones come back on a schedule for as long as the
// business wants to rank. Recurring is the half that quietly stops.

function OnceIcon() {
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

function LoopIcon() {
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
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </svg>
  );
}

const ONE_TIME = [
  { title: "robots.txt and sitemap.xml", detail: "set once, only touched again if the site's structure changes" },
  { title: "Search Console + Business Profile verification", detail: "a one-time proof-of-ownership step" },
  { title: "Title tags and headings on existing pages", detail: "fixed once the on-page pass is done" },
  { title: "Initial directory citations", detail: "list the business once; corrections are rare after that" },
];

const RECURRING = [
  { title: "New content on a cadence", detail: "the checklist says \"publish regularly\" - that's every week, indefinitely" },
  { title: "Rank and SERP checks", detail: "someone has to notice when a page slips, not just when it's published" },
  { title: "Search Console review", detail: "new queries and crawl errors show up on their own schedule, not yours" },
  { title: "Reviews and fresh citations", detail: "local ranking factors that decay if they stop accumulating" },
];

export function OnceVsRecurringSeoSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <OnceIcon />
          <h3 className="text-sm font-semibold">Do it once</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {ONE_TIME.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <LoopIcon />
          <h3 className="text-sm font-semibold">Comes back on a schedule</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {RECURRING.map((item) => (
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
