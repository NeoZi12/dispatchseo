"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Analytics' two plain tables, as client components for weight: the RSC
// payload carries the rows as compact data instead of a markup tree per
// cell, and rows behind "Show more" aren't rendered until asked for.

export type LandedRow = { path: string; url: string; title: string | null; clicks: number; impressions: number; position: number | null; gone: boolean };

const n = (v: number) => v.toLocaleString("en-US");
const spot = (p: number | null) => (p == null ? "-" : `#${Math.max(1, Math.round(p))}`);

/** Where Google's clicks landed. A page we know no longer loads keeps its
 *  row and clicks (the totals still add up) but is marked "Gone", isn't
 *  linked, and isn't counted as bringing people in. Pages with clicks
 *  always show; the quiet tail folds away after ten (40 more at most). */
export function LandedTable({ rows }: { rows: LandedRow[] }) {
  const [more, setMore] = useState(false);
  if (!rows.length) return <EmptyState title="No page data yet">Rows appear once Google reports which pages it showed.</EmptyState>;
  const earning = rows.filter((r) => r.clicks > 0 && !r.gone).length;
  const goneCount = rows.filter((r) => r.gone).length;
  const cut = Math.max(rows.filter((r) => r.clicks > 0).length, 10);
  const shown = more ? rows.slice(0, cut + 40) : rows.slice(0, cut);
  const extra = Math.min(rows.length - cut, 40);
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-ink-muted">
        <span className="font-medium text-ink">{earning}</span> {earning === 1 ? "page" : "pages"} brought people in
        {goneCount ? `. ${goneCount} ${goneCount === 1 ? "page is" : "pages are"} no longer on your site.` : "."}
      </p>
      <Table caption="Pages people opened from Google, last 28 days">
        <TableHead>
          <TableHeader>Page</TableHeader>
          <TableHeader className="text-right">Clicks</TableHeader>
          <TableHeader className="hidden text-right sm:table-cell">Seen</TableHeader>
          <TableHeader className="hidden text-right sm:table-cell">Spot</TableHeader>
        </TableHead>
        <tbody>
          {shown.map((r) => (
            <TableRow key={r.path}>
              <TableCell className="w-full max-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  {r.gone ? (
                    <span className="truncate text-ink-muted">{r.path}</span>
                  ) : (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="truncate text-ink hover:text-accent">
                      {r.path}
                    </a>
                  )}
                  {r.gone ? <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-muted">Gone</span> : null}
                </span>
                {r.title ? <span className="mt-0.5 block truncate text-[12.5px] text-ink-faint">{r.title}</span> : null}
              </TableCell>
              <TableCell className="text-right tabular-nums text-ink">{n(r.clicks)}</TableCell>
              <TableCell className="hidden text-right tabular-nums text-ink-muted sm:table-cell">{n(r.impressions)}</TableCell>
              <TableCell className="hidden text-right tabular-nums text-ink-muted sm:table-cell">{spot(r.position)}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
      {extra > 0 ? (
        <button type="button" onClick={() => setMore((v) => !v)} className="text-[13px] font-medium text-accent">
          {more ? "Show fewer" : `Show ${extra} more ${extra === 1 ? "page" : "pages"}`}
        </button>
      ) : null}
      {more && rows.length > cut + 40 ? <p className="text-[13px] text-ink-faint">And {rows.length - cut - 40} smaller pages.</p> : null}
    </div>
  );
}

export type QueryRow = { query: string; clicks: number; position: number | null };

export function QueriesTable({ rows }: { rows: QueryRow[] }) {
  return (
    <Table caption="Top search queries, last 28 days">
      <TableHead>
        <TableHeader>Search</TableHeader>
        <TableHeader className="text-right">Clicks</TableHeader>
        <TableHeader className="hidden text-right sm:table-cell">Spot</TableHeader>
      </TableHead>
      <tbody>
        {rows.map((q) => (
          <TableRow key={q.query}>
            <TableCell className="w-full max-w-0 truncate text-ink">{q.query}</TableCell>
            <TableCell className="text-right tabular-nums text-ink">{n(q.clicks)}</TableCell>
            <TableCell className="hidden text-right tabular-nums text-ink-muted sm:table-cell">{spot(q.position)}</TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
