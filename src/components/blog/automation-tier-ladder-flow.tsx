// The three-rung ladder this guide organizes around, sourced from each
// vendor's own current homepage (Surfer, SEO.AI, Outrank - fetched live while
// writing this) plus this repo's own pipeline. The rung a tool sits on has
// nothing to do with whether it "uses AI" - every result on page 1 for "ai
// powered seo tool" claims that - it's about what happens the instant a
// draft is finished.

function TierIcon({ kind }: { kind: "editor" | "publish" | "review" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
  switch (kind) {
    case "editor":
      return (
        <svg {...common}>
          <path d="M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16v4z" />
          <path d="m13 6 4 4" />
        </svg>
      );
    case "publish":
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 8 5-5 5 5" />
          <rect x="4" y="15" width="16" height="6" rx="1.5" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M6 8v8M8 6h4a4 4 0 0 1 4 4v4" />
        </svg>
      );
  }
}

const RUNGS = [
  {
    kind: "editor" as const,
    tier: "Tier 1 - assist",
    title: "Stays in the vendor's own editor",
    detail: "Surfer, Clearscope, MarketMuse: a score, a brief, or a draft you paste out yourself.",
  },
  {
    kind: "publish" as const,
    tier: "Tier 2 - autonomous, review optional",
    title: "Goes live on your site by default",
    detail: "SEO.AI, Outrank: articles publish automatically unless you turn review on yourself.",
  },
  {
    kind: "review" as const,
    tier: "Tier 3 - reviewed pipeline",
    title: "Stops at a pull request",
    detail: "DispatchSEO's own shape: nothing merges until a person looks at the diff.",
  },
];

export function AutomationTierLadderFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {RUNGS.map((r, i) => (
        <div key={r.tier} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
              <TierIcon kind={r.kind} />
            </span>
            {i < RUNGS.length - 1 ? (
              <span className="my-1 h-full min-h-6 w-px flex-1 bg-neutral-800" />
            ) : null}
          </div>
          <div className={i < RUNGS.length - 1 ? "pb-5" : ""}>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{r.tier}</p>
            <p className="mt-0.5 text-sm font-medium text-neutral-100">{r.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">{r.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
