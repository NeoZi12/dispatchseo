"use client";

import { useEffect, useRef, useState } from "react";

// The onboarding wizard's live finale. Renders under the setup command and
// polls /api/onboarding/status while the owner runs it in their terminal:
// repo connection flips green when the canary/pipeline report in, then the
// first-data counters fill as research queues ideas and the first rank
// check / GSC snapshot land (the status endpoint triggers those runs
// itself the moment they become possible). The wizard is "done" when the
// dashboard genuinely has something on it - not when the copy runs out.

type Status = {
  repo_connected: boolean;
  canary_ok: boolean | null;
  canary_error: string | null;
  pipeline_installed: boolean;
  ideas_queued: number;
  keywords_tracked: number;
  rank_checks: number;
  gsc_rows: number;
  pages_known: number;
};

function Row({
  state,
  label,
  detail,
}: {
  state: "done" | "active" | "pending" | "error";
  label: string;
  detail?: string | null;
}) {
  return (
    <li className="flex items-start gap-2.5 border-b border-neutral-800 py-2.5 text-sm last:border-b-0">
      {state === "done" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden>
          <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : state === "error" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
        </svg>
      ) : state === "active" ? (
        <span className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200" aria-hidden />
      ) : (
        <span className="mt-1.5 h-2 w-2 shrink-0 translate-x-1 rounded-full bg-neutral-700" aria-hidden />
      )}
      <span className={state === "pending" ? "text-neutral-500" : "text-neutral-300"}>
        {label}
        {detail ? <span className="block text-[13px] text-neutral-500">{detail}</span> : null}
      </span>
    </li>
  );
}

export function FirstRunStatus({ slug }: { slug: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [startedAt] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const done = Boolean(
    status && status.pipeline_installed && status.canary_ok && status.ideas_queued > 0,
  );

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/status?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (res.ok && !stopped) setStatus((await res.json()) as Status);
      } catch {
        /* transient poll failure - next tick retries */
      }
    }
    void poll();
    timer.current = setInterval(poll, 6000);
    return () => {
      stopped = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [slug]);

  useEffect(() => {
    if (done && timer.current) clearInterval(timer.current);
  }, [done]);

  const s = status;
  const waitedMinutes = Math.floor((Date.now() - startedAt) / 60000);

  return (
    <div className="mt-4 rounded-xl bg-neutral-900 px-4 py-1.5">
      <ul>
        <Row
          state={
            s?.canary_ok === false
              ? "error"
              : s?.canary_ok || s?.pipeline_installed
                ? "done"
                : "active"
          }
          label={
            s?.canary_ok === false
              ? "Repo check failed"
              : s?.canary_ok || s?.pipeline_installed
                ? "Repo connected - PR machinery proven"
                : "Waiting for the setup command to run in your terminal…"
          }
          detail={s?.canary_error}
        />
        <Row
          state={s?.pipeline_installed ? "done" : s?.repo_connected ? "active" : "pending"}
          label={
            s?.pipeline_installed
              ? "Automation pipeline installed"
              : "Installing the automation pipeline (your agent opens a PR)"
          }
        />
        <Row
          state={s && s.ideas_queued > 0 ? "done" : s?.pipeline_installed ? "active" : "pending"}
          label={
            s && s.ideas_queued > 0
              ? `First research done - ${s.ideas_queued} content ideas queued`
              : "First keyword research (fills your queue, ~10-20 min)"
          }
        />
        <Row
          state={s && s.rank_checks > 0 ? "done" : s && s.keywords_tracked > 0 ? "active" : "pending"}
          label={
            s && s.rank_checks > 0
              ? `First rank check done - ${s.keywords_tracked} keywords tracked`
              : s && s.keywords_tracked > 0
                ? "Running your first rank check…"
                : "First rank check (starts once research picks keywords)"
          }
        />
        <Row
          state={s && s.gsc_rows > 0 ? "done" : "pending"}
          label={
            s && s.gsc_rows > 0
              ? "Search Console data flowing"
              : "Search Console data (arrives once Google grants the access you added)"
          }
        />
      </ul>
      <div className="border-t border-neutral-800 py-3">
        {done ? (
          <a
            href="/dashboard"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-neutral-950"
          >
            Everything&apos;s running - open your dashboard →
          </a>
        ) : (
          <p className="text-[13px] text-neutral-500">
            {waitedMinutes >= 3
              ? "Taking a while? That's normal for the research step. You can open the dashboard now - it fills in live as the runs finish."
              : "This page updates itself - leave it open while the command runs."}{" "}
            <a href="/dashboard" className="text-neutral-400 underline">
              Open dashboard anyway
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
