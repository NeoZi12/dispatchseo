"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx, FOCUS_RING } from "./styles";

/**
 * A click-to-open card anchored under its trigger, in the dispatcher's
 * popover style. The trigger is a real button (Tab + Enter); Escape or a
 * click anywhere else closes it. The panel's content is rendered on the
 * server and stays in the DOM while closed (hidden), so it's real text.
 */
export function Popover({
  trigger,
  children,
  label,
  align = "left",
  className = "",
  triggerClassName = "",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** What the panel is, for assistive tech. */
  label: string;
  /** Which edge of the trigger the panel lines up with. */
  align?: "left" | "right" | "center";
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cx("relative min-w-0", className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cx("block w-full text-left", FOCUS_RING, triggerClassName)}
      >
        {trigger}
      </button>
      <div
        id={id}
        role="dialog"
        aria-label={label}
        hidden={!open}
        className={cx(
          "dispatch-pop absolute top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface-2 p-4 shadow-2xl shadow-black/50",
          align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
