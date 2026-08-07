// Clearscope's own current product scope, fetched live from clearscope.io
// while writing this guide - five modules, not the single term-coverage
// score most "clearscope alternative" roundups still describe. Each icon is
// a real depiction of the module's job, not a brand mark or a letter chip.

const MODULES = [
  {
    name: "Discover",
    job: "Finds topic clusters and content opportunities",
    still: "You still pick which one to write",
  },
  {
    name: "Write",
    job: "AI-assisted drafting and editing inside the app",
    still: "You still review and publish it yourself",
  },
  {
    name: "Optimize",
    job: "Term recommendations, collaborative editing",
    still: "You still act on the score",
  },
  {
    name: "Expand",
    job: "Tracks brand visibility in ChatGPT and Gemini answers",
    still: "You still write whatever wins the citation",
  },
  {
    name: "Protect",
    job: "Monitors published pages for ranking and traffic drops",
    still: "You still fix what it flags",
  },
] as const;

function ModuleIcon({ name }: { name: (typeof MODULES)[number]["name"] }) {
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
  switch (name) {
    case "Discover":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6" />
          <path d="m20 20-5.5-5.5" />
        </svg>
      );
    case "Write":
      return (
        <svg {...common}>
          <path d="M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16v4z" />
          <path d="m13 6 4 4" />
        </svg>
      );
    case "Optimize":
      return (
        <svg {...common}>
          <path d="M4 6h11M4 12h7M4 18h9" />
          <circle cx="19" cy="6" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "Expand":
      return (
        <svg {...common}>
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "Protect":
      return (
        <svg {...common}>
          <path d="M12 3 4.5 6v6c0 4.2 3 7.4 7.5 9 4.5-1.6 7.5-4.8 7.5-9V6L12 3Z" />
          <path d="m9.5 12 1.8 1.8 3.2-3.6" />
        </svg>
      );
  }
}

export function ClearscopeModuleGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {MODULES.map((m) => (
        <div key={m.name} className="flex gap-3 rounded-xl bg-neutral-900 p-4 sm:p-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
            <ModuleIcon name={m.name} />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-neutral-100">{m.name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-neutral-300">{m.job}</p>
            <p className="mt-1 text-xs text-neutral-500">{m.still}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
