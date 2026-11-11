"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { detectLaunchDate, setSiteLaunchedAt } from "@/app/actions";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The launch-date row on Settings. Migration 0015 backfills the date from
// created_at (when the project joined DispatchSEO), which undercounts any
// site that existed before - this row is where the owner corrects it so the
// site-age readout (Journey) reflects the real age.
export function SiteLaunchedRow({ current, slug, hosted = false }: { current: string; slug: string; /** The hosted Settings look: a full row for a card of rows. */ hosted?: boolean }) {
  const initial = current.slice(0, 10);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  const dirty = value !== initial && value.length === 10;

  // "Detect" asks the backend to find real evidence of the launch: Search
  // Console's earliest impression (Google keeps ~16 months) and the Wayback
  // Machine's first capture. It only ever moves the date backward.
  function detect() {
    if (pending) return;
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await detectLaunchDate(slug);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const sourceLabel =
        result.source === "wayback" ? "Wayback Machine first capture" : "Search Console history";
      if (result.updated) {
        setValue(result.date);
        setNote(
          `Set to ${result.date} (${sourceLabel}${result.at_least ? " - the site is at least this old" : ""}).`,
        );
        router.refresh();
      } else {
        setNote(
          `Found ${result.date} (${sourceLabel}) - not earlier than the current date, so nothing changed.`,
        );
      }
    });
  }

  function save() {
    if (!dirty || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSiteLaunchedAt(value, slug);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (hosted) {
    return (
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-[14.5px] font-medium text-ink">Site launched</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">Sets where you are on the SEO timeline. Detect finds it from Google and web archive history.</p>
          {error ? <p className="mt-1.5 text-[13px] text-danger">{error}</p> : null}
          {note ? <p className="mt-1.5 text-[13px] text-ink-muted">{note}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            type="date"
            aria-label="Site launched"
            value={value}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            className="w-44 [color-scheme:dark]"
          />
          {dirty ? (
            <button type="button" onClick={save} disabled={pending} className={buttonClass("primary", "sm")}>
              {pending ? "Saving…" : "Save"}
            </button>
          ) : (
            <button type="button" onClick={detect} disabled={pending} className={buttonClass("secondary", "sm")}>
              {pending ? "Detecting…" : "Detect"}
            </button>
          )}
        </div>
      </div>
    );
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
        ) : (
          <button
            type="button"
            onClick={detect}
            disabled={pending}
            title="Find the real launch date from Search Console history and the Wayback Machine - only ever moves the date backward"
            className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          >
            {pending ? "Detecting…" : "Detect"}
          </button>
        )}
        {error ? <span className="max-w-xs text-xs text-red-400">{error}</span> : null}
        {note ? <span className="max-w-xs text-xs text-neutral-400">{note}</span> : null}
      </span>
    </div>
  );
}
