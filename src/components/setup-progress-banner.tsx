"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Cloud-only dashboard banner - the single honest progress surface for a fresh
// project (cloud has no self-host "Initial setup" cards; the whole story lives
// here). It carries two phases and then hides itself:
//   setup      - repo connected, pipeline still installing (pipeline_installed
//                false). "Setting up your site in the background."
//   firstData  - pipeline installed, but the first research + rank checks
//                haven't landed yet. "Running your first research…". These fire
//                automatically (onboarding/status first-run triggers), so the
//                copy promises the dashboard fills on its own.
//   done       - ideas queued AND a rank check exist -> the banner unmounts and
//                router.refresh() pulls the now-filled dashboard.
// It polls the same /api/onboarding/status the wizard finale uses. Hard
// failures ride the cron_runs -> banner + email rails already, so this stays a
// soft in-progress surface plus a gentle "taking longer than usual" nudge.

const SLOW_AFTER_MS = 20 * 60_000; // "usually 5-15 min" - nudge past 20

type Phase = "setup" | "firstData" | "done";

export function SetupProgressBanner({
  slug,
  repo,
  since,
  installed = false,
}: {
  slug: string;
  repo: string | null;
  since: string | null;
  installed?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(installed ? "firstData" : "setup");
  const [slow, setSlow] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/status?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const s = (await res.json()) as {
          pipeline_installed?: boolean;
          ideas_queued?: number;
          rank_checks?: number;
        };
        const dataLanded = (s.ideas_queued ?? 0) > 0 && (s.rank_checks ?? 0) > 0;
        if (!s.pipeline_installed) {
          setPhase("setup");
        } else if (!dataLanded) {
          setPhase("firstData");
        } else {
          setPhase("done");
          // Pull the now-filled dashboard once, then this banner is gone.
          if (!refreshed.current) {
            refreshed.current = true;
            setTimeout(() => router.refresh(), 1600);
          }
        }
      } catch {
        /* transient - next tick retries */
      }
    }
    void poll();
    const id = setInterval(poll, 8000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [slug, router]);

  // Soft nudge off a STABLE server timestamp (survives navigation): if the run
  // has been going well past the usual window, point the owner at it.
  useEffect(() => {
    if (!since) return;
    const elapsed = Date.now() - new Date(since).getTime();
    if (elapsed >= SLOW_AFTER_MS) {
      setSlow(true);
      return;
    }
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS - elapsed);
    return () => clearTimeout(id);
  }, [since]);

  if (phase === "done") return null;

  const isSetup = phase === "setup";
  return (
    <div className="border-b border-violet-500/25 bg-violet-500/[0.07] px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-neutral-200">
        {/* The whole strip links back to the setup screen so the owner can watch
            the live step-by-step checklist. Kept a sibling of the slow-nudge
            link below to avoid nesting anchors. */}
        <Link href="/onboarding" className="group flex flex-1 items-center gap-2.5 hover:text-white">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-violet-400/40 border-t-violet-300" aria-hidden />
          <span>
            {isSetup ? (
              <>
                <b className="font-semibold text-white">Setting up your site in the background.</b>{" "}
                This runs on GitHub and usually takes 5–15 minutes — feel free to look around; your
                data fills in automatically once it&apos;s done.
              </>
            ) : (
              <>
                <b className="font-semibold text-white">
                  Running your first research and rank checks.
                </b>{" "}
                Your dashboard fills in on its own, usually within 10–20 minutes — nothing for you to
                do.
              </>
            )}{" "}
            <span className="whitespace-nowrap font-medium text-violet-300 underline-offset-2 group-hover:underline">
              See what&apos;s happening →
            </span>
          </span>
        </Link>
        {slow ? (
          <span className="text-amber-200/90">
            Taking longer than usual —{" "}
            {repo ? (
              <a
                href={`https://github.com/${repo}/actions`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-amber-100"
              >
                check the run in your repo&apos;s Actions
              </a>
            ) : (
              "check the run in your repo's Actions tab"
            )}
            .
          </span>
        ) : null}
      </div>
    </div>
  );
}
