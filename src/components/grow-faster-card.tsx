import Link from "next/link";

import { PixelReporter } from "@/components/pixel-dispatcher";
import { articlesPerMonthFor, priceLabel, TIER_LIMITS } from "@/lib/billing";

const STARTER_PER_MONTH = articlesPerMonthFor("starter");

const monthNameOf = (now: number) => new Date(now).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

/** The free plan's "Grow faster" card: the dispatcher at its desk, a row of
 *  Starter's month as article slots (the free ones written ticked, the rest
 *  locked), and one bright button. Same family as NextArticleLine and
 *  UpgradePanel: colour in the glow, the ticks and the button, never a
 *  tinted tile. The copy promises only the plan's monthly number, never a
 *  count for the rest of this month - how many more fit depends on the day
 *  they upgrade.
 *
 *  Two places (owner, 2026-11-11): Home, only once the free month is used up
 *  (the dispatcher on its coffee break), and Settings > Websites, for every
 *  free-plan owner - there, before the month is used up, it says how many
 *  free articles are left instead. `next` is the day the next free article
 *  can start (Home's nextFreeLabel: the 1st, or later when the spacing since
 *  the last start runs past it); without it the card says "next month"
 *  rather than promise a day it cannot work out. `arriveAt` staggers it into
 *  Home's arrival animation; leave it out elsewhere. */
export function GrowFasterCard({ share, used, next, now, arriveAt }: { share: number; used: number; next?: string; now: number; arriveAt?: number }) {
  const slots = Math.max(STARTER_PER_MONTH, share);
  const filled = Math.min(used, share);
  const spent = used >= share;
  const left = Math.max(0, share - used);
  return (
    <div
      className={`${arriveAt != null ? "arrive-up " : ""}relative isolate overflow-hidden rounded-2xl border border-accent/25 bg-surface p-4 sm:p-5`}
      style={arriveAt != null ? ({ "--at": `${arriveAt}ms`, "--i": 0 } as React.CSSProperties) : undefined}
      role="region"
      aria-label={spent ? "Free plan used up this month" : "Upgrade from the free plan"}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-1/2 -z-10 h-64 w-80 -translate-y-1/2 rounded-full bg-accent-strong/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-0 -z-10 h-56 w-72 rounded-full bg-info/10 blur-3xl" />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
          <div className="relative shrink-0">
            <PixelReporter mood="idle" steam={spent} decorative className="w-[96px] sm:w-[132px]" />
            <span aria-hidden="true" className="absolute inset-x-2 -bottom-1 h-1.5 rounded-[50%] bg-black/40 blur-[3px]" />
          </div>
          <div className="min-w-0">
            <p className="text-balance text-[16px] font-semibold leading-snug tracking-tight text-ink sm:text-[17px]">
              {spent
                ? `That's your ${share} free articles for ${monthNameOf(now)}.`
                : `You're on the free plan: ${share} articles a month.`}
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
              {spent
                ? `I'm on a coffee break until ${next ?? "next month"}. Starter writes ${STARTER_PER_MONTH} a month, so I'd keep going.`
                : `${left === 1 ? "1 free article is" : `${left} free articles are`} left for ${monthNameOf(now)}. Starter writes ${STARTER_PER_MONTH} a month, so your site grows faster.`}
            </p>

            {/* Starter's month as slots: the free ones done, the rest locked. */}
            <ol className="mt-3.5 flex flex-wrap items-center gap-1.5" aria-label={`${filled} of ${slots} articles a month on Starter`}>
              {Array.from({ length: slots }, (_, i) => {
                const done = i < filled;
                return (
                  <li
                    key={i}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      done ? "bg-ok-soft text-ok ring-1 ring-inset ring-ok/30" : "border border-dashed border-accent/45 text-accent"
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    )}
                    <span className="sr-only">{done ? "written" : "locked"}</span>
                  </li>
                );
              })}
              <li className="ml-1.5 text-[12.5px] font-medium text-ink-faint">
                {filled} of {slots} on Starter
              </li>
            </ol>
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
          <Link
            href="/billing#plans"
            className="group inline-flex h-11 items-center gap-2.5 rounded-2xl bg-gradient-to-br from-accent-strong via-violet-600 to-indigo-600 pl-5 pr-2 text-[15px] font-semibold text-white shadow-lg shadow-accent-strong/30 ring-1 ring-inset ring-white/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent-strong/40 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            Grow faster
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/20 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </Link>
          <span className="text-[13px] text-ink-muted">
            <span className="font-semibold text-ink tabular-nums">{priceLabel(TIER_LIMITS.starter.price)}</span> a month
          </span>
        </div>
      </div>
    </div>
  );
}
