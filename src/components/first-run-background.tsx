"use client";

import { useEffect, useRef, useState } from "react";

// Home's "working in the background" strip. The wizard tracks only the
// OWNER'S actions; the machine work it kicks off (first keyword research,
// first rank check) lands here instead - a self-hiding status line so the
// owner knows the quiet queue means "running", not "broken". Polling the
// status endpoint also keeps its first-run triggers firing after the
// wizard closes (it self-starts the first rank/GSC runs when possible).

type Status = {
  pipeline_installed: boolean;
  research_overdue: boolean;
  ideas_queued: number;
  keywords_tracked: number;
  rank_checks: number;
};

export function FirstRunBackground({ slug, cloud = false }: { slug: string; cloud?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const settled = Boolean(status && status.ideas_queued > 0 && status.rank_checks > 0);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/status?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (res.ok && !stopped) setStatus((await res.json()) as Status);
      } catch {
        /* transient - next tick retries */
      }
    }
    void poll();
    timer.current = setInterval(poll, 15000);
    return () => {
      stopped = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [slug]);

  useEffect(() => {
    if (settled && timer.current) clearInterval(timer.current);
  }, [settled]);

  if (!status || !status.pipeline_installed || settled) return null;

  // Honesty fallback: the strip's promise is backed by the install's
  // kick-off-research step. If the queue is still empty long past that,
  // stop claiming "nothing to do" and hand the owner the one command that
  // unblocks it - the same story the agent's rescue path uses.
  if (status.ideas_queued === 0 && status.research_overdue) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
        {cloud ? (
          // Cloud is hands-off: research runs on the schedule via GitHub
          // Actions, there is no command to paste. Say so honestly instead of
          // handing a self-host rescue command that doesn't apply here.
          <p className="text-sm text-amber-100/90">
            <b className="font-medium text-amber-200">Your first keyword research hasn&apos;t run yet.</b>{" "}
            On your plan it runs automatically on the schedule - nothing to paste. Ideas land here as
            soon as it does.
          </p>
        ) : (
          <p className="text-sm text-amber-100/90">
            <b className="font-medium text-amber-200">The first keyword research hasn&apos;t landed.</b>{" "}
            Paste{" "}
            <code className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[13px] text-neutral-200">
              /seo-research
            </code>{" "}
            into Claude Code (in your site&apos;s repo) to run it now - ideas show up here in
            about 10-20 minutes.
          </p>
        )}
      </div>
    );
  }

  const line =
    status.ideas_queued === 0
      ? "Researching keywords - your queue fills in about 10-20 minutes"
      : status.keywords_tracked > 0
        ? "Running your first rank check"
        : "First rank check starts once research picks keywords";

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <span
        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200"
        aria-hidden
      />
      <p className="text-sm text-neutral-300">
        <b className="font-medium text-neutral-100">Working in the background:</b> {line}. Nothing
        for you to do - this line disappears on its own.
      </p>
    </div>
  );
}
