// Both tools start from the same competitive-gap research. The fork is what
// happens once that research is done: MarketMuse's chain hands back a
// document and stops; this project's chain keeps going through a draft, a
// PR, and a merge. Sourced from marketmuse.com's own product pages (topic
// modeling, content briefs - it states directly it does not write content)
// and this repo's actual pipeline.

const MARKETMUSE_BRANCH = [
  { label: "Topic model built", detail: "Personalized Difficulty, Topic Authority, Content Score against ranking pages" },
  { label: "Content brief generated", detail: "One of up to 20 a month, depending on tier" },
];

const DISPATCH_BRANCH = [
  { label: "Draft written", detail: "Full prose, bespoke visuals, and a cover - not a brief" },
  { label: "PR opened", detail: "A deploy preview, reviewed like any other change to the repo" },
  { label: "Merged and tracked", detail: "Rank, Search Console, and AI-citation checks start on their own schedule" },
];

function NodeIcon({ kind }: { kind: "search" | "doc" | "pencil" | "pr" | "check" | "person" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4",
    "aria-hidden": true,
  };
  switch (kind) {
    case "search":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6" />
          <path d="m20 20-5.5-5.5" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M6 3h9l3 3v15H6z" />
          <path d="M15 3v3h3M9 12h6M9 16h6" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16v4z" />
          <path d="m13 6 4 4" />
        </svg>
      );
    case "pr":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <path d="M6 8.2V15.8M8.2 6H14a3.5 3.5 0 0 1 3.5 3.5V15.8" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 5-5" />
        </svg>
      );
    case "person":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c1-3.5 4-5.5 6.5-5.5s5.5 2 6.5 5.5" />
        </svg>
      );
  }
}

function Node({
  label,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  detail: string;
  icon: Parameters<typeof NodeIcon>[0]["kind"];
  accent?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          accent ? "bg-violet-500/15 text-violet-300" : "bg-neutral-800 text-neutral-400"
        }`}
      >
        <NodeIcon kind={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{label}</p>
        <p className="text-xs leading-snug text-neutral-500">{detail}</p>
      </div>
    </div>
  );
}

export function BriefToBlankPageForkFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <Node label="Keyword researched, competitors read" detail="Both tools start here - a real gap, not a guess" icon="search" />
      <div className="ml-3.5 mt-2 flex gap-3 border-l-2 border-dashed border-neutral-800 pl-4 sm:gap-8">
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">MarketMuse</h3>
          {MARKETMUSE_BRANCH.map((n) => (
            <Node key={n.label} label={n.label} detail={n.detail} icon="doc" />
          ))}
          <Node label="Waits for a person" detail="Someone still writes the draft, publishes it, and watches what happens" icon="person" />
        </div>
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">DispatchSEO</h3>
          <Node label={DISPATCH_BRANCH[0].label} detail={DISPATCH_BRANCH[0].detail} icon="pencil" accent />
          <Node label={DISPATCH_BRANCH[1].label} detail={DISPATCH_BRANCH[1].detail} icon="pr" accent />
          <Node label={DISPATCH_BRANCH[2].label} detail={DISPATCH_BRANCH[2].detail} icon="check" accent />
        </div>
      </div>
    </div>
  );
}
