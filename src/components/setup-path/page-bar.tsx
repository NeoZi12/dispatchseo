"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SetupStep } from "@/lib/setup-path-core";

// <SetupPageBar>: the setup path on every dashboard page EXCEPT Home. One
// line, "Your next step: {title} →", linking to Home, where the hero card
// holds the step itself. Replaces SetupProgressBanner on cloud (self-host
// keeps the banner). Hidden on /dashboard, where the hero is already the
// first thing on the page.
//
// A connect-phase step (a second site added mid-setup [R20]) points at the
// full-screen path instead: "Finish setting up {domain} →".

export type SetupPageBarStep = Pick<SetupStep, "id" | "kind" | "phase" | "title">;

export function SetupPageBar({ step, domain }: { step: SetupPageBarStep; domain: string }) {
  const pathname = usePathname();
  if (pathname === "/dashboard" || step.id === "complete") return null;

  const connect = step.phase === "connect";
  const wait = step.kind === "wait";
  return (
    <div className="border-b border-violet-500/25 bg-violet-500/[0.07] px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center text-sm text-neutral-200">
        <Link
          href={connect ? "/onboarding" : "/dashboard"}
          className="group flex min-w-0 flex-1 items-center gap-2.5 hover:text-white"
        >
          {wait && !connect ? (
            <span
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-violet-400/40 border-t-violet-300"
              aria-hidden
            />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400" aria-hidden />
          )}
          {/* One line on every width: the title truncates with an ellipsis,
              the arrow stays outside the truncation so it never gets cut. */}
          <span className="min-w-0 truncate">
            {connect ? (
              <b className="font-semibold text-white">Finish setting up {domain}</b>
            ) : (
              <>
                <span className="text-neutral-400">Your next step:</span>{" "}
                <b className="font-semibold text-white">{step.title}</b>
              </>
            )}
          </span>
          <span className="-ml-1 shrink-0 font-medium text-violet-300 underline-offset-2 group-hover:underline" aria-hidden>
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
