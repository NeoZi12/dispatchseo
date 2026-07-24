"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Cloud-only dashboard banner. The gate (onboarding-gate.ts) already unlocks
// the dashboard the moment a repo is connected, so a cloud owner can look
// around while the background setup run personalizes their site. This strip is
// what makes that honest: it says the site is still being set up, keeps the
// half-filled dashboard from reading as broken, and quietly refreshes to full
// once the run stamps pipeline_installed_at.
//
// It polls the same /api/onboarding/status the wizard finale uses. Hard
// failures are NOT this banner's job - a failed seo-setup run reports fail=
// to the dashboard's cron_runs -> red banner + email rails already, so this
// stays a soft "in progress / done" surface plus a gentle "taking longer than
// usual" nudge once the run overshoots the normal window.

const SLOW_AFTER_MS = 20 * 60_000; // "usually 5-15 min" - nudge past 20

export function SetupProgressBanner({
  slug,
  repo,
  since,
}: {
  slug: string;
  repo: string | null;
  since: string | null;
}) {
  const router = useRouter();
  const [installed, setInstalled] = useState(false);
  const [slow, setSlow] = useState(false);
  const settled = useRef(false);

  // Poll for completion; on the flip, paint the "done" state briefly then pull
  // fresh server data - which re-renders the layout with pipeline_installed_at
  // set, so this banner unmounts on its own.
  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/status?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (!res.ok || stopped) return;
        const s = (await res.json()) as { pipeline_installed?: boolean };
        if (s.pipeline_installed && !settled.current) {
          settled.current = true;
          setInstalled(true);
          setTimeout(() => router.refresh(), 1600);
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

  // Soft nudge off a STABLE server timestamp (survives page navigation, unlike
  // a mount-relative timer): if the run has been going well past the usual
  // window, point the owner at the run itself.
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

  if (installed) {
    return (
      <div className="border-b border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-2.5 sm:px-6">
        <p className="mx-auto flex max-w-6xl items-center gap-2.5 text-sm text-emerald-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden>
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <b className="font-semibold">Your site is fully set up.</b> Loading everything now…
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-violet-500/25 bg-violet-500/[0.07] px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-neutral-200">
        {/* The whole strip links back to the setup screen so the owner can watch
            the live step-by-step checklist ("exactly what's going on") instead
            of only this one-line summary. Kept as a sibling of the slow-nudge
            link below to avoid nesting anchors. */}
        <Link href="/onboarding" className="group flex flex-1 items-center gap-2.5 hover:text-white">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-violet-400/40 border-t-violet-300" aria-hidden />
          <span>
            <b className="font-semibold text-white">Setting up your site in the background.</b> This
            runs on GitHub and usually takes 5–15 minutes — feel free to look around; your data fills
            in automatically once it&apos;s done.{" "}
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
