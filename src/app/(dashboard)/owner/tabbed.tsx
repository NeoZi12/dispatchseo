"use client";

import { useState } from "react";

import { cx, FOCUS_RING } from "@/components/ui/styles";
import { BarList, type BarRow } from "./bits";
import type { Tone } from "./curve";

/** A panel whose body switches between a few bar lists (Pages / Countries /
 *  Devices...), so one card answers several "where" questions. */
export function TabbedLists({
  title,
  tabs,
  tone = "blue",
}: {
  title: string;
  tabs: Array<{ key: string; label: string; rows: BarRow[]; empty: string; total?: number }>;
  tone?: Tone;
}) {
  const [key, setKey] = useState(tabs[0]?.key);
  const t = tabs.find((x) => x.key === key) ?? tabs[0];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        <div role="tablist" aria-label={title} className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={x.key === t?.key}
              onClick={() => setKey(x.key)}
              className={cx(
                "shrink-0 rounded-md px-2.5 py-1 text-[12.5px] transition-colors",
                x.key === t?.key ? "bg-surface-3 text-ink" : "text-ink-faint hover:text-ink",
                FOCUS_RING,
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 pb-6 pt-5 sm:px-6">{t ? <BarList rows={t.rows} total={t.total} tone={tone} empty={t.empty} /> : null}</div>
    </div>
  );
}
