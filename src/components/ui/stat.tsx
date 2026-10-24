import { cx } from "./styles";

/** One figure: a quiet label, a tabular number, an optional change and a
 *  context line. No box of its own - StatGrid draws the hairlines. */
export function Stat({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  className = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Percent change; positive is good. null hides it. */
  delta?: number | null;
  /** What the change compares against, read by screen readers and on hover. */
  deltaLabel?: string;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[1.75rem] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</span>
        {delta != null ? <Delta value={delta} label={deltaLabel} /> : null}
      </dd>
      {hint ? <dd className="mt-2 text-[12.5px] text-ink-faint">{hint}</dd> : null}
    </div>
  );
}

function Delta({ value, label }: { value: number; label?: string }) {
  const up = value > 0;
  const down = value < 0;
  const tone = up ? "text-ok" : down ? "text-danger" : "text-ink-faint";
  const text = `${up ? "+" : ""}${Math.round(value)}%`;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-[13px] font-medium tabular-nums", tone)} title={label}>
      {up || down ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={up ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} />
        </svg>
      ) : null}
      {text}
      {label ? <span className="sr-only"> {label}</span> : null}
    </span>
  );
}
