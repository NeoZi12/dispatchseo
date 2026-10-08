"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { QualifierVerdict } from "@/lib/qualifier";

// The answer screen of /qualify. It REPLACES the form rather than sitting
// under it: a green box appended below two still-open question groups read
// as "and now what?" to the first owners who saw it (2026-10-08). One card,
// one sentence, one big button; the way back is a quiet text link.

export function VerdictCard({
  verdict,
  detected,
  onChange,
}: {
  verdict: QualifierVerdict;
  detected?: string;
  onChange: () => void;
}) {
  const reduce = useReducedMotion();
  const tone = verdict.ok ? "ok" : verdict.building ? "soon" : "no";
  const ring =
    tone === "ok"
      ? "bg-emerald-400 text-neutral-950 shadow-[0_0_60px_-8px_rgba(52,211,153,0.7)]"
      : tone === "soon"
        ? "bg-amber-400 text-neutral-950 shadow-[0_0_60px_-8px_rgba(251,191,36,0.6)]"
        : "bg-neutral-700 text-neutral-100";
  const border =
    tone === "ok"
      ? "border-emerald-400/30"
      : tone === "soon"
        ? "border-amber-400/30"
        : "border-neutral-700";

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 260, damping: 24 }}
      aria-live="polite"
      className={`mt-8 rounded-3xl border bg-neutral-900/80 px-6 py-10 text-center sm:px-10 ${border}`}
    >
      <motion.div
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
        className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${ring}`}
        aria-hidden="true"
      >
        {tone === "ok" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-10 w-10">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.25 }}
            />
          </svg>
        ) : tone === "soon" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-9 w-9">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-9 w-9">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        )}
      </motion.div>

      <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {tone === "ok" ? "Your setup works" : tone === "soon" ? "Not yet" : "This won't work"}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
        {tone === "ok" ? "You're good to go." : verdict.headline}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-neutral-300">
        {verdict.detail}
      </p>
      {detected ? <p className="mt-3 text-[12.5px] text-neutral-500">We saw: {detected}</p> : null}

      {tone === "ok" ? (
        <>
          <Link
            href="/plans"
            className="mt-8 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-6 py-4 text-lg font-semibold text-neutral-950 shadow-[0_8px_40px_-12px_rgba(52,211,153,0.8)] transition-colors hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            Choose your plan
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <p className="mt-3 text-[13px] text-neutral-500">
            Next: pick a plan, then connect your site. Nothing is charged on this page.
          </p>
        </>
      ) : (
        <p className="mt-6 text-[14px] text-neutral-400">Nothing has been charged.</p>
      )}

      <button
        type="button"
        onClick={onChange}
        className={`cursor-pointer text-sm underline-offset-4 hover:underline ${
          tone === "ok"
            ? "mt-5 text-neutral-500 hover:text-neutral-300"
            : "mt-4 inline-flex items-center justify-center rounded-2xl bg-neutral-100 px-6 py-3.5 text-base font-semibold text-neutral-950 no-underline hover:bg-white hover:no-underline"
        }`}
      >
        {tone === "ok" ? "Change my answers" : "Change my answers"}
      </button>
    </motion.section>
  );
}
