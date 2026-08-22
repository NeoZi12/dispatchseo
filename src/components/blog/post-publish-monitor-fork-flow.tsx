// Both systems start the same way - a page goes live. The branch is what
// watches it afterward: Content Guard is capped by the tier you pay for
// (frase.io/pricing, checked live), the nightly rank + GSC cron this project
// runs has no page limit tied to a price - it just runs against whatever
// get_pages already knows about.

const SHARED = { label: "Page goes live", detail: "Frase's auto-publish or a merged DispatchSEO PR - either way, a URL now exists" };

const FRASE_BRANCH = [
  { label: "Content Guard checks its capped list", detail: "10, 75, or 300 pages, whichever the tier bought" },
  { label: "Alert if a watched page decays", detail: "Ranking or traffic drop surfaces in the Frase dashboard" },
];

const DISPATCH_BRANCH = [
  { label: "Nightly rank cron runs", detail: "Every logged page, no per-page or per-tier limit" },
  { label: "Hourly GSC snapshot joins it", detail: "Clicks and impressions attached to the same keyword" },
  { label: "AI-citation check rides the same loop", detail: "get_ai_visibility reads it back as MCP state, not a dashboard tab" },
];

function NodeIcon({ kind }: { kind: "publish" | "shield" | "bell" | "clock" | "chart" | "signal" }) {
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
    case "publish":
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19V11M10 19V6M16 19v-8M21 3l-5.5 5.5L12 5 5 12" />
        </svg>
      );
    case "signal":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M8 20v-4M12 20v-8M16 20v-12" />
        </svg>
      );
  }
}

function Node({ label, detail, icon }: { label: string; detail: string; icon: Parameters<typeof NodeIcon>[0]["kind"] }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
        <NodeIcon kind={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-100">{label}</p>
        <p className="text-xs leading-snug text-neutral-500">{detail}</p>
      </div>
    </div>
  );
}

export function PostPublishMonitorForkFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <Node label={SHARED.label} detail={SHARED.detail} icon="publish" />
      <div className="ml-3.5 mt-2 flex gap-3 border-l-2 border-dashed border-neutral-800 pl-4 sm:gap-8">
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Frase Content Guard</h3>
          <Node label={FRASE_BRANCH[0].label} detail={FRASE_BRANCH[0].detail} icon="shield" />
          <Node label={FRASE_BRANCH[1].label} detail={FRASE_BRANCH[1].detail} icon="bell" />
        </div>
        <div className="flex-1 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">DispatchSEO</h3>
          <Node label={DISPATCH_BRANCH[0].label} detail={DISPATCH_BRANCH[0].detail} icon="clock" />
          <Node label={DISPATCH_BRANCH[1].label} detail={DISPATCH_BRANCH[1].detail} icon="chart" />
          <Node label={DISPATCH_BRANCH[2].label} detail={DISPATCH_BRANCH[2].detail} icon="signal" />
        </div>
      </div>
    </div>
  );
}
