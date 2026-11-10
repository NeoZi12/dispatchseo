import type { ReactNode } from "react";
import { DispatchMark } from "@/components/logo";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import { cx } from "@/components/ui/styles";
import { SetupStageShell } from "./stage";
import { BTN_PRIMARY, GithubMark, SceneCard, railFor } from "./primitives";
import s from "./stage.module.css";

// The repo picked at the GitHub step doesn't build the site: it's empty, or
// none of the files the live homepage serves are in it. Not a dead end: it
// is the GitHub step again, in the same stage as the rest of setup - the
// dispatcher above, the rail with GitHub lit, one card, one button. The card
// shows the why as a picture: the picked repo's road to the site is broken,
// the site's own repo carries the article through. Nothing has launched and
// nothing has been spent.

export function WrongRepo({ repo, domain, slug, empty, planStep = true }: { repo: string; domain: string; slug: string; empty: boolean; planStep?: boolean }) {
  const steps = railFor(planStep);
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
      <SetupStageShell scene="github" done={Math.max(0, steps.findIndex((x) => x.id === "github"))} steps={steps} say="Almost there. One repository to swap.">
        <SceneCard
          id="wrong-repo"
          title={<>Pick the repository {domain} is built from</>}
          lead={
            <>
              <span className="break-all font-medium text-ink">{repo}</span> {empty ? "is empty" : <>doesn&apos;t hold the files {domain} serves</>}, so articles added there would never reach your
              site. You don&apos;t need a new repo for DispatchSEO.
            </>
          }
          action={
            <>
              <a href={`/api/github/install/start?slug=${encodeURIComponent(slug)}`} className={cx(BTN_PRIMARY, "w-full sm:w-auto")}>
                <GithubMark />
                Pick the right repository
              </a>
              <p className="basis-full text-center">
                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-[14px] text-ink-faint underline decoration-line underline-offset-4 hover:text-ink">
                  Think this is wrong? Ask on Discord
                </a>
              </p>
            </>
          }
        >
          <RepoRoutes repo={repo} domain={domain} empty={empty} />
        </SceneCard>
      </SetupStageShell>
    </main>
  );
}

/** Two roads to the site, one above the other: the repo that was picked
 *  (broken road, the site stays bare) and the site's own repo (open road,
 *  an article riding it, the site live). */
function RepoRoutes({ repo, domain, empty }: { repo: string; domain: string; empty: boolean }) {
  return (
    <div role="group" aria-label="Where articles go" className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)_2rem_minmax(0,auto)] items-center gap-x-2 gap-y-3 rounded-2xl border border-line-soft bg-canvas/60 p-3.5 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,auto)] sm:gap-x-3 sm:gap-y-4 sm:p-5">
      <RepoTile icon={<RepoIcon />} name={repo} sub={empty ? "Empty" : "Different code"} />
      <Road open={false} />
      <SiteTile domain={domain} live={false} />
      <RepoTile lit icon={<GithubMark className="h-4 w-4" />} name="Your site's repo" sub="Already on GitHub" />
      <Road open />
      <SiteTile domain={domain} live />
    </div>
  );
}

function RepoTile({ icon, name, sub, lit = false }: { icon: ReactNode; name: string; sub: string; lit?: boolean }) {
  return (
    <div
      title={name}
      className={cx(
        "flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5",
        lit ? "border-[#8b5cf6]/45 bg-[#8b5cf6]/10 shadow-[0_0_24px_-8px_rgb(147_51_234/0.55)]" : "border-line-soft bg-surface-2",
      )}
    >
      <span aria-hidden="true" className={cx("hidden h-7 w-7 shrink-0 place-items-center rounded-lg sm:grid", lit ? "bg-[#8b5cf6]/20 text-ink" : "bg-surface-3 text-ink-faint")}>
        {icon}
      </span>
      <span className="min-w-0 text-left">
        <span className={cx("block truncate text-[13px] font-medium leading-tight sm:text-[13.5px]", lit ? "text-ink" : "text-ink-muted")}>{name}</span>
        <span className="mt-0.5 block truncate text-[12px] leading-tight text-ink-faint">{sub}</span>
      </span>
    </div>
  );
}

function SiteTile({ domain, live }: { domain: string; live: boolean }) {
  return (
    <div title={domain} className={cx("flex h-full min-w-0 max-w-[7rem] items-center gap-2 rounded-xl border border-line-soft bg-surface-2 px-2.5 py-2 sm:max-w-[12rem] sm:px-3 sm:py-2.5", live ? "" : "opacity-60")}>
      <svg viewBox="0 0 20 20" className="hidden h-4 w-4 shrink-0 text-ink-faint sm:block" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="10" cy="10" r="7.25" />
        <path d="M2.75 10h14.5M10 2.75c2 2.1 3 4.5 3 7.25s-1 5.15-3 7.25c-2-2.1-3-4.5-3-7.25s1-5.15 3-7.25Z" />
      </svg>
      <span className={cx("min-w-0 truncate text-[13px] font-medium sm:text-[13.5px]", live ? "text-ink" : "text-ink-muted")}>{domain}</span>
      {live ? (
        <span className="relative grid h-2 w-2 shrink-0 place-items-center">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok shadow-[0_0_8px_rgb(52_211_153/0.7)]" />
          <span className="sr-only">, articles live</span>
        </span>
      ) : (
        <span className="sr-only">, nothing arrives</span>
      )}
    </div>
  );
}

function Road({ open }: { open: boolean }) {
  return (
    <div className="relative h-6 w-full">
      {open ? (
        <>
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-[#6d28d9] to-[#9333ea]" />
          <svg aria-hidden="true" viewBox="0 0 8 10" className="absolute -right-0.5 top-1/2 h-2.5 w-2 -translate-y-1/2 text-[#9333ea]" fill="currentColor">
            <path d="M0 0l8 5-8 5z" />
          </svg>
          <span aria-hidden="true" className={s.travel}>
            <span className="block h-3 w-2.5 rounded-[2px] bg-ink shadow-[0_0_10px_rgb(168_85_247/0.85)]" />
          </span>
          <span className="sr-only">reaches</span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-line" />
          <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-ink-faint">
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </span>
          <span className="sr-only">doesn&apos;t reach</span>
        </>
      )}
    </div>
  );
}

function RepoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.71 1.71.75.75 0 0 1-1.07 1.05A2.5 2.5 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.71A2.5 2.5 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.09a.25.25 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
    </svg>
  );
}
