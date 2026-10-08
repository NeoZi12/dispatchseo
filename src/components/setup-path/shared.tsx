"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { CopyBox } from "@/components/wizard-ui";

// Small pieces every setup-path file shares: the preview switch, the one
// violet primary button, inline-code text, and the command box.

/** True inside /onboarding/preview: no server action runs, no poll fires,
 *  no link navigates. The preview renders fixtures against the LIVE-database
 *  dev server, so a stray submit there would write a real row. */
export const SetupPreviewContext = createContext(false);
export function useSetupPreview(): boolean {
  return useContext(SetupPreviewContext);
}

/** prefers-reduced-motion, hydration-safe: false on the server AND on the
 *  first client render (useReducedMotion is null on the server and true on
 *  the client, and the card branches markup on it), the real value after. */
export function useReducedMotionSafe(): boolean {
  const pref = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && Boolean(pref);
}

/** The one violet primary. Full width on phones, a comfortable fixed size
 *  from `sm` up. */
export const primaryBtn =
  "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-center bg-violet-500 px-6 py-3 text-[15px] font-semibold text-neutral-950 shadow-[0_8px_30px_-12px_rgba(139,92,246,0.7)] transition-[background-color,transform] hover:bg-violet-400 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[15rem]";

export const quietLink =
  "cursor-pointer rounded text-sm text-neutral-500 underline-offset-4 transition-colors hover:text-neutral-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Renders `backtick` spans as inline code. Engine copy uses them for the
 *  exact words to type ("say: `Say hello to DispatchSEO`"). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[0.92em] text-neutral-100 [overflow-wrap:anywhere]">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function ExternalArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3 w-3 shrink-0" aria-hidden>
      <path d="M7 17 17 7" strokeLinecap="round" />
      <path d="M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A terminal command as the step's one emphasised copy box, with the
 *  PowerShell twin behind a Mac/Windows switch. Same OS-default behaviour as
 *  ShellCommandTabs (the visitor's OS picks the tab after mount, never on the
 *  server), but ShellCommandTabs only renders the plain CopyBox and here the
 *  command IS the primary, so it needs the emphasis variant. When both shells
 *  get the same string (Codex) there is nothing to switch, so no tabs. */
export function CommandCopy({ bash, powershell }: { bash: string; powershell: string }) {
  const [shell, setShell] = useState<"bash" | "powershell">("bash");
  useEffect(() => {
    if (navigator.userAgent.includes("Windows")) setShell("powershell");
  }, []);
  const same = bash === powershell;
  const text = same || shell === "bash" ? bash : powershell;
  return (
    <div className="min-w-0 space-y-2">
      {same ? null : (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Shell">
          {(
            [
              ["bash", "Mac / Linux"],
              ["powershell", "Windows (PowerShell)"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={shell === key}
              onClick={() => setShell(key)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                shell === key ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <CopyBox text={text} emphasis />
    </div>
  );
}

/** Copy-to-clipboard as the violet primary, with the existing
 *  "Copy" -> "Copied" morph. */
export function CopyPrimary({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          },
          () => {},
        );
      }}
      className={`${primaryBtn} ${copied ? "!bg-emerald-400" : ""}`}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-4 w-4" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** A pasted chat prompt, shown whole (it wraps, unlike a command). */
export function PasteText({ text }: { text: string }) {
  return (
    <blockquote className="break-words rounded-xl border border-violet-500/30 bg-neutral-950 px-4 py-3.5 text-[15px] leading-relaxed text-neutral-100 shadow-[0_0_36px_-14px_rgba(139,92,246,0.45)]">
      {text}
    </blockquote>
  );
}

export function PreviewToast({ show, children }: { show: boolean; children?: ReactNode }) {
  if (!show) return null;
  return (
    <p className="mt-3 text-center text-xs font-medium text-amber-300/90" role="status">
      {children ?? "Preview: nothing is saved."}
    </p>
  );
}
