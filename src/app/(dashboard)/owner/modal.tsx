"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { cx, FOCUS_RING } from "@/components/ui/styles";

// The pop-up a customer opens in from any /owner list (owner, 2026-11-09:
// "a pop-up that I can click outside of to just go back"). A native
// <dialog>: Escape and a click on the dimmed backdrop both close it, and
// closing is simply going back in history, because the pop-up IS the
// /owner/customers/<id> route rendered through the @modal slot.
export function Modal({ label, children }: { label: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    router.back();
  };

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={close}
      onClick={(e) => {
        // The dialog box is the whole viewport; its own surface is the backdrop.
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto bg-transparent p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-[2px]"
    >
      <div className="mx-auto my-3 w-[min(1180px,calc(100vw-1.5rem))] sm:my-8">
        <div className="relative rounded-2xl border border-line-soft bg-canvas px-4 pb-6 pt-12 shadow-2xl sm:px-7 sm:pb-8">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={cx("absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-[18px] leading-none text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink", FOCUS_RING)}
          >
            ×
          </button>
          {children}
        </div>
      </div>
    </dialog>
  );
}
