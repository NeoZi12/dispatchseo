"use client";

import { useActionState, useState, startTransition } from "react";
import { AI_OPTIONS, SITE_KINDS, type AiChoice, type SiteKind } from "@/lib/qualifier-options";
import { AiMark, SiteKindMark } from "./qualify-marks";
import { submitQualifier, type QualifyState } from "./actions";
import { VerdictCard } from "./verdict-card";

// Client half of /qualify. Two screens, one answer. Screen 1 asks what kind of
// site it is (two big cards, domain optional underneath); screen 2 asks which
// AI will write, grouped the way a buyer thinks about it - a chat app or a
// coding agent - with the two dead ends (Gemini, none) behind a small link
// instead of sitting as tiles beside the real choices. The answer is either a
// green "you're set" with a link to the plans, or a plain statement of what we
// can't do - never a form asking for their email so we can "let them know",
// because a waitlist for a thing we might not build is the same lie as a
// checkout that can't finish.
//
// One <form>, both screens inside it: the hidden step only changes what is
// visible, so every field still posts in a single server action exactly as
// before. Going back to step 1 keeps the step-2 selection.

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.12em] text-neutral-500">
      <span aria-hidden="true" className="flex items-center gap-1.5">
        <span className={`h-1.5 w-5 rounded-full ${step >= 1 ? "bg-violet-500" : "bg-neutral-800"}`} />
        <span className={`h-1.5 w-5 rounded-full ${step >= 2 ? "bg-violet-500" : "bg-neutral-800"}`} />
      </span>
      Step {step} of 2
    </p>
  );
}

export function QualifyForm() {
  const [state, action, pending] = useActionState<QualifyState, FormData>(submitQualifier, null);
  // A verdict means the whole form was submitted once already - land on the
  // screen that holds it, with everything still filled in, so "change your
  // answers and check again" is a real offer rather than a restart.
  const [step, setStep] = useState<1 | 2>(state?.verdict ? 2 : 1);
  const [siteKind, setSiteKind] = useState<SiteKind | null>(
    state?.siteKind === "wordpress" || state?.siteKind === "code" ? state.siteKind : null,
  );
  const [ai, setAi] = useState<AiChoice | null>(
    AI_OPTIONS.some((o) => o.value === state?.ai) ? (state!.ai as AiChoice) : null,
  );
  const [showOther, setShowOther] = useState(
    AI_OPTIONS.some((o) => o.group === "other" && o.value === state?.ai),
  );

  // After a verdict the form steps aside; "Change my answers" brings it back.
  const [reviewing, setReviewing] = useState(false);
  const showVerdict = Boolean(state?.verdict) && !reviewing;

  const chosenKind = SITE_KINDS.find((k) => k.value === siteKind) ?? null;

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
          fd.set("ai", ai ?? "");
          setReviewing(false);
          startTransition(() => action(fd));
        }}
        className="mt-8"
        hidden={showVerdict}
        aria-hidden={showVerdict}
      >
        {/* ============ Step 1 · what kind of site ============ */}
        <section hidden={step !== 1} aria-hidden={step !== 1}>
          <StepDots step={1} />
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
            type="button"
            disabled={!siteKind}
            onClick={() => setStep(2)}
            className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Next
            <span aria-hidden="true">&rarr;</span>
          </button>
        </section>

        {/* ============ Step 2 · which AI ============ */}
        <section hidden={step !== 2} aria-hidden={step !== 2}>
          <StepDots step={2} />
          <h2 className="mt-3 text-lg font-semibold text-neutral-50">Which AI will do the writing?</h2>
          <p className="mt-1 text-[13px] text-neutral-500">
            DispatchSEO drives your AI. It doesn&apos;t come with one.
          </p>

          {chosenKind ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 py-1 pl-2 pr-3 text-[12.5px] text-neutral-300">
              <span className="text-neutral-400">
                <SiteKindMark kind={chosenKind.value} className="h-4 w-4" />
              </span>
              {chosenKind.label}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="cursor-pointer font-medium text-violet-300 underline-offset-2 hover:underline"
              >
                change
              </button>
            </p>
          ) : null}

          <p className="mt-4 text-sm font-medium text-neutral-200">Pick the one you use - just one.</p>
          <div className="mt-2 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {AI_OPTIONS.filter((o) => o.group !== "other").map((o) => {
                const on = ai === o.value;
                return (
                  <label
                    key={o.value}
                    className={[
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                      on
                        ? "border-violet-500/70 bg-violet-500/10"
                        : "border-neutral-800 bg-neutral-950 hover:border-neutral-700",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="ai"
                      value={o.value}
                      checked={on}
                      onChange={() => setAi(o.value)}
                      className="sr-only"
                    />
                    <span className="shrink-0 text-neutral-200">
                      <AiMark ai={o.value} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium text-neutral-100">
                        {o.label}
                        {o.soon ? (
                          <span className="rounded-md bg-amber-500/15 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-amber-300">
                            soon
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-[12px] leading-snug text-neutral-500">{o.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {/* The dead ends, behind a link: still answerable (and the server
                still explains why they can't drive this), but not two tiles
                out of seven making the product look half-built. */}
            {showOther ? (
              <fieldset className="rounded-2xl border border-dashed border-neutral-800 p-3.5">
                <legend className="px-1 text-sm font-semibold text-neutral-300">Something else</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {AI_OPTIONS.filter((o) => o.group === "other").map((o) => {
                    const on = ai === o.value;
                    return (
                      <label
                        key={o.value}
                        className={[
                          "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors",
                          on
                            ? "border-violet-500/70 bg-violet-500/10"
                            : "border-neutral-800 bg-neutral-950 hover:border-neutral-700",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="ai"
                          value={o.value}
                          checked={on}
                          onChange={() => setAi(o.value)}
                          className="mt-1 h-3.5 w-3.5 shrink-0 accent-violet-500"
                        />
                        <span>
                          <span className="block text-sm font-medium text-neutral-100">{o.label}</span>
                          <span className="block text-[12px] leading-snug text-neutral-500">{o.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <button
                type="button"
                onClick={() => setShowOther(true)}
                className="cursor-pointer text-[13px] text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
              >
                I use something else, or no AI at all
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || !ai || !siteKind}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {pending ? (
                <>
                  <Spinner />
                  Checking
                </>
              ) : (
                "Check my setup"
              )}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="cursor-pointer text-sm text-neutral-400 hover:text-neutral-200"
            >
              &larr; Back
            </button>
          </div>
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
          onChange={() => {
            setReviewing(true);
            setStep(2);
          }}
        />
      ) : null}
    </>
  );
}
