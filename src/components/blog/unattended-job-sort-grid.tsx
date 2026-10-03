// Sorts the jobs people hand to a scheduled Claude Code run into three bins by
// what a mistake costs: reversible and reviewable (hand off), reversible only
// behind a gate (hand off with a rule), and not reversible (keep). The bins
// mirror what DispatchSEO's own pipeline lets the agent do unattended.

function Bin({ title, tone, items }: { title: string; tone: string; items: { icon: React.ReactNode; label: string; why: string }[] }) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className={`text-xs font-medium uppercase tracking-wide ${tone}`}>{title}</h3>
      <ul className="mt-3 grid gap-2">
        {items.map((it) => (
          <li key={it.label} className="flex gap-3 rounded-lg bg-neutral-950/60 p-3">
            <span className="mt-0.5 shrink-0 text-neutral-300">{it.icon}</span>
            <div>
              <p className="text-sm font-medium text-neutral-200">{it.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{it.why}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const svg = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const search = (
  <svg {...svg}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>
);
const branch = (
  <svg {...svg}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 7v10M18 11c0 4-6 3-12 6" /></svg>
);
const chart = (
  <svg {...svg}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>
);
const merge = (
  <svg {...svg}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 7v10M6 9c0 3 4 3 10 3" /></svg>
);
const wallet = (
  <svg {...svg}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14.5h2" /></svg>
);
const key = (
  <svg {...svg}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></svg>
);

export function UnattendedJobSortGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 md:grid-cols-3">
      <Bin
        title="Hand off"
        tone="text-emerald-400"
        items={[
          { icon: search, label: "Research and queueing ideas", why: "Output is a row in a queue. Nothing ships until someone approves it." },
          { icon: chart, label: "Reports and rank checks", why: "Read-only. A wrong summary costs a re-read." },
        ]}
      />
      <Bin
        title="Hand off behind a gate"
        tone="text-amber-300"
        items={[
          { icon: branch, label: "Builds that open a PR", why: "The diff is reviewable and revertable, if a check or a person can refuse it." },
          { icon: merge, label: "Merging, on a narrow rule", why: "Only where a bad change is cheap: a path allowlist plus green checks." },
        ]}
      />
      <Bin
        title="Keep for yourself"
        tone="text-neutral-400"
        items={[
          { icon: wallet, label: "Spend decisions", why: "Plan changes, paid API budgets, anything that bills on a loop." },
          { icon: key, label: "Credentials and access", why: "Rotating a token or widening a scope is not a diff you can revert." },
        ]}
      />
    </div>
  );
}
