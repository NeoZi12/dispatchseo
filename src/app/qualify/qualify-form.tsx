"use client";

import { useActionState, useState, startTransition } from "react";
import { SITE_KINDS, type SiteKind } from "@/lib/qualifier-options";
import { SiteKindMark } from "./qualify-marks";
import { submitQualifier, type QualifyState } from "./actions";
import { VerdictCard } from "./verdict-card";

// Client half of /qualify. One screen, one answer: what kind of site it is
// (two big cards, domain optional underneath). Since 2026-10-23 there is no
// "which AI" step - cloud sites are written by DispatchSEO itself, so the
// server records "hosted" for every answer. The answer is either a green
// "you're set" with a link to the plans, or a plain statement of what we
// can't do - never a form asking for their email so we can "let them know",
// because a waitlist for a thing we might not build is the same lie as a
// checkout that can't finish.

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function QualifyForm() {
  const [state, action, pending] = useActionState<QualifyState, FormData>(submitQualifier, null);
  const [siteKind, setSiteKind] = useState<SiteKind | null>(
    state?.siteKind === "wordpress" || state?.siteKind === "code" ? state.siteKind : null,
  );

  // After a verdict the form steps aside; "Change my answers" brings it back.
  const [reviewing, setReviewing] = useState(false);
  const showVerdict = Boolean(state?.verdict) && !reviewing;

  return (
    <>
      {/* Submitted from React state, not from the DOM radios: React 19 resets
          the form after a server action, which unchecked the tile radios and
          made the SECOND "Check my setup" arrive without site_kind/ai and fail
          validation (green first, red on the next press, 2026-10-08). */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("site_kind", siteKind ?? "");
          setReviewing(false);
          startTransition(() => action(fd));
        }}
        className="mt-8"
        hidden={showVerdict}
        aria-hidden={showVerdict}
      >
        <section>
          <h2 className="mt-3 text-lg font-semibold text-neutral-50">What kind of website is it?</h2>
          <p className="mt-1 text-[13px] text-neutral-500">
            These are the two kinds we can publish to. Anything else (Wix, Squarespace, Shopify,
            Webflow, Framer) we can&apos;t, and we&apos;d rather say so now.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SITE_KINDS.map((k) => {
              const on = siteKind === k.value;
              return (
                <label
                  key={k.value}
                  className={[
                    "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border px-4 py-6 text-center transition-colors",
                    on
                      ? "border-violet-500/70 bg-violet-500/10"
                      : "border-neutral-800 bg-neutral-900 hover:border-neutral-700",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="site_kind"
                    value={k.value}
                    checked={on}
                    onChange={() => setSiteKind(k.value)}
                    className="sr-only"
                  />
                  <span className={on ? "text-violet-200" : "text-neutral-300"}>
                    <SiteKindMark kind={k.value} className="h-8 w-8" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-neutral-50">{k.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-neutral-500">{k.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-5">
            <label htmlFor="domain" className="block text-sm font-medium text-neutral-200">
              Your site&apos;s address <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <p className="mt-1 text-[13px] text-neutral-500">
              We&apos;ll load the page once to double-check what it&apos;s built with. Nothing is
              changed.
            </p>
            <input
              id="domain"
              name="domain"
              type="text"
              autoComplete="url"
              spellCheck={false}
              defaultValue={state?.domain ?? ""}
              placeholder="yoursite.com"
              className="mt-2.5 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-[15px] text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
            />
          </div>

          <button
            type="submit"
            disabled={pending || !siteKind}
            className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {pending ? (
              <>
                <Spinner />
                Checking
              </>
            ) : (
              "Check my site"
            )}
          </button>
        </section>

      </form>

      {state?.error ? (
        <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">
          {state.error}
        </p>
      ) : null}

      {showVerdict && state?.verdict ? (
        <VerdictCard
          verdict={state.verdict}
          detected={state.detected}
          onChange={() => setReviewing(true)}
        />
      ) : null}
    </>
  );
}
