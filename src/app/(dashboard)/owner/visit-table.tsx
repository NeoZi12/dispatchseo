"use client";

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
        <span className="truncate">{v.channel.name}</span>
      </span>
      <span className="mt-0.5 block truncate pl-4 text-[11.5px] text-ink-faint">
        {v.channel.kind === "direct" ? "Typed in, a bookmark, or an app" : [KIND_NAME[v.channel.kind], v.referrer, v.campaign].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

function Verdict({ v }: { v: VisitRow }) {
  const x = VERDICT[v.verdict];
  return (
    <span title={v.why} className={cx("inline-flex shrink-0 cursor-help items-center rounded-md border px-1.5 py-px text-[11px] font-medium", x.cls)}>
      {x.word}
    </span>
  );
}

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
  const [verdict, setVerdict] = useState<VisitRow["verdict"] | "all">("all");
  const [shown, setShown] = useState(25);
  const counts = new Map<Kind, number>();
  for (const v of visits) counts.set(v.channel.kind, (counts.get(v.channel.kind) ?? 0) + 1);
  const kinds = (Object.keys(KIND_NAME) as Kind[]).filter((k) => counts.get(k));
  const verdicts = (["person", "unsure", "bot"] as const).filter((k) => visits.some((v) => v.verdict === k));
  const list = visits.filter((v) => (kind === "all" || v.channel.kind === kind) && (verdict === "all" || v.verdict === verdict));
  const page = list.slice(0, shown);

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
              setShown(25);
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
        {verdicts.length > 1 ? <span className="mx-1 w-px shrink-0 self-stretch bg-line-soft" aria-hidden="true" /> : null}
        {verdicts.length > 1
          ? verdicts.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={verdict === k}
                onClick={() => {
                  setVerdict(verdict === k ? "all" : k);
                  setShown(25);
                }}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors",
                  verdict === k ? "border-line bg-surface-3 text-ink" : "border-line-soft text-ink-faint hover:text-ink",
                  FOCUS_RING,
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: VERDICT[k].color }} aria-hidden="true" />
                {VERDICT[k].word}
                <span className="font-mono tabular-nums text-ink-faint">{visits.filter((v) => v.verdict === k).length}</span>
              </button>
            ))
          : null}
      </div>

      {/* Phones: one card per visit. */}
      <ul className="divide-y divide-line-soft border-t border-line-soft md:hidden">
        {page.map((v) => (
          <li key={v.key} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Source v={v} />
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-mono text-[11.5px] tabular-nums text-ink-faint" title={when(v.lastAt, now)}>
                  {ago(v.lastAt, now)}
                </span>
                <Verdict v={v} />
              </span>
            </div>
            <p className="mt-2 truncate font-mono text-[12px] text-ink-muted" title={v.pages.join("  →  ")}>
              {v.landing}
            </p>
            <p className="mt-1 text-[12px] text-ink-faint">
              {flag(v.country)} {countryName(v.country)} · {v.device ?? "unknown"} · {v.views} {v.views === 1 ? "page" : "pages"}
              {v.who ? <span className="text-info"> · {v.who}</span> : null}
            </p>
          </li>
        ))}
      </ul>

      {/* Wider screens: a table. */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-t border-line-soft text-left">
          <colgroup>
            <col className="w-[9.5rem]" />
            <col className="w-[26%]" />
            <col className="w-[22%]" />
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
                  <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink">
                    <span className="truncate">
                      <span className="mr-1.5" aria-hidden="true">
                        {flag(v.country)}
                      </span>
                      {countryName(v.country)}
                    </span>
                    <Verdict v={v} />
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] capitalize text-ink-faint">
                    {v.device ?? "unknown"}
                    {v.who ? <span className="normal-case text-info"> · {v.who}</span> : null}
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

      {list.length > shown ? (
        <div className="border-t border-line-soft px-5 py-3 sm:px-6">
          <button type="button" onClick={() => setShown((n) => n + 50)} className={cx("text-[13px] text-ink-muted hover:text-ink", FOCUS_RING)}>
            Show {Math.min(50, list.length - shown)} more of {list.length - shown}
          </button>
        </div>
      ) : null}
    </div>
  );
}
