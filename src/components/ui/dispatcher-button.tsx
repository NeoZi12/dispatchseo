"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PixelReporter, type DispatcherMood } from "@/components/pixel-dispatcher";
import { cx, FOCUS_RING } from "./styles";

/**
 * The dispatcher, small, at its desk in the header. It doesn't talk unless
 * it has something to say: then an amber "!" sits over its head, and
 * clicking it (a real button, so Tab + Enter too) opens the message beside
 * it. Escape or a click anywhere else closes it. With nothing to say it's
 * just there working - no button, and a click only makes it look up.
 *
 * The message is passed in as children from the server and stays in the
 * DOM while closed (hidden), so the sentence is still server-rendered text.
 */
export function DispatcherButton({
  mood,
  steam = false,
  children,
  className = "",
}: {
  mood: DispatcherMood;
  steam?: boolean;
  /** The message. Present = the "!" shows and the character opens it. */
  children?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const hasMessage = children != null && children !== false;

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

  const scene = <PixelReporter mood={mood} steam={steam} flag={hasMessage} decorative={hasMessage} className="w-full" />;

  return (
    <div ref={wrap} className={cx("relative w-[132px] shrink-0", className)}>
      {hasMessage ? (
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Hide your dispatcher's message" : "Your dispatcher has a message. Show it"}
          title="Your dispatcher has something to tell you"
          onClick={() => setOpen((v) => !v)}
          className={cx("block w-full rounded-lg", FOCUS_RING)}
        >
          {scene}
        </button>
      ) : (
        scene
      )}
      {hasMessage ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Message from your dispatcher"
          hidden={!open}
          className="dispatch-pop absolute right-0 top-full z-30 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface-2 p-5 shadow-2xl shadow-black/50"
        >
          <span className="dispatch-pop-tail" aria-hidden="true" />
          {children}
        </div>
      ) : null}
    </div>
  );
}
