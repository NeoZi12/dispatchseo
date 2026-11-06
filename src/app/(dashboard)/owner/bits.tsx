import { cx } from "@/components/ui/styles";
import { monotonePath, niceMax, TONE_VAR, type Tone } from "./curve";
import { fmt, fullDate, pct } from "./format";

// Static building blocks for /owner (no client JS): the panel frame, the
// small stat row, bar lists, the funnel, sparklines and the publish strip.

export function Panel({ children, className = "", id, label }: { children: React.ReactNode; className?: string; id?: string; label?: string }) {
  return (
    <section id={id} aria-label={label} className={cx("min-w-0 overflow-hidden rounded-2xl border border-line-soft bg-surface", className)}>
      {children}
    </section>
  );
}

export function PanelHead({ title, meta, sub }: { title: string; meta?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {sub ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">{sub}</p> : null}
      </div>
      {meta ? <div className="shrink-0 pt-0.5 font-mono text-[12px] tabular-nums text-ink-faint">{meta}</div> : null}
    </div>
  );
}

export function DeltaPill({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value > 0.5;
  const down = value < -0.5;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
        up ? "bg-ok/12 text-ok" : down ? "bg-danger/12 text-danger" : "bg-surface-3 text-ink-faint",
      )}
    >
      {up ? "+" : ""}
      {Math.round(value)}%
    </span>
  );
}

/** A row of small figures split by hairlines (the friend's dashboard's
 *  "Became paying / Made a key / Called the API" row). */
export function StatCells({ items, className = "" }: { items: Array<{ label: string; value: React.ReactNode; tone?: "ok" | "danger" }>; className?: string }) {
  return (
    <dl className={cx("grid border-y border-line-soft", items.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3", className)}>
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cx(
            "min-w-0 px-4 py-3.5 sm:px-6",
            i > 0 && "border-l border-line-soft",
            items.length === 4 && i === 2 && "border-l-0 sm:border-l",
            items.length === 4 && i >= 2 && "border-t border-line-soft sm:border-t-0",
          )}
        >
          <dt className="text-[12px] leading-snug text-ink-faint sm:text-[12.5px]">{it.label}</dt>
          <dd className={cx("mt-1 truncate font-mono text-[16px] font-medium tabular-nums", it.tone === "ok" ? "text-ok" : it.tone === "danger" ? "text-danger" : "text-ink")}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type BarRow = { key: string; label: React.ReactNode; value: number; sub?: string };

/** Label, a bar against the top row, the share of the whole on the right. */
export function BarList({
  rows,
  total,
  tone = "blue",
  empty,
  showValue = true,
}: {
  rows: BarRow[];
  /** What the percentages are of; defaults to the rows' sum. */
  total?: number;
  tone?: Tone;
  empty: string;
  showValue?: boolean;
}) {
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">{empty}</p>;
  }
  const top = Math.max(1, ...rows.map((r) => r.value));
  const whole = total ?? rows.reduce((a, r) => a + r.value, 0);
  return (
    <ol className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,11rem)_1fr_auto]">
          <span className="min-w-0 truncate text-[13.5px] text-ink" title={typeof r.label === "string" ? r.label : r.key}>
            {r.label}
          </span>
          <span className="order-3 col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2 sm:order-none sm:col-span-1 sm:h-2">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: TONE_VAR[tone] }} />
          </span>
          <span className="flex items-baseline justify-end gap-2.5 font-mono text-[12.5px] tabular-nums">
            {showValue ? <span className="text-ink-faint">{fmt(r.value)}</span> : null}
            <span className="w-11 text-right text-ink">{pct(r.value, whole)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Small area line for a stat cell. */
export function Sparkline({ values, tone = "blue", className = "", bars = false }: { values: number[]; tone?: Tone; className?: string; bars?: boolean }) {
  const n = values.length;
  if (n < 2) return <div className={className} />;
  const W = 300;
  const H = 60;
  const max = niceMax(Math.max(0, ...values));
  if (bars) {
    const slot = W / n;
    const gap = Math.min(slot * 0.3, 4);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cx("block w-full", className)} aria-hidden="true">
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
        {values.map((v, i) =>
          v > 0 ? <rect key={i} x={i * slot + gap / 2} y={H - Math.max(3, (v / max) * (H - 4))} width={slot - gap} height={Math.max(3, (v / max) * (H - 4))} style={{ fill: TONE_VAR[tone] }} opacity={0.85} /> : null,
        )}
      </svg>
    );
  }
  const xs = values.map((_, i) => (i / (n - 1)) * W);
  const ys = values.map((v) => H - 3 - (v / max) * (H - 6));
  const line = monotonePath(xs, ys);
  const id = `s${tone}${n}${values.reduce((a, v) => a + v, 0)}`.replace(/[^a-z0-9]/gi, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cx("block w-full overflow-visible", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: TONE_VAR[tone], stopOpacity: 0.25 }} />
          <stop offset="100%" style={{ stopColor: TONE_VAR[tone], stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={TONE_VAR[tone]} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Each step's bar against the first; the conversion from the step above. */
export function FunnelBars({ steps }: { steps: Array<{ label: string; count: number; note?: string }> }) {
  const first = steps[0]?.count ?? 0;
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const w = first ? Math.max(s.count > 0 ? 1.5 : 0, (s.count / first) * 100) : 0;
        return (
          <li key={s.label} className="rounded-xl px-2 py-2 transition-colors hover:bg-surface-2/50">
            <div className="flex items-baseline justify-between gap-4">
              <p className="min-w-0 truncate text-[13.5px] text-ink">
                {s.label}
                {s.note ? <span className="ml-2 hidden text-[12px] text-ink-faint sm:inline">{s.note}</span> : null}
              </p>
              <p className="flex shrink-0 items-baseline gap-3 font-mono tabular-nums">
                {prev != null ? <span className="text-[12px] text-ink-faint">{prev ? pct(s.count, prev) : "–"}</span> : null}
                <span className="w-12 text-right text-[15px] font-medium text-ink">{fmt(s.count)}</span>
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${w}%`, background: "var(--color-info)", opacity: 1 - i * 0.11 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** People, unconfirmed browsers and crawlers as one stacked bar. */
export function RealShare({ people, unconfirmed, bots }: { people: number; unconfirmed: number; bots: number }) {
  const total = people + unconfirmed + bots;
  const segs = [
    { label: "People", n: people, color: "var(--color-ok)" },
    { label: "Unconfirmed", n: unconfirmed, color: "var(--color-warn)" },
    { label: "Crawlers", n: bots, color: "var(--color-surface-3)" },
  ];
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={segs.map((s) => `${s.label} ${pct(s.n, total)}`).join(", ")}>
        {total
          ? segs.map((s) => (s.n > 0 ? <div key={s.label} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} title={`${s.label}: ${fmt(s.n)}`} /> : null))
          : null}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {segs.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12px] text-ink-faint">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              <span className="truncate">{s.label}</span>
            </dt>
            <dd className="mt-1.5 font-mono text-[18px] font-medium tabular-nums text-ink">{pct(s.n, total)}</dd>
            <dd className="font-mono text-[11.5px] tabular-nums text-ink-faint">{fmt(s.n)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** One cell per day, violet by how many articles went live. Up to five
 *  weeks it is one row; longer ranges become a weeks-by-weekdays grid. */
export function PublishStrip({ days }: { days: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const n = days.length;
  const grid = n > 35;
  const lead = grid && n ? new Date(days[0].day).getUTCDay() : 0;
  const cols = grid ? Math.ceil((n + lead) / 7) : n;
  return (
    <div
      className="grid gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, ${grid ? "1fr" : "28px"}))`,
        gridAutoFlow: grid ? "column" : "row",
        gridTemplateRows: grid ? "repeat(7, minmax(0, 1fr))" : undefined,
        justifyContent: grid ? undefined : "space-between",
      }}
      role="img"
      aria-label="Articles published per day"
    >
      {Array.from({ length: lead }, (_, i) => (
        <div key={`lead-${i}`} aria-hidden="true" />
      ))}
      {days.map((d) => (
        <div
          key={d.day}
          title={`${fullDate(d.day)}: ${d.count} ${d.count === 1 ? "article" : "articles"}`}
          className={cx("aspect-square rounded-[3px]", d.count ? "bg-accent" : "bg-surface-2")}
          style={d.count ? { opacity: 0.3 + (d.count / max) * 0.7 } : undefined}
        />
      ))}
    </div>
  );
}
