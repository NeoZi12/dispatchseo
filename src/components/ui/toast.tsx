"use client";

import { useEffect, useState } from "react";
import type { ActionState } from "./action-state";
import { cx } from "./styles";

/** The result of a server action, said next to the button that caused it.
 *  Announced politely to screen readers; a success fades after a few
 *  seconds, an error stays until the next attempt (it has to be read). */
export function Toast({ state, className = "" }: { state: ActionState; className?: string }) {
  const [visibleAt, setVisibleAt] = useState<number | null>(state?.at ?? null);
  useEffect(() => {
    if (!state) return;
    setVisibleAt(state.at);
    if (!state.ok) return;
    const t = setTimeout(() => setVisibleAt(null), 4000);
    return () => clearTimeout(t);
  }, [state]);

  const show = state && visibleAt === state.at;
  return (
    <p role="status" aria-live="polite" className={cx("min-h-5 text-[13px]", className)}>
      {show ? (
        <span key={state.at} className={cx("dispatch-fade-in inline-flex items-start gap-1.5", state.ok ? "text-ok" : "text-danger")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true">
            {state.ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 7v6M12 17h.01" />}
          </svg>
          <span>{state.message}</span>
        </span>
      ) : null}
    </p>
  );
}
