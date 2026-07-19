"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSiteLaunchedAt } from "@/app/actions";

// The launch-date row on Settings. Migration 0015 backfills the date from
// created_at (when the project joined DispatchSEO), which undercounts any
// site that existed before - this row is where the owner corrects it so the
// site-age readout (Journey) reflects the real age.
export function SiteLaunchedRow({ current }: { current: string }) {
  const initial = current.slice(0, 10);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dirty = value !== initial && value.length === 10;

  function save() {
    if (!dirty || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSiteLaunchedAt(value);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="text-sm text-neutral-500" title="Shown as your site's age on the Journey page">
        Site launched
      </span>
      <span className="flex items-center gap-2">
        <input
          type="date"
          value={value}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-200 [color-scheme:dark]"
        />
        {dirty ? (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        ) : null}
        {error ? <span className="text-xs text-red-400">{error}</span> : null}
      </span>
    </div>
  );
}
