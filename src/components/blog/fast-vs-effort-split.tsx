// The two dials that both make Claude Code answer sooner, and what each one
// actually changes - from code.claude.com/docs/en/fast-mode ("Fast mode vs
// effort level", fetched fresh for this guide). The common mistake is
// treating fast mode as a thinking dial; it isn't one.

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 17 4-5" />
    </svg>
  );
}

const DIALS = [
  {
    icon: <BoltIcon />,
    name: "Fast mode",
    tone: "text-violet-400",
    rows: [
      ["Model quality", "Unchanged - same Opus, different API configuration"],
      ["Speed", "Up to 2.5x faster output"],
      ["Cost", "Higher per token"],
      ["Set with", "/fast or \"fastMode\": true"],
    ],
  },
  {
    icon: <GaugeIcon />,
    name: "Lower effort level",
    tone: "text-amber-300",
    rows: [
      ["Model quality", "Potentially lower on complex tasks"],
      ["Speed", "Faster - less thinking time"],
      ["Cost", "Fewer thinking tokens"],
      ["Set with", "The effort setting in model config"],
    ],
  },
] as const;

export function FastVsEffortSplit() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {DIALS.map((d) => (
        <div key={d.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className={`flex items-center gap-2 ${d.tone}`}>
            {d.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{d.name}</h3>
          </div>
          <dl className="mt-3 space-y-2">
            {d.rows.map(([k, v]) => (
              <div key={k} className="border-t border-neutral-800/70 pt-2">
                <dt className="text-xs uppercase tracking-wide text-neutral-500">{k}</dt>
                <dd className="mt-0.5 text-sm text-neutral-200">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
