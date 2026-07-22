"use client";

import { useEffect, useRef, useState } from "react";

// The onboarding wizard's live finale. Renders under the install command
// and polls /api/onboarding/status while the agent runs it: repo connection
// flips green when the canary/pipeline report in, the playbook row when the
// agent writes the site profile (setup chains off the same paste - there is
// deliberately ONE command for the owner), and the merge-PR link appears
// the moment that click is the owner's blocking move. The wizard is "done"
// when the verified install stamp lands - background first-data work shows
// on Home's strip instead.

type Status = {
  repo_connected: boolean;
  canary_ok: boolean | null;
  canary_error: string | null;
  pipeline_installed: boolean;
  open_pr: { url: string; title: string } | null;
  profile_written: boolean;
  ideas_queued: number;
  keywords_tracked: number;
  rank_checks: number;
  gsc_rows: number;
  pages_known: number;
  is_docker: boolean;
  builder_last_seen_at: string | null;
};

function Row({
  state,
  label,
  detail,
}: {
  state: "done" | "active" | "pending" | "error";
  label: React.ReactNode;
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // "Done" = every step the OWNER owns is done. The install stamp only
  // lands after the backend verified the whole checklist - setup/profile
  // included - so it is the single gate. Background work (first research,
  // rank checks, GSC data) deliberately doesn't gate this - it shows on
  // Home's "working in the background" strip instead.
  const done = Boolean(status?.pipeline_installed);

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
                : "Waiting for the install paste to run in Claude Code…"
          }
          detail={s?.canary_error}
        />
        <Row
          state={s?.pipeline_installed ? "done" : s?.repo_connected || s?.open_pr ? "active" : "pending"}
          label={
            s?.pipeline_installed ? (
              "Automation pipeline installed"
            ) : s?.open_pr ? (
              <>
                <b className="font-semibold text-neutral-100">Your move:</b>{" "}
                <a
                  href={s.open_pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                >
                  merge the pipeline PR
                </a>{" "}
                - the install finishes the moment it merges
              </>
            ) : (
              "Installing the automation pipeline (your agent opens a PR for you to merge)"
            )
          }
        />
        <Row
          state={
            s?.profile_written
              ? "done"
              : s?.repo_connected || s?.open_pr
                ? "active"
                : "pending"
          }
          label={
            s?.profile_written
              ? "Backlink playbook personalized"
              : "Personalizing the backlink playbook (same paste - your agent handles it)"
          }
        />
        {/* Docker installs only: the builder is what makes builds automatic,
            and an unlocked dashboard with a dead builder is the silent
            failure this row exists to prevent. Green = it has polled the
            backend at least once. */}
        {s?.is_docker ? (
          <Row
            state={s.builder_last_seen_at ? "done" : "pending"}
            label={
              s.builder_last_seen_at
                ? "Builder connected - automatic builds are on"
                : "Builder hasn't checked in - paste the token step below (it polls every 10 minutes, so green can take a few)"
            }
          />
        ) : null}
      </ul>
      <div className="border-t border-neutral-800 py-3">
        {done ? (
          <a
            href="/dashboard"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-neutral-950"
          >
            Setup complete - open your dashboard →
          </a>
        ) : (
          <p className="text-sm text-neutral-500">
            This page updates itself - your agent&apos;s chat shows what it&apos;s doing, and
            anything that needs YOU appears above with a link.
          </p>
        )}
      </div>
    </div>
  );
}
