"use client";

import Link from "next/link";
import { useState } from "react";

import { cx, FOCUS_RING } from "@/components/ui/styles";
import type { Visit } from "@/lib/owner-visitors";
import { ago, span } from "./format";
import { countryName, flag, KIND_COLOR, KIND_NAME, VERDICT } from "./visitor-labels";

// Every visit, newest first, filterable by how it arrived. One row per
// person per day (the visitor hash rotates daily on purpose).

export type VisitRow = Visit & { who: string | null };
type Kind = keyof typeof KIND_COLOR;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function when(iso: string, now: number): string {
  const d = new Date(iso);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const today = new Date(now).toISOString().slice(0, 10) === iso.slice(0, 10);
  return today ? `Today ${hm}` : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${hm}`;
}

function Source({ v }: { v: VisitRow }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[v.channel.kind] }} aria-hidden="true" />
        <span className="truncate">{v.how?.title ?? v.channel.name}</span>
      </span>
      <span className="mt-0.5 block truncate pl-4 text-[11.5px] text-ink-faint" title={v.how?.detail}>
        {v.how ? v.how.detail : [KIND_NAME[v.channel.kind], v.referrer, v.campaign].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

/** Human, Bot or Unsure, our guess for this visit; the reason on hover. */
function Guess({ v }: { v: VisitRow }) {
  return (
    <span title={v.why} className="inline-flex cursor-help items-center gap-1.5 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: VERDICT[v.verdict].color }} aria-hidden="true" />
      <span className={v.verdict === "person" ? "text-ok" : v.verdict === "bot" ? "text-warn" : "text-ink-muted"}>{VERDICT[v.verdict].word}</span>
    </span>
  );
}

const PAGE_SIZE = 20;

/** Page numbers to show: first, last, and the current one's neighbours; null is a gap. */
function pageList(at: number, pages: number): Array<number | null> {
  const keep = [...new Set([0, pages - 1, at - 1, at, at + 1])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  keep.forEach((n, i) => {
    if (i && n - keep[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

function PageButton({ children, label, onClick, disabled, current }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; current?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "min-w-8 rounded-lg border px-2 py-1 font-mono text-[12.5px] tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-35",
        current ? "border-line bg-surface-3 text-ink" : "border-transparent text-ink-faint hover:border-line-soft hover:text-ink",
        FOCUS_RING,
      )}
    >
      {children}
    </button>
  );
}

/** "bot" as a device only repeats the verdict. */
const deviceOf = (v: VisitRow) => (v.device && v.device !== "bot" ? v.device : null);

function Stay({ v }: { v: VisitRow }) {
  const ms = new Date(v.lastAt).getTime() - new Date(v.firstAt).getTime();
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink">{v.views}</span>
      <span className="text-ink-faint">{v.views === 1 ? " page" : " pages"}</span>
      {ms >= 60_000 ? <span className="block text-[11.5px] text-ink-faint">{span(ms)}</span> : null}
    </span>
  );
}

export function VisitTable({ visits, now }: { visits: VisitRow[]; now: number }) {
  const [kind, setKind] = useState<Kind | "all">("all");
  const [pageNo, setPageNo] = useState(0);
  const counts = new Map<Kind, number>();
  for (const v of visits) counts.set(v.channel.kind, (counts.get(v.channel.kind) ?? 0) + 1);
  const kinds = (Object.keys(KIND_NAME) as Kind[]).filter((k) => counts.get(k));
  const list = kind === "all" ? visits : visits.filter((v) => v.channel.kind === kind);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const at = Math.min(pageNo, pages - 1);
  const page = list.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);

  if (!visits.length) {
    return <p className="mx-5 mb-6 mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint sm:mx-6">No visit in this range yet.</p>;
  }

  return (
    <div>
      <div role="tablist" aria-label="Filter visits" className="flex gap-1.5 overflow-x-auto px-5 pb-3 pt-3 sm:px-6">
        {[["all", "All", visits.length] as const, ...kinds.map((k) => [k, KIND_NAME[k], counts.get(k) ?? 0] as const)].map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setPageNo(0);
            }}
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors",
              kind === k ? "border-line bg-surface-3 text-ink" : "border-line-soft text-ink-faint hover:text-ink",
              FOCUS_RING,
            )}
          >
            {k !== "all" ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[k] }} aria-hidden="true" /> : null}
            {label}
            <span className="font-mono tabular-nums text-ink-faint">{n}</span>
          </button>
        ))}
      </div>

      {/* Phones: one card per visit. */}
      <ul className="divide-y divide-line-soft border-t border-line-soft md:hidden">
        {page.map((v) => (
          <li key={v.key} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Source v={v} />
              </div>
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint" title={when(v.lastAt, now)}>
                {ago(v.lastAt, now)}
              </span>
            </div>
            <p className="mt-2 truncate font-mono text-[12px] text-ink-muted" title={v.pages.join("  →  ")}>
              {v.landing}
            </p>
            <p className="mt-1 text-[12px] text-ink-faint">
              <Guess v={v} /> · {flag(v.country)} {countryName(v.country)}
              {deviceOf(v) ? ` · ${deviceOf(v)}` : ""} · {v.views} {v.views === 1 ? "page" : "pages"}
              {v.who ? (
                <span className="text-info">
                  {" · "}
                  {v.userId ? (
                    <Link href={`/owner/customers/${v.userId}`} scroll={false} className="hover:underline">
                      {v.who}
                    </Link>
                  ) : (
                    v.who
                  )}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>

      {/* Wider screens: a table. */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-t border-line-soft text-left">
          <colgroup>
            <col className="w-[9.5rem]" />
            <col className="w-[22%]" />
            <col className="w-[24%]" />
            <col />
            <col className="w-[6.5rem]" />
          </colgroup>
          <thead>
            <tr className="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">
              <th className="px-6 py-2.5 font-medium">When</th>
              <th className="px-3 py-2.5 font-medium">Visitor</th>
              <th className="px-3 py-2.5 font-medium">Came from</th>
              <th className="px-3 py-2.5 font-medium">Landed on</th>
              <th className="px-6 py-2.5 text-right font-medium">Viewed</th>
            </tr>
          </thead>
          <tbody>
            {page.map((v) => (
              <tr key={v.key} className="border-t border-line-soft align-top transition-colors hover:bg-surface-2/40">
                <td className="px-6 py-3">
                  <span className="block font-mono text-[12.5px] tabular-nums text-ink">{when(v.lastAt, now)}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-faint">{ago(v.lastAt, now)}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="block truncate text-[13.5px] text-ink">
                    <span className="mr-1.5" aria-hidden="true">
                      {flag(v.country)}
                    </span>
                    {countryName(v.country)}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-ink-faint">
                    <Guess v={v} />
                    {deviceOf(v) ? <span className="capitalize"> · {deviceOf(v)}</span> : null}
                    {v.who ? (
                <span className="normal-case text-info">
                  {" · "}
                  {v.userId ? (
                    <Link href={`/owner/customers/${v.userId}`} scroll={false} className="hover:underline">
                      {v.who}
                    </Link>
                  ) : (
                    v.who
                  )}
                </span>
              ) : null}
                  </span>
                </td>
                <td className="min-w-0 px-3 py-3">
                  <Source v={v} />
                </td>
                <td className="min-w-0 px-3 py-3">
                  <span className="block truncate font-mono text-[12.5px] text-ink" title={v.landing}>
                    {v.landing}
                  </span>
                  {v.pages.length > 1 ? (
                    <span className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-faint" title={v.pages.join("  →  ")}>
                      then {v.pages.slice(1).join(" → ")}
                    </span>
                  ) : null}
                </td>
                <td className="px-6 py-3 text-right font-mono text-[12.5px] tabular-nums">
                  <Stay v={v} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav aria-label="Visit pages" className="flex items-center justify-between gap-3 border-t border-line-soft px-5 py-3 sm:px-6">
          <p className="font-mono text-[12px] tabular-nums text-ink-faint">
            {at * PAGE_SIZE + 1}–{Math.min((at + 1) * PAGE_SIZE, list.length)} of {list.length}
          </p>
          <div className="flex items-center gap-1">
            <PageButton label="Previous page" disabled={at === 0} onClick={() => setPageNo(at - 1)}>
              ←
            </PageButton>
            {pageList(at, pages).map((n, i) =>
              n === null ? (
                <span key={`gap${i}`} className="px-1 text-[12px] text-ink-faint">
                  …
                </span>
              ) : (
                <PageButton key={n} label={`Page ${n + 1}`} current={n === at} onClick={() => setPageNo(n)}>
                  {n + 1}
                </PageButton>
              ),
            )}
            <PageButton label="Next page" disabled={at === pages - 1} onClick={() => setPageNo(at + 1)}>
              →
            </PageButton>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
