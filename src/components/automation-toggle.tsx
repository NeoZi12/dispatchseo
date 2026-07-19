"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAutomationToggle } from "@/app/actions";
import type { AutomationFlags } from "@/lib/projects";

// The on/off switch on a toggleable automation card. Flipping one recomputes
// the project's mode label: match a preset and the topbar says Semi or Auto,
// anything else says Custom.
//
// The knob moves optimistically the instant you click - the server round-trip
// (persist + router.refresh to recompute the topbar label) runs behind it, so
// the switch never sits there for a couple of seconds looking stuck. If the
// write fails we snap back to the real state.
export function AutomationToggle({
  flag,
  enabled,
}: {
  flag: keyof AutomationFlags;
  enabled: boolean;
}) {
  const [, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const router = useRouter();

  // Reconcile with the authoritative server value once fresh props land (after
  // router.refresh, or if another surface changed the flag).
  useEffect(() => {
    setOn(enabled);
  }, [enabled]);

  // No pending guard: flipping again mid-save just fires another write -
  // last one wins, refresh reconciles. A dead switch feels broken.
  function flip() {
    const next = !on;
    setOn(next); // move the knob now
    startTransition(async () => {
      try {
        await setAutomationToggle(flag, next);
        router.refresh();
      } catch {
        setOn(!next); // write failed - put it back
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={flip}
      className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
        on ? "bg-emerald-500/80" : "bg-neutral-700"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
