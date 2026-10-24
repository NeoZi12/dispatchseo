"use client";

import { useId, useState } from "react";
import { cx } from "./styles";

/** A list of short phrases (categories, topics to avoid) edited as chips.
 *  Enter or comma adds, Backspace on an empty box removes the last one.
 *  Posts as ONE hidden input holding a JSON array, so the server action
 *  reads exactly the list the owner sees. */
export function ChipsInput({
  id,
  name,
  defaultValue = [],
  max = 50,
  maxLength = 60,
  placeholder = "Type and press Enter",
}: {
  id?: string;
  name: string;
  defaultValue?: string[];
  max?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const [items, setItems] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const full = items.length >= max;

  // One functional update for any number of pieces: a paste of "a, b, c"
  // adds all three, where three closures over the same `items` would each
  // overwrite the last and keep only "c".
  function addMany(raws: string[]) {
    setItems((prev) => {
      const next = [...prev];
      for (const raw of raws) {
        const v = raw.trim().replace(/\s+/g, " ").slice(0, maxLength);
        if (!v || next.length >= max) continue;
        if (next.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
        next.push(v);
      }
      return next;
    });
  }
  function add(raw: string) {
    addMany([raw]);
    setDraft("");
  }

  return (
    <div
      className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1.5 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/25 hover:border-surface-3"
      onClick={() => document.getElementById(inputId)?.focus()}
    >
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <ul className="contents" aria-label="Added">
        {items.map((item) => (
          <li key={item} className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-3 py-0.5 pl-2 pr-0.5 text-[13px] text-ink">
            <span className="truncate">{item}</span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x !== item))}
              aria-label={`Remove ${item}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-faint hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3 w-3" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <input
        id={inputId}
        value={draft}
        disabled={full}
        maxLength={maxLength}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) {
            const parts = v.split(",");
            addMany(parts.slice(0, -1));
            setDraft(parts.at(-1) ?? "");
          } else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && items.length) {
            setItems((prev) => prev.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={full ? `${max} is the limit` : items.length ? "" : placeholder}
        className={cx("h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-ink-faint")}
      />
    </div>
  );
}
