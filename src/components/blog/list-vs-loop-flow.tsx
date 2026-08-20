// Both start the same way - a seed keyword going in. The branch is what
// happens to what comes out: Ubersuggest's chain ends at a list a person
// still has to act on; DispatchSEO's continues through the same SERP gate
// and build slot every guide on this site is written by, ending at a
// merge-ready PR with the rank tracked afterward.

const SHARED = { label: "Seed keyword typed in", detail: "\"ubersuggest alternative\", or whatever the site is chasing" };

function NodeIcon({ kind }: { kind: "seed" | "list" | "person" | "gate" | "pr" | "chart" }) {
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
    case "seed":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "person":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c1-3.5 4-5.5 6.5-5.5s5.5 2 6.5 5.5" />
        </svg>
      );
    case "gate":
      return (
        <svg {...common}>
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M9 20v-6h6v6" />
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
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19V11M10 19V6M16 19v-8M21 3l-5.5 5.5L12 5 5 12" />
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

export function ListVsLoopFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <Node label={SHARED.label} detail={SHARED.detail} icon="seed" />
      <div className="ml-3.5 mt-2 flex gap-3 border-l-2 border-dashed border-neutral-800 pl-4 sm:gap-8">
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Ubersuggest</h3>
          <Node label="Keyword ideas + rough SERP data returned" detail="A list, with volume and a difficulty score attached" icon="list" />
          <Node label="Waits for a person" detail="Nothing decides, writes, publishes, or tracks until someone opens the list" icon="person" />
        </div>
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">DispatchSEO</h3>
          <Node label="Ideas expanded the same way" detail="keyword_ideas / suggest_keywords, same kind of raw data" icon="list" />
          <Node label="Live SERP gate filters what's winnable" detail="Re-checked against this site's own current authority before a word is written" icon="gate" />
          <Node label="PR opened, merge-ready" detail="Drafted, visualized, humanized - the owner reviews the page, not the idea" icon="pr" />
          <Node label="Rank tracked after merge" detail="Nightly check picks up where the build left off" icon="chart" />
        </div>
      </div>
    </div>
  );
}
