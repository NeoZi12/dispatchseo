import { DispatchMark } from "@/components/logo";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import type { PublishRouteReason } from "@/lib/publish-route-check";
import { SetupStageShell } from "./stage";
import { BTN_PRIMARY, SceneCard, railFor } from "./primitives";
import { Road, RepoTile, SiteTile } from "./wrong-repo";

// The site can't take our articles, found at the last setup step
// (lib/publish-route-check.ts): its repo is the right one, but there is no
// way for us to put a blog on it by ourselves. Same stage as the rest of
// setup - the dispatcher above, the rail at GitHub, one card - and the card
// says it plainly: we can't, why in one sentence, and that nothing started.
// Nothing has launched and nothing has been spent.

//
// One reason is different: a Lovable project on Lovable's older setup. That
// one the owner can clear themselves - Lovable upgrades the project in place
// - so its card says how and offers the way back in (the check runs again on
// every visit to /onboarding).
const LOVABLE_UPGRADE_DOCS = "https://docs.lovable.dev/features/upgrade-to-tanstack-start";

const WHY: Record<Exclude<PublishRouteReason, "lovable-legacy">, (domain: string) => string> = {
  "no-forwarding-rule": () => "Your site's host doesn't let us add the blog for you.",
  "static-export": (domain) => `${domain} is built as plain pages with nothing running behind them, so there's nowhere for us to add a blog.`,
  "ambiguous-monorepo": (domain) => `Your repository holds more than one website, and we can't tell which one is ${domain}.`,
};

export function CantPublish({ domain, reason, planStep = true }: { domain: string; reason: PublishRouteReason; planStep?: boolean }) {
  const steps = railFor(planStep);
  const upgrade = reason === "lovable-legacy";
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-5 sm:px-6">
        <a href="/?home=1" className="flex items-center gap-2.5 text-[16px] font-semibold text-ink transition-opacity hover:opacity-80">
          <DispatchMark className="h-6 w-auto" />
          DispatchSEO
        </a>
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-faint hover:text-ink">
          <DiscordMark className="size-4 shrink-0" />
          <span className="hidden sm:inline">Ask on Discord</span>
          <span className="sr-only sm:hidden">Ask on Discord</span>
        </a>
      </header>
      <SetupStageShell scene="github" done={Math.max(0, steps.findIndex((x) => x.id === "github"))} steps={steps} say={upgrade ? "Almost. Your Lovable project needs one upgrade first." : "I looked at your site. This is one I can't publish to."}>
        <SceneCard
          id="cant-publish"
          title={upgrade ? <>Upgrade your Lovable project first</> : <>We can&apos;t publish to {domain}</>}
          lead={
            upgrade ? (
              <>
                {domain} runs on Lovable&apos;s older setup, which can&apos;t show a blog we add. In Lovable, open your project&apos;s settings, choose &ldquo;Migrate to TanStack Start&rdquo; under
                Project actions, and press Publish when it finishes. Lovable charges credits for the upgrade (
                <a href={LOVABLE_UPGRADE_DOCS} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line underline-offset-4">
                  how it works
                </a>
                ). Nothing was set up here yet.
              </>
            ) : (
              <>
                {WHY[reason](domain)} Nothing was set up, and nothing will run.
              </>
            )
          }
          action={
            upgrade ? (
              <a href="/onboarding" className={BTN_PRIMARY}>
                I&apos;ve upgraded it, check again
              </a>
            ) : (
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-[14px] text-ink-faint underline decoration-line underline-offset-4 hover:text-ink">
                Think this is wrong? Ask on Discord
              </a>
            )
          }
        >
          <div role="group" aria-label="Where articles go" className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)_2rem_minmax(0,auto)] items-center gap-x-2 rounded-2xl border border-line-soft bg-canvas/60 p-3.5 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,auto)] sm:gap-x-3 sm:p-5">
            <RepoTile lit icon={<ArticleIcon />} name="Your articles" sub={upgrade ? "Waiting for the upgrade" : "Nowhere to land"} />
            <Road open={false} />
            <SiteTile domain={domain} live={false} />
          </div>
        </SceneCard>
      </SetupStageShell>
    </main>
  );
}

function ArticleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M4 1.75h5.5L12.25 4.5v9.75H4z" />
      <path d="M6 7.25h4M6 9.75h4M6 12.25h2.5" />
    </svg>
  );
}
