"use client";

// The URL Slug Generator widget: type a page title, get back a clean,
// hyphenated slug live as you type - no submit button, same calculator
// shape as the SEO title length checker. Everything runs in this
// component - no fetch, no backend, nothing typed ever leaves the browser.
// See src/lib/slug-generator.ts for the transform itself; this file is
// just state + the input/output UI around it.

import { useMemo, useState } from "react";
import { generateSlug, slugLengthVerdict, SLUG_LENGTH_GUIDELINE } from "@/lib/slug-generator";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

const VERDICT_CLASS: Record<"safe" | "long", string> = {
  safe: "bg-emerald-500/10 text-emerald-400",
  long: "bg-amber-300/10 text-amber-300",
};

const VERDICT_LABEL: Record<"safe" | "long", string> = {
  safe: "Good length",
  long: "Long - consider trimming",
};

export function UrlSlugGenerator() {
  const [title, setTitle] = useState("");
  const [stripFillerWords, setStripFillerWords] = useState(true);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => generateSlug(title, stripFillerWords), [title, stripFillerWords]);
  const verdict = slugLengthVerdict(result.slug.length);
  const trimmedInput = title.trim().length > 0;

  function copySlug() {
    navigator.clipboard.writeText(result.slug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="usg-title">
          Page title or working title
        </label>
        <input
          id="usg-title"
          type="text"
          placeholder="e.g. How to Automate SEO Content Publishing"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${inputClass} mt-2`}
        />

        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={stripFillerWords}
            onChange={(e) => setStripFillerWords(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 accent-violet-500"
          />
          Strip filler words (a, the, of, and, ...)
        </label>
      </div>

      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Slug</p>
          {trimmedInput ? (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[verdict]}`}>
              {VERDICT_LABEL[verdict]} · {result.slug.length}/{SLUG_LENGTH_GUIDELINE}
            </span>
          ) : null}
        </div>

        {trimmedInput && result.hasUsableChars ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100">
                {result.slug}
              </code>
              <button
                type="button"
                onClick={copySlug}
                className="shrink-0 rounded-md border border-neutral-700/80 bg-neutral-800/90 px-2.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:text-white"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            {result.removedWords.length > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                Removed as filler: {result.removedWords.join(", ")}
              </p>
            ) : null}
          </>
        ) : trimmedInput ? (
          <p className="mt-2 text-sm text-neutral-400">
            No letters or numbers left after cleanup - this title uses a script the slug format (a-z, 0-9,
            hyphens only) can&apos;t represent. Add a few English words, or write the slug by hand.
          </p>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Your slug will show up here as you type.</p>
        )}
      </div>
    </div>
  );
}
