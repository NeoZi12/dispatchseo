import Link from "next/link";
import { TIER_LIMITS, TIER_NAMES, articlesPerMonthFor, priceLabel } from "@/lib/billing";

// The free tier's one upgrade surface (billing.ts isFreePlan decides who
// sees it). Every lock in the hosted dashboard is this panel: the site's own
// number as the hero, everything a plan adds as a green-ticked list (pricing-card
// style), a frosted preview of
// what is behind the lock, one bright button. Short on words on purpose
// (owner, 2026-11-08: "less text, more visual, clear advantages"). This is
// the one place the dashboard's "colour only on the headline metric" rule
// is lifted - it is a sales surface, not a report.
//
// "page" fills a locked screen (Queue, Analytics) and carries the preview;
// "section" stands in for one part of an open screen (an article's Google
// numbers).

const at = (ms: number) => ({ "--at": `${ms}ms` }) as React.CSSProperties;

// Everything Starter adds over the free tier - the same list on every lock,
// and each line true of the engine: the monthly count is the Starter pool
// (articlesPerMonthFor, enforced by the month gate), rank tracking
// (daily-ranks) only runs for paid sites, and the "Made with DispatchSEO"
// credit (hosted-blog.ts) only shows on free ones. Change a line here only
// when the engine changes with it.
const STARTER_PER_MONTH = articlesPerMonthFor("starter");
const PERKS: { label: string; icon: keyof typeof ICONS }[] = [
  { label: `${STARTER_PER_MONTH} articles a month`, icon: "pen" },
  // Research (research.ts) and rank tracking (daily-ranks) both sit behind
  // planGate, so neither runs for a free site.
  { label: "Fresh keyword research every week", icon: "search" },
  { label: "Keyword rankings", icon: "trophy" },
  // Covers the full queue with its dates and every article's own numbers.
  { label: "Advanced analytics", icon: "chart" },
  { label: "No DispatchSEO badge", icon: "badgeOff" },
];

export function UpgradePanel({
  stat,
  title,
  note,
  art,
  variant = "page",
  delay = 60,
}: {
  /** The site's own number, shown big ("54,948"). Omit when there is none. */
  stat?: string;
  /** What the number is, or the whole headline when there is no number. */
  title: string;
  /** One short extra line, at most. */
  note?: string;
  art?: "chart" | "queue";
  variant?: "page" | "section";
  delay?: number;
}) {
  const page = variant === "page";
  return (
    <section
      className={`arrive-up relative isolate overflow-hidden rounded-3xl border border-accent/20 bg-surface ${page ? "p-7 sm:p-10" : "p-6 sm:p-8"}`}
      style={at(delay)}
    >
      {/* Two soft glows behind everything. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-28 -z-10 h-72 w-72 rounded-full bg-accent-strong/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-0 -z-10 h-80 w-80 rounded-full bg-info/15 blur-3xl" />

      <div className={`grid items-center gap-10 ${page && art ? "lg:grid-cols-[minmax(0,1fr)_auto]" : ""}`}>
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent ring-1 ring-inset ring-accent/30">
            <LockIcon className="h-3.5 w-3.5" />
            {TIER_NAMES.starter} feature
          </p>

          {stat ? (
            <p
              className={`mt-5 bg-gradient-to-r from-violet-300 via-fuchsia-300 to-sky-300 bg-clip-text font-bold leading-none tracking-tight text-transparent tabular-nums ${page ? "text-[3.25rem] sm:text-[4.25rem]" : "text-[2.75rem] sm:text-[3.25rem]"}`}
            >
              {stat}
            </p>
          ) : null}
          <h2
            className={`text-balance font-semibold leading-tight tracking-tight text-ink ${stat ? "mt-2" : "mt-5"} ${page ? "text-[1.4rem] sm:text-[1.65rem]" : "text-[1.25rem] sm:text-[1.4rem]"}`}
          >
            {title}
          </h2>
          {note ? <p className="mt-2 text-[15px] text-ink-muted">{note}</p> : null}

          <p className="mt-7 text-[13px] font-semibold uppercase tracking-[0.08em] text-ok">Grow faster with {TIER_NAMES.starter}</p>
          <ul className="mt-3 space-y-3">
            {PERKS.map((p) => {
              const Icon = ICONS[p.icon];
              return (
                <li key={p.label} className="flex items-center gap-3 text-[15.5px] font-medium text-ink">
                  <TickIcon className="h-5 w-5 shrink-0 text-ok" />
                  {p.label}
                  <Icon className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
                </li>
              );
            })}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/billing#plans"
              className="group inline-flex h-12 items-center gap-3 rounded-2xl bg-gradient-to-br from-accent-strong via-violet-600 to-indigo-600 pl-6 pr-2.5 text-[16px] font-semibold text-white shadow-lg shadow-accent-strong/30 ring-1 ring-inset ring-white/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent-strong/40 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Unlock with {TIER_NAMES.starter}
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
                <ArrowIcon className="h-4 w-4" />
              </span>
            </Link>
            <span className="text-[14px] text-ink-muted">
              <span className="font-semibold text-ink tabular-nums">{priceLabel(TIER_LIMITS.starter.price)}</span> a month
            </span>
          </div>
        </div>

        {page && art ? (
          <div className="hidden justify-center lg:flex">
            <LockedPreview art={art} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** A tilted little card of what sits behind the lock - shapes only, never the
 *  owner's data - frosted over, with a glowing lock on top. */
function LockedPreview({ art }: { art: "chart" | "queue" }) {
  return (
    <div className="relative h-[250px] w-[280px]" aria-hidden="true">
      <div className="absolute inset-x-6 top-6 h-[210px] rotate-[6deg] rounded-2xl border border-line bg-surface-2/60" />
      <div className="absolute inset-x-0 top-2 h-[220px] -rotate-[3deg] overflow-hidden rounded-2xl border border-white/10 bg-surface-2 p-5 shadow-2xl shadow-black/50">
        <div className="h-2.5 w-24 rounded-full bg-surface-3" />
        <div className="mt-2 h-2 w-36 rounded-full bg-surface-3/70" />
        {art === "chart" ? <MiniChart /> : <MiniQueue />}
        <div className="absolute inset-0 bg-canvas/25 backdrop-blur-[2.5px]" />
      </div>
      <div className="absolute left-1/2 top-[46%] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-accent-strong via-violet-600 to-indigo-600 text-white shadow-[0_0_40px_rgb(139_92_246/0.55)] ring-4 ring-surface">
        <LockIcon className="h-7 w-7" />
      </div>
    </div>
  );
}

function MiniChart() {
  const bars = [34, 52, 41, 68, 57, 83, 74, 96];
  return (
    <>
      <div className="mt-6 flex h-[96px] items-end gap-2">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-accent-strong to-sky-400" style={{ height: `${h}%`, opacity: 0.55 + i * 0.05 }} />
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <span className="h-5 w-16 rounded-full bg-ok-soft" />
        <span className="h-5 w-12 rounded-full bg-info-soft" />
        <span className="h-5 w-14 rounded-full bg-warn-soft" />
      </div>
    </>
  );
}

function MiniQueue() {
  const rows: { w: string; chip: string }[] = [
    { w: "w-28", chip: "bg-ok/60" },
    { w: "w-32", chip: "bg-info/60" },
    { w: "w-24", chip: "bg-accent/60" },
    { w: "w-28", chip: "bg-warn/60" },
  ];
  return (
    <ol className="mt-5 space-y-3">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-muted">{i + 1}</span>
          <span className={`h-2.5 rounded-full bg-ink/25 ${r.w}`} />
          <span className={`ml-auto h-4 w-10 rounded-md ${r.chip}`} />
        </li>
      ))}
    </ol>
  );
}

/** "1,240" - the site's own numbers in upgrade lines. */
export function fmtCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

type IconProps = { className?: string };
const svg = (path: React.ReactNode) =>
  function Icon({ className }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        {path}
      </svg>
    );
  };

const LockIcon = svg(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
const ArrowIcon = svg(<path d="M5 12h14M13 6l6 6-6 6" />);

const TickIcon = svg(<path d="m4.5 12.5 5 5L19.5 7" strokeWidth="2.6" />);

// The small mark after each perk's words.
const ICONS = {
  pen: svg(
    <>
      <path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
      <path d="M13.5 7.5l3 3" />
    </>,
  ),
  chart: svg(<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />),
  search: svg(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>,
  ),
  trophy: svg(
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" />
    </>,
  ),
  badgeOff: svg(
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M4 4l16 16" />
    </>,
  ),
};
