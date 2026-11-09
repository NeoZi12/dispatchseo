import Link from "next/link";

import { RANGES, windows, type Range } from "@/lib/owner-analytics";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { shortDate } from "./format";

// The frame around every /owner page: the title, the range picker, and one
// row of section tabs so each subject is a page of its own instead of a
// scroll. Links carry ?range= so the window follows you between sections.

export type OwnerSection = "home" | "customers" | "plans" | "visitors" | "google" | "ai";

export const OWNER_SECTIONS: Array<{ key: OwnerSection; href: string; label: string; says: string }> = [
  { key: "home", href: "/owner", label: "Home", says: "The numbers that matter today: signups, revenue, cost, articles." },
  { key: "customers", href: "/owner/customers", label: "Customers", says: "Every account: what they pay you, what they cost, what is left." },
  { key: "plans", href: "/owner/plans", label: "Plans", says: "Who is on the free plan and on each paid plan." },
  { key: "visitors", href: "/owner/visitors", label: "Visitors", says: "Who reaches dispatchseo.com and how they found it." },
  { key: "google", href: "/owner/google", label: "Google", says: "How your sites and your customers' sites do in Search." },
  { key: "ai", href: "/owner/ai", label: "AI visibility", says: "Whether ChatGPT, Claude and Perplexity read you, send people, and name you." },
];

export function OwnerShell({ section, range, now, children }: { section: OwnerSection; range: Range; now: number; children: React.ReactNode }) {
  const w = windows(range, now);
  const from = new Date(w.from).toISOString();
  const to = new Date(w.to - 1).toISOString();
  const current = OWNER_SECTIONS.find((s) => s.key === section)!;
  const q = range === 30 ? "" : `?range=${range}`;
  return (
    <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
            Owner{section !== "home" ? <span className="text-ink-faint"> / {current.label}</span> : null}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {current.says}
            <span className="text-ink-faint">
              {" "}
              · {shortDate(from)} – {shortDate(to)}, UTC
            </span>
          </p>
        </div>
        <nav aria-label="Range" className="flex w-full rounded-xl border border-line-soft bg-surface p-1 sm:w-auto">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={r === 30 ? current.href : `${current.href}?range=${r}`}
              scroll={false}
              aria-current={r === range ? "page" : undefined}
              className={cx(
                "flex-1 rounded-lg px-4 py-1.5 text-center font-mono text-[12.5px] tabular-nums transition-colors sm:flex-none",
                r === range ? "bg-surface-3 text-ink" : "text-ink-faint hover:text-ink",
                FOCUS_RING,
              )}
            >
              {r === 365 ? "12m" : `${r}d`}
            </Link>
          ))}
        </nav>
      </header>

      <nav aria-label="Owner sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line-soft">
          {OWNER_SECTIONS.map((s) => {
            const active = s.key === section;
            return (
              <li key={s.key}>
                <Link
                  href={`${s.href}${q}`}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] transition-colors",
                    active ? "border-ink text-ink" : "border-transparent text-ink-faint hover:border-line hover:text-ink",
                    FOCUS_RING,
                  )}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}
