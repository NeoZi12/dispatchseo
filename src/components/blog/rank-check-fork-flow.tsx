// Both tools start the same way - a position check. The branch is what
// happens after: AccuRanker's chain ends at a dashboard a person has to open;
// DispatchSEO's continues through the same suggestions queue and SERP gate
// every guide on this site is built by, ending at a merge-ready PR.

const SHARED = { label: "Position checked", detail: "Daily for AccuRanker, nightly here - both real checks" };

const ACCURANKER_BRANCH = [
  { label: "Dashboard updated", detail: "Position, history, and alerts render in the UI" },
];

const DISPATCH_BRANCH = [
  { label: "GSC joined", detail: "Same keyword's clicks and impressions attached" },
  { label: "Suggestion queued, SERP-gated", detail: "Only builds if the draft can beat page 1" },
  { label: "PR opened", detail: "Merge-ready, no dashboard opened in between" },
];

function NodeIcon({ kind }: { kind: "check" | "dashboard" | "chart" | "queue" | "pr" | "person" }) {
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
    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 5-5" />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "person":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c1-3.5 4-5.5 6.5-5.5s5.5 2 6.5 5.5" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19V11M10 19V6M16 19v-8M21 3l-5.5 5.5L12 5 5 12" />
        </svg>
      );
    case "queue":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h10" />
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
  }
}

function Node({ label, detail, icon }: { label: string; detail: string; icon: Parameters<typeof NodeIcon>[0]["kind"] }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
        <NodeIcon kind={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{label}</p>
        <p className="text-xs leading-snug text-neutral-500">{detail}</p>
      </div>
    </div>
  );
}

export function RankCheckForkFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <Node label={SHARED.label} detail={SHARED.detail} icon="check" />
      <div className="ml-3.5 mt-2 flex gap-3 border-l-2 border-dashed border-neutral-800 pl-4 sm:gap-8">
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">AccuRanker</h3>
          {ACCURANKER_BRANCH.map((n) => (
            <Node key={n.label} label={n.label} detail={n.detail} icon="dashboard" />
          ))}
          <Node label="Waits for a person" detail="Nothing acts on the number until someone opens the tab" icon="person" />
        </div>
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">DispatchSEO</h3>
          <Node label={DISPATCH_BRANCH[0].label} detail={DISPATCH_BRANCH[0].detail} icon="chart" />
          <Node label={DISPATCH_BRANCH[1].label} detail={DISPATCH_BRANCH[1].detail} icon="queue" />
          <Node label={DISPATCH_BRANCH[2].label} detail={DISPATCH_BRANCH[2].detail} icon="pr" />
        </div>
      </div>
    </div>
  );
}
