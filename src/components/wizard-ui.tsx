"use client";

import { useState } from "react";

// Presentational atoms shared by the self-host and cloud onboarding wizards.
// Extracted verbatim from onboarding-wizard.tsx so the two wizards can't
// drift on the basics while keeping their screen JSX independent.

export const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-base text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

export function CopyBox({ text, emphasis }: { text: string; emphasis?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={
        emphasis
          ? "flex items-center gap-3 rounded-xl border border-violet-500/40 bg-neutral-950 py-4 pl-5 pr-3.5 shadow-[0_0_36px_-10px_rgba(139,92,246,0.45)]"
          : "flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-950 py-2.5 pl-3.5 pr-3"
      }
    >
      <code
        className={
          emphasis
            ? "flex-1 overflow-x-auto whitespace-nowrap font-mono text-[15px] text-neutral-100 [scrollbar-width:none]"
            : "flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-neutral-300 [scrollbar-width:none]"
        }
      >
        {text}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }, () => {});
        }}
        className={
          emphasis
            ? `shrink-0 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                copied ? "bg-emerald-400 text-neutral-950" : "bg-violet-500 text-neutral-950 hover:bg-violet-400"
              }`
            : `shrink-0 cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700 ${copied ? "text-emerald-400" : "text-neutral-300"}`
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function StepIcon({ children, done }: { children: React.ReactNode; done?: boolean }) {
  return (
    <div
      className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg border ${
        done
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
          : "border-violet-500/25 bg-violet-500/10 text-violet-400"
      }`}
    >
      {children}
    </div>
  );
}

export function ErrorLine({ msg }: { msg: string }) {
  return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{msg}</p>;
}
