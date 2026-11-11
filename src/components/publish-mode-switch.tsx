"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { switchPublishMode } from "@/app/autopilot-actions";
import type { PublishMode } from "@/components/setup-stage/scenes";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { SignalGlyph } from "@/components/ui/on-air";

// How new articles go live, as one small dropdown that stays out of the way
// (owner, 2026-11-10): a control reading "Publishing | Manual review", and a
// menu with the two choices, each a radio row with its plain-English line
// always showing. One click saves.
//
// Each choice wears its own colour icon - green bolt, amber eye - drawn
// bare, never inside a tinted square or circle (owner, 2026-11-11: icons and
// colour yes, boxes around them no). A violet tick marks the current one.
//
// On Overview (the header's status row), Articles (next to the page title)
// and Settings > Publishing. Setup asks the same question with its own two
// cards (setup-stage/scenes.tsx PublishModeCards).

const BOLT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
const EYE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const OPTIONS: { value: PublishMode; label: string; icon: React.ReactNode; tone: string; plain: string }[] = [
  {
    value: "auto",
    label: "Autopilot",
    icon: BOLT,
    tone: "text-ok",
    plain: "Each article goes live on your site the moment it's written and checked. You don't have to do anything.",
  },
  {
    value: "review",
    label: "Manual review",
    icon: EYE,
    tone: "text-warn",
    plain: "Each article waits for you. We email you, you read it, change anything you like, and press Publish.",
  },
];

export function PublishModeMenu({
  slug,
  mode: initial,
  waiting = 0,
  align = "left",
  variant = "pill",
  paused = false,
  className,
}: {
  slug: string;
  /** The saved mode; null/undefined = never chosen = automatic. */
  mode: PublishMode | null | undefined;
  /** Articles waiting for review right now (said after a switch to Autopilot). */
  waiting?: number;
  /** Which edge the menu lines up with. */
  align?: "left" | "right";
  /** "pill": "Publishing: Manual review" (Articles, Settings). "status": the
   *  Overview header's own status - "Autopilot on" / "Review mode on" with
   *  the dispatch signal - which opens the same menu. */
  variant?: "pill" | "status";
  /** The Dispatcher is paused (status variant says so instead). */
  paused?: boolean;
  className?: string;
}) {
  const [mode, setMode] = useState<PublishMode>(initial === "review" ? "review" : "auto");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = OPTIONS.find((o) => o.value === mode)!;

  // Outside click and Escape close it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The note fades on its own.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), note.ok ? 4500 : 7000);
    return () => clearTimeout(t);
  }, [note]);

  function pick(next: PublishMode) {
    setOpen(false);
    if (next === mode || pending) return;
    const before = mode;
    setMode(next);
    start(async () => {
      const r = await switchPublishMode(slug, next).catch(() => null);
      if (!r?.ok) {
        setMode(before);
        setNote({ ok: false, text: r?.message ?? "We couldn't save that just now. Try again." });
        return;
      }
      setNote({
        ok: true,
        text:
          next === "review"
            ? "Manual review is on. New articles wait for you."
            : waiting > 0
              ? `Autopilot is on. ${waiting === 1 ? "The article already waiting still needs" : `The ${waiting} articles already waiting still need`} your Publish.`
              : "Autopilot is on. New articles go live on their own.",
      });
    });
  }

  return (
    <div ref={root} className={cx("relative inline-block", className)}>
      {variant === "status" ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={pending}
          onClick={() => setOpen((v) => !v)}
          title="How new articles go live"
          className={cx(
            "inline-flex h-7 items-center gap-1.5 rounded-full border pl-2 pr-2.5 text-[13px] font-medium transition-colors",
            paused
              ? "border-warn/30 bg-warn/10 text-warn hover:bg-warn/15"
              : mode === "review"
                ? "border-accent/35 bg-accent/10 text-accent hover:bg-accent/15"
                : "border-ok/30 bg-ok/10 text-ok hover:bg-ok/15",
            pending ? "opacity-70" : "",
            FOCUS_RING,
          )}
        >
          {mode === "review" && !paused ? <span className="[&_svg]:h-4 [&_svg]:w-4">{EYE}</span> : <SignalGlyph on={!paused} className="h-4 w-4 shrink-0" />}
          <span className="whitespace-nowrap">{paused ? "Paused" : mode === "review" ? "Review mode on" : "Autopilot on"}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={cx("h-3.5 w-3.5 opacity-70 transition-transform", open ? "rotate-180" : "")} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={pending}
          onClick={() => setOpen((v) => !v)}
          className={cx(
            "group inline-flex h-8 items-center rounded-lg border border-line bg-surface text-[13px] shadow-[inset_0_1px_0_rgb(255_255_255/0.035)] transition-colors hover:border-ink-faint/40",
            open ? "border-ink-faint/40" : "",
            pending ? "opacity-70" : "",
            FOCUS_RING,
          )}
        >
          {/* "Publishing" set quiet, a hairline, then the choice: read as one
              label and its value, the way a settings row reads. */}
          <span className="whitespace-nowrap pl-3 pr-2.5 text-ink-faint transition-colors group-hover:text-ink-muted">
            Publishing<span className="sr-only">:</span>
          </span>
          <span aria-hidden="true" className="h-3.5 w-px bg-line" />
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap pl-2.5 pr-1.5 font-medium text-ink">
            <span className={cx("[&_svg]:h-3.5 [&_svg]:w-3.5", current.tone)}>{current.icon}</span>
            {current.label}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={cx("mr-2 h-3.5 w-3.5 text-ink-faint transition-transform motion-reduce:transition-none", open ? "rotate-180" : "")} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="How new articles go live"
          className={cx(
            "absolute top-[calc(100%+8px)] z-30 w-[320px] max-w-[calc(100vw-2rem)] origin-top overflow-hidden rounded-xl border border-line bg-surface",
            "shadow-[0_24px_48px_-12px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.04)]",
            "animate-[menuIn_140ms_ease-out] motion-reduce:animate-none",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <style>{"@keyframes menuIn{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}"}</style>
          <p aria-hidden="true" className="border-b border-line-soft px-4 pb-2.5 pt-3 text-[12.5px] text-ink-faint">
            How new articles go live
          </p>
          <div role="none" className="space-y-0.5 p-1.5">
            {OPTIONS.map((o) => {
              const on = o.value === mode;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => pick(o.value)}
                  className="group flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/50"
                >
                  {/* The choice's own colour icon, bare - no tile around it. */}
                  <span aria-hidden="true" className={cx("mt-px shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]", o.tone)}>
                    {o.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cx("flex-1 text-[14px] font-medium leading-snug transition-colors", on ? "text-ink" : "text-ink-muted group-hover:text-ink")}>{o.label}</span>
                      {on ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-accent" aria-hidden="true">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-faint">{o.plain}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {note ? (
        <p
          role="status"
          className={cx(
            "absolute top-[calc(100%+8px)] z-20 w-max max-w-[300px] rounded-lg border px-3 py-2 text-[12.5px] leading-snug shadow-lg",
            note.ok ? "border-ok/30 bg-surface text-ink" : "border-danger/30 bg-surface text-danger",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
