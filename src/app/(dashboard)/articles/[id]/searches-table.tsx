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
  /** Raw numbers for the colour rules (clicks > 0 green, spot 1-3 green). */
  clickCount: number;
  position: number | null;
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
      {/* Colour (owner, 2026-11-05: "a little bit of color, like the
          section above"), within the dashboard's rules: clicks are the one
          green number, the impressions bar takes the chart's violet, and
          a top-three spot gets the green chip the top-posts list uses.
          Fixed number columns give the search itself the room. */}
      <table className="w-full table-fixed text-[13.5px]">
        <colgroup>
          <col />
          <col className="w-16 sm:w-20" />
          <col className="w-24 sm:w-28" />
          <col className="hidden w-24 sm:table-column" />
          <col className="w-20 sm:w-24" />
        </colgroup>
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
          {shown.map((q) => {
            const top3 = q.position != null && q.position > 0 && Math.round(q.position) <= 3;
            return (
              <tr key={q.query} className="transition-colors hover:bg-surface-2/60">
                <td className="relative px-5 py-2.5 sm:px-6">
                  {/* A quiet violet bar behind the search, sized by how often it showed the page. */}
                  <span aria-hidden="true" className="absolute inset-y-1.5 left-3 rounded bg-accent/[0.09] sm:left-4" style={{ width: `calc(${q.bar}% - 1.5rem)` }} />
                  <span className="relative flex min-w-0 items-center gap-2">
                    <span className="truncate text-ink" title={q.query}>
                      {q.query}
                    </span>
                    {q.target ? <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent">written for</span> : null}
                  </span>
                </td>
                <td className={cx("px-2 py-2.5 text-right font-medium tabular-nums", q.clickCount > 0 ? "text-ok" : "text-ink-faint")}>{q.clicks}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-ink-muted">{q.impressions}</td>
                <td className="hidden px-2 py-2.5 text-right tabular-nums text-ink-muted sm:table-cell">{q.rate}</td>
                <td className="px-5 py-2.5 text-right sm:px-6">
                  <span className={cx("inline-block min-w-[2.75rem] rounded-md px-1.5 py-px text-center tabular-nums", top3 ? "bg-ok-soft font-medium text-ok" : "text-ink-muted")}>{q.spot}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hidden > 0 ? (
        <div className="border-t border-line-soft px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            aria-expanded={all}
            className={cx("rounded-sm text-[13.5px] font-medium text-accent hover:text-ink", FOCUS_RING)}
          >
            {all ? "Show fewer" : `Show all ${rows.length} searches`}
          </button>
        </div>
      ) : null}
    </>
  );
}
