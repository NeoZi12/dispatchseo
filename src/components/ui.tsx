// Server-rendered presentational primitives shared by every dashboard screen.
// One grammar everywhere: quiet neutral-900 rectangles on the neutral-950
// canvas, sentence-case labels, color only as meaning. Keep new screens on
// these so the dashboard stays consistent.


export function PageHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {hint ? <p className="text-sm text-neutral-400">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-neutral-100">{children}</h2>
      {sub ? <p className="mt-0.5 text-sm text-neutral-400">{sub}</p> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-neutral-900/60 px-4 py-10 text-center text-sm text-neutral-400">
      {children}
    </div>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200">
      {children}
    </code>
  );
}

// The shared grid every row of stat tiles sits in - same gaps and breakpoints
// on every screen so stat rows never drift apart. Literal class strings per
// column count because Tailwind can't see dynamic names.
const STAT_COLS = {
  2: "grid grid-cols-2 gap-4",
  3: "grid grid-cols-2 gap-4 sm:grid-cols-3",
  4: "grid grid-cols-2 gap-4 xl:grid-cols-4",
} as const;

export function StatRow({
  children,
  cols = 4,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  return <div className={STAT_COLS[cols]}>{children}</div>;
}

// PostHog-style stat tile: bold title, colored delta pill top-right, big
// number, quiet context line underneath.
export function BigStatTile({
  title,
  value,
  pill,
  sub,
}: {
  title: React.ReactNode;
  value: React.ReactNode;
  pill?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-neutral-100">{title}</h3>
        {pill}
      </div>
      <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub ? <p className="mt-2 text-sm text-neutral-400">{sub}</p> : null}
    </div>
  );
}

// The colored change badge for BigStatTile. Positive = emerald, negative =
// red, zero = quiet neutral; hidden entirely when there is no comparison.
export function DeltaPill({ delta, title }: { delta: number | null; title?: string }) {
  if (delta == null) return null;
  const up = delta > 0;
  const down = delta < 0;
  const cls = up
    ? "bg-emerald-500/10 text-emerald-400"
    : down
      ? "bg-red-500/10 text-red-400"
      : "bg-neutral-800 text-neutral-500";
  return (
    <span
      title={title}
      className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      {up || down ? (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path d={up ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} />
        </svg>
      ) : null}
      {up ? `+${delta}` : down ? `${delta}` : "±0"}
    </span>
  );
}

export function Arrow({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-neutral-600">-</span>;
  if (delta > 0) return <span className="text-emerald-400">▲ {delta}</span>;
  if (delta < 0) return <span className="text-red-400">▼ {Math.abs(delta)}</span>;
  return <span className="text-neutral-500">= 0</span>;
}

// Thin progress meter - emerald fill on the neutral track. Carries no text of
// its own; pair it with a "X of Y done" line.
export function ProgressMeter({
  done,
  total,
  className = "",
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} of ${total} done`}
      className={`h-1.5 overflow-hidden rounded-full bg-neutral-800 ${className}`}
    >
      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Tiny server-rendered sparkline. Lower position = better = drawn higher.
export function Sparkline({
  positions,
  width = 112,
}: {
  positions: Array<number | null>;
  width?: number;
}) {
  const pts = positions.filter((p): p is number => p != null);
  if (pts.length < 2) return <span className="text-xs text-neutral-600">-</span>;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const w = width;
  const h = 24;
  const step = w / (positions.length - 1);
  const points = positions
    .map((p, i) =>
      p == null ? null : `${(i * step).toFixed(1)},${(((p - min) / range) * (h - 4) + 2).toFixed(1)}`
    )
    .filter(Boolean)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-emerald-400"
      />
    </svg>
  );
}

// ---------- table grammar ----------

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-neutral-900">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="text-xs text-neutral-500">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-t border-neutral-800/70 hover:bg-neutral-800/30">{children}</tr>;
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

// ---------- GSC chart ----------
// Reworked into an interactive client component (labeled axes, hover tooltip)
// at gsc-chart.tsx; re-exported here so existing imports keep working.

export { GscChart } from "./gsc-chart";

// ---------- range selector ----------
// Segmented date-range pills (client component for the click state) - lives in
// range-selector.tsx, re-exported here so screens import one module.

export { RangeSelector, type RangeOption } from "./range-selector";

// Status text colors used across research tables - color as meaning, kept dim.
export function StatusText({ status }: { status: string }) {
  const color =
    status === "pending"
      ? "text-amber-300"
      : status === "approved"
        ? "text-sky-300"
        : status === "in_progress"
          ? "text-neutral-300"
          : status === "done"
            ? "text-emerald-400"
            : "text-neutral-600";
  return <span className={color}>{status}</span>;
}
