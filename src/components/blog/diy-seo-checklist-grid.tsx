// The standard DIY small-business SEO checklist, grouped by the five jobs it
// actually breaks into - pulled from Google's own starter guide plus what the
// page-1 field for this keyword covers, not a generic "10 SEO tips" list.

function TechIcon() {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

function OnPageIcon() {
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
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M7.5 7.5h9M7.5 11h9M7.5 14.5h5.5" />
    </svg>
  );
}

function LocalIcon() {
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
      <path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  );
}

function ContentIcon() {
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
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 15.5h6" />
    </svg>
  );
}

function MonitorIcon() {
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
      <path d="M3 17l5-5 4 3 6-7 3 3" />
    </svg>
  );
}

const GROUPS = [
  {
    title: "Technical basics",
    icon: TechIcon,
    items: [
      "robots.txt allows crawling and points to a sitemap",
      "an XML sitemap exists and lists your real pages",
      "every page has a viewport tag and renders on a phone",
      "Google's URL Inspection tool can fetch and index the page",
    ],
  },
  {
    title: "On-page",
    icon: OnPageIcon,
    items: [
      "a unique, accurate title tag per page - business name included",
      "a one- or two-sentence meta description per page",
      "headings that break the page into real sections",
      "descriptive alt text on every image that carries meaning",
    ],
  },
  {
    title: "Local SEO",
    icon: LocalIcon,
    items: [
      "a claimed and verified Google Business Profile",
      "matching name, address, and phone number everywhere you're listed",
      "a handful of directory citations (industry-specific beats generic)",
      "a steady trickle of new customer reviews, not a one-time push",
    ],
  },
  {
    title: "Content",
    icon: ContentIcon,
    items: [
      "pages that answer a real question a customer would type",
      "no keyword stuffing - write for the person, not the crawler",
      "content that stays current instead of going stale",
      "a cadence you can actually sustain, even if it's monthly",
    ],
  },
  {
    title: "Monitoring",
    icon: MonitorIcon,
    items: [
      "Search Console verified on the property",
      "a monthly look at which queries you're getting impressions for",
      "checking that new pages actually got indexed",
      "watching for a manual action or crawl error, not just rank",
    ],
  },
] as const;

export function DiySeoChecklistGrid() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      {GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <div key={group.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-violet-400">
              <Icon />
              <h3 className="text-sm font-semibold text-neutral-100">{group.title}</h3>
            </div>
            <ul className="mt-3 space-y-2">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-relaxed text-neutral-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
