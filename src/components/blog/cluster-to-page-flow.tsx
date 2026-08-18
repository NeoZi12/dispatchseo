// Every tool in the compare table above starts the same way - a pasted
// keyword list. The branch is what happens after the clusters come back:
// the tool's job ends at the list; DispatchSEO's research workflow (not the
// free web tool, which stops at the same list) keeps going through the same
// suggestions queue and SERP gate every guide on this site is built by.

const SHARED = { label: "Keyword list pasted or pulled in", detail: "Same starting point for every tool here" };

const TOOL_BRANCH = [
  { label: "Clusters returned", detail: "Grouped list, CSV, or a pillar/subtopic map" },
];

const DISPATCH_BRANCH = [
  { label: "Clustered and prioritized", detail: "Same term-overlap step, inside the research run" },
  { label: "Suggestion proposed, SERP-gated", detail: "Only queued if a draft could beat page 1" },
  { label: "PR opened, rank tracked", detail: "Merge-ready page, then a nightly position check" },
];

function NodeIcon({ kind }: { kind: "list" | "grid" | "queue" | "pr" | "person" }) {
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
    case "list":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "queue":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 5-5" />
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
    case "person":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c1-3.5 4-5.5 6.5-5.5s5.5 2 6.5 5.5" />
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

export function ClusterToPageFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <Node label={SHARED.label} detail={SHARED.detail} icon="list" />
      <div className="ml-3.5 mt-2 flex gap-3 border-l-2 border-dashed border-neutral-800 pl-4 sm:gap-8">
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Any tool above</h3>
          <Node label={TOOL_BRANCH[0].label} detail={TOOL_BRANCH[0].detail} icon="grid" />
          <Node label="Waits for a person" detail="Someone still decides which cluster is worth a page" icon="person" />
        </div>
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">DispatchSEO&apos;s workflow</h3>
          <Node label={DISPATCH_BRANCH[0].label} detail={DISPATCH_BRANCH[0].detail} icon="grid" />
          <Node label={DISPATCH_BRANCH[1].label} detail={DISPATCH_BRANCH[1].detail} icon="queue" />
          <Node label={DISPATCH_BRANCH[2].label} detail={DISPATCH_BRANCH[2].detail} icon="pr" />
        </div>
      </div>
    </div>
  );
}
