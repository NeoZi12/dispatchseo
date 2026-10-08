import Link from "next/link";
import type { SetupStep } from "@/lib/setup-path-core";
import type { WordPressStatus } from "@/components/wordpress-connect";
import { SetupStepCard } from "./step-card";

// <SetupHero>: the setup path on Home. The ONE next action for the launch and
// first-article phases, rendered above the dispatcher's briefing until the
// first article is live and nothing is parked (Home stops mounting it when
// the engine says `complete`).
//
// A connect-phase step never renders here [R20]: the onboarding gate is
// account-level, so an owner adding a SECOND site reaches Home while that
// site is still mid-connect. Its steps belong on the full-screen path, so the
// hero is one line pointing there instead.

export type SetupHeroProps = {
  step: SetupStep;
  slug: string;
  domain: string;
  origin: string;
  agentId?: string | null;
  token?: string | null;
  wp?: WordPressStatus | null;
  repos?: string[] | null;
  gscSites?: string[] | null;
  gscSiteUrl?: string | null;
  /** Callback flags off /dashboard's URL: the GitHub App install callback
   *  (forwarded from /onboarding) and the Google OAuth callback
   *  (returnTo=dashboard). */
  ghFlag?: string | null;
  ghError?: string | null;
  gscFlag?: string | null;
  serverNow?: number;
};

export function SetupHero(props: SetupHeroProps) {
  const { step } = props;
  if (step.phase === "connect") {
    return (
      <Link
        href="/onboarding"
        className="group flex items-center gap-2.5 rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-4 py-3 text-sm text-neutral-200 transition-colors hover:border-violet-500/40 hover:text-white"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400" aria-hidden />
        <span className="min-w-0 flex-1">
          <b className="break-words font-semibold text-white">Finish setting up {props.domain}</b>{" "}
          <span className="whitespace-nowrap font-medium text-violet-300 underline-offset-2 group-hover:underline">
            →
          </span>
        </span>
      </Link>
    );
  }
  return (
    <SetupStepCard
      step={step}
      mode="hero"
      slug={props.slug}
      origin={props.origin}
      agentId={props.agentId ?? null}
      token={props.token ?? null}
      wp={props.wp ?? null}
      repos={props.repos ?? null}
      gscSites={props.gscSites ?? null}
      gscSiteUrl={props.gscSiteUrl ?? null}
      ghFlag={props.ghFlag ?? null}
      ghError={props.ghError ?? null}
      gscFlag={props.gscFlag ?? null}
      serverNow={props.serverNow}
    />
  );
}
