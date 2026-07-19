"use client";

// The trend radar's scanning experience. A scan is fire-and-forget: the
// dispatch answer is instant but the CI run lands topics 3-6 minutes later,
// so three pieces must agree on one "scanning" state - the Scan now button,
// the radar-sweep banner, and the poller that refreshes the page until the
// run reports back. The server derives scanning from trend_scan_requested_at
// vs last_trend_scan_at (trends/page.tsx) and passes it down; the button adds
// an optimistic flip so it reads "Scanning..." the instant the dispatch
// succeeds, before the server prop catches up.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerTrendScan } from "@/app/actions";

// Scan now / Requesting... / Scanning... - the last one is a state, not a
// button: nothing to click while the run is out. Refusals (cooldown, missing
// repo) show in amber next to the button so a "no" is never mistaken for
// "nothing happened".
export function TrendScanButton({ scanning = false }: { scanning?: boolean }) {
  const [pending, start] = useTransition();
  const [fired, setFired] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Once the server confirms the scan (prop flips true), the optimistic flag
  // has done its job - drop it so the button re-arms when the scan completes.
  useEffect(() => {
    if (scanning) setFired(false);
  }, [scanning]);

  if (scanning || fired) {
    return (
      <span
        aria-live="polite"
        className="animate-pulse whitespace-nowrap rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 [animation-duration:2.5s] motion-reduce:animate-none"
      >
        Scanning...
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {msg ? <span className="max-w-xs text-right text-sm text-amber-300">{msg}</span> : null}
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await triggerTrendScan();
            if (r.ok) {
              setMsg(null);
              setFired(true);
            } else {
              setMsg(r.message);
            }
          })
        }
        className="whitespace-nowrap rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50"
      >
        {pending ? "Requesting..." : "Scan now"}
      </button>
    </span>
  );
}

// The "a scan is out" banner for the radar section: a small CSS-only radar
// scope (rotating sweep, pinging blips) beside copy that manages the 3-6
// minute wait. Sits above the existing topic cards - a scan adds to the
// radar, it doesn't replace it. Reduced motion freezes the beam.
export function TrendScanSweep() {
  return (
    <div
      role="status"
      className="flex items-center gap-4 rounded-xl border border-emerald-500/15 bg-neutral-900 p-4 sm:p-5"
    >
      <style>{`@keyframes radar-sweep{to{transform:rotate(360deg)}}`}</style>
      <div
        aria-hidden="true"
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-emerald-500/25 bg-neutral-950"
      >
        <div className="absolute inset-[14%] rounded-full border border-emerald-500/15" />
        <div className="absolute inset-[32%] rounded-full border border-emerald-500/15" />
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-500/10" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-emerald-500/10" />
        <div
          className="absolute inset-0 animate-[radar-sweep_2.8s_linear_infinite] motion-reduce:animate-none"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(52,211,153,0.45), rgba(52,211,153,0.06) 55deg, transparent 90deg)",
          }}
        />
        <span className="absolute left-[30%] top-[34%] h-1 w-1 animate-ping rounded-full bg-emerald-400 [animation-duration:2.8s] motion-reduce:animate-none" />
        <span className="absolute left-[64%] top-[56%] h-1 w-1 animate-ping rounded-full bg-emerald-400 [animation-delay:1.4s] [animation-duration:2.8s] motion-reduce:animate-none" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-emerald-300">Sweeping your niche</p>
        <p className="text-sm text-neutral-400">
          Launches, Reddit and Hacker News buzz, Google Trends. Takes a few minutes - new
          subjects land here on their own.
        </p>
      </div>
    </div>
  );
}

// While a scan is out, re-render the server page every 10s so fresh topics
// appear without a manual reload. Renders nothing; stops when the server
// flips scanning off or the page unmounts.
export function TrendScanPoller({ scanning }: { scanning: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!scanning) return;
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [scanning, router]);
  return null;
}
