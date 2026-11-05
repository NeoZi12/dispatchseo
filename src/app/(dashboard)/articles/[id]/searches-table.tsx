"use client";

import { useState } from "react";
import { cx, FOCUS_RING } from "@/components/ui/styles";

/** One row, formatted on the server (the table only lays it out). */
export type SearchRow = {
  query: string;
  clicks: string;
  impressions: string;
  rate: string;
  spot: string;
  /** Width of the quiet bar behind the search, 4-100 (% of the busiest). */
  bar: number;
  target: boolean;
};

/** Rows shown before "Show all": about the height of the details column
 *  beside the table (owner, 2026-11-05: "the same length as the details
 *  box", 25 rows ran far past it). */
const FIRST = 10;

export function SearchesTable({ rows }: { rows: SearchRow[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST);
  const hidden = rows.length - FIRST;
  return (
    <>
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="border-y border-line-soft text-left text-[12px] text-ink-faint">
            <th scope="col" className="px-5 py-2 font-medium sm:px-6">Search</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Clicks</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Impressions</th>
            <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Click rate</th>
            <th scope="col" className="px-5 py-2 text-right font-medium sm:px-6">Spot</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {shown.map((q) => (
            <tr key={q.query}>
              <td className="relative max-w-0 px-5 py-2.5 sm:px-6">
                {/* A quiet bar behind the search, sized by how often it showed the page. */}
                <span aria-hidden="true" className="absolute inset-y-1.5 left-3 rounded bg-ink/[0.05] sm:left-4" style={{ width: `calc(${q.bar}% - 1.5rem)` }} />
                <span className="relative flex min-w-0 items-center gap-2">
                  <span className="truncate text-ink" title={q.query}>
                    {q.query}
                  </span>
                  {q.target ? <span className="shrink-0 rounded border border-line px-1.5 text-[11px] text-ink-muted">written for</span> : null}
                </span>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-ink">{q.clicks}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-ink-muted">{q.impressions}</td>
              <td className="hidden px-2 py-2.5 text-right tabular-nums text-ink-muted sm:table-cell">{q.rate}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-ink-muted sm:px-6">{q.spot}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 ? (
        <div className="border-t border-line-soft px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            aria-expanded={all}
            className={cx("rounded-sm text-[13.5px] font-medium text-ink-muted hover:text-ink", FOCUS_RING)}
          >
            {all ? "Show fewer" : `Show all ${rows.length} searches`}
          </button>
        </div>
      ) : null}
    </>
  );
}
