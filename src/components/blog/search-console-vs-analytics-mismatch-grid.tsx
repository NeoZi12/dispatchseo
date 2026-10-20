// The five reasons the organic click count in Search Console and the organic
// session count in GA4 disagree, one card each, each with a rough direction.
// The causes are the guide's own reading of how the two tools count; the
// direction labels are tendencies, not measured sizes.

const REASONS = [
  {
    title: "Different unit",
    detail: "A click is one tap on a Google result. A session is a visit that Analytics recorded. One click can open no session, and one session can follow many clicks.",
    pull: "Either way",
    icon: (
      <>
        <circle cx="8" cy="12" r="4" />
        <rect x="14" y="8" width="7" height="8" rx="1.5" />
      </>
    ),
  },
  {
    title: "Consent and blockers",
    detail: "Analytics runs in the browser. A visitor who declines cookies or blocks the script is a Search Console click and no Analytics session.",
    pull: "GA4 lower",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M6.5 6.5l11 11" />
      </>
    ),
  },
  {
    title: "Landing before loading",
    detail: "Someone who closes the tab before the page finishes loading was counted by Google the moment they tapped, and never fired the tag.",
    pull: "GA4 lower",
    icon: (
      <>
        <path d="M12 4a8 8 0 100 16 8 8 0 000-16z" />
        <path d="M12 8v4l3 2" />
      </>
    ),
  },
  {
    title: "Channel grouping",
    detail: "GA4 sorts a visit into Organic Search by its referrer and tags. Redirects, missing referrers and tagged links push real search visits into Direct or another channel.",
    pull: "Organic lower",
    icon: (
      <>
        <path d="M4 7h10M4 12h16M4 17h10" />
        <circle cx="18" cy="7" r="2" />
      </>
    ),
  },
  {
    title: "Search engines beyond Google",
    detail: "Search Console only reports Google. GA4's Organic Search channel also includes Bing, DuckDuckGo and the rest, so it can come out higher.",
    pull: "GA4 higher",
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15l5 5" />
      </>
    ),
  },
] as const;

export function SearchConsoleVsAnalyticsMismatchGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {REASONS.map((r) => (
        <div key={r.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-violet-400" aria-hidden="true">
              {r.icon}
            </svg>
            <span className="text-xs uppercase tracking-wide text-neutral-500">{r.pull}</span>
          </div>
          <h3 className="mt-3 text-[15px] font-semibold text-neutral-100">{r.title}</h3>
          <p className="mt-1 text-sm text-neutral-400">{r.detail}</p>
        </div>
      ))}
    </div>
  );
}
