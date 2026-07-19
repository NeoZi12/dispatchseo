"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProjectMode } from "@/app/actions";

// Header publish-mode switch, top right of the topbar. Semi = the owner
// approves researched ideas and merges PRs; Auto = fully hands-off; Custom
// appears (display-only) when the Automations page toggles match neither
// preset. Switching DOWN to semi is instant (de-escalating trust should never
// need a dialog); switching UP to auto asks for one confirmation, because
// from that moment content publishes to the live site without a human.
export function ModeSwitch({ mode }: { mode: "semi" | "auto" | "custom" }) {
  const [confirming, setConfirming] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  // Optimistic: the pill flips the instant a switch is chosen; the persist +
  // refresh run behind it. Cleared when the server prop catches up, rolled
  // back with a quiet error line if the write fails.
  const [optimistic, setOptimistic] = useState<"semi" | "auto" | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setOptimistic(null);
  }, [mode]);
  const shown = optimistic ?? mode;

  useEffect(() => {
    if (!confirming) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setConfirming(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [confirming]);

  function apply(next: "semi" | "auto") {
    setConfirming(false);
    setOptimistic(next); // flip the pill now
    setFailed(false);
    startTransition(async () => {
      try {
        await setProjectMode(next);
        router.refresh();
      } catch {
        setOptimistic(null); // roll back to the real mode
        setFailed(true);
      }
    });
  }

  function requestSwitch(next: "semi" | "auto") {
    if (next === shown) return;
    if (next === "auto") setConfirming(true);
    else apply("semi");
  }

  const segment = (value: "semi" | "auto", label: string, dot: string) => {
    const active = shown === value;
    return (
      <button
        type="button"
        onClick={() => requestSwitch(value)}
        aria-pressed={active}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
          active
            ? "bg-neutral-800 font-medium text-white"
            : "text-neutral-500 hover:text-neutral-300"
        }`}
      >
        {active && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </button>
    );
  };

  return (
    <div ref={ref} className="relative">
      <div
        role="group"
        aria-label="Publish mode"
        title={
          shown === "auto"
            ? "Automatic: research, builds, and merges are fully hands-off"
            : shown === "semi"
              ? "Semi-automatic: you approve researched ideas and merge PRs"
              : "Custom: your own mix - set per automation on the Automations page"
        }
        className="flex items-center rounded-full border border-neutral-800 bg-neutral-900/80 p-0.5"
      >
        {segment("semi", "Semi", "bg-amber-400")}
        {segment("auto", "Auto", "bg-emerald-400")}
        {shown === "custom" && (
          <span className="flex items-center gap-1.5 rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Custom
          </span>
        )}
      </div>

      {confirming && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-xl shadow-black/40">
          <p className="text-sm font-medium text-white">Go fully automatic?</p>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
            Researched ideas are approved for you, and every guide or validated
            tool that passes its checks merges and publishes to the live site
            without you touching it.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-2.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => apply("auto")}
              className="rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
            >
              Switch to Auto
            </button>
          </div>
        </div>
      )}

      {failed ? (
        <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-[11px] text-red-400">
          Couldn&apos;t switch - try again
        </p>
      ) : null}
    </div>
  );
}
