"use client";

import { PixelReporter } from "@/components/pixel-dispatcher";
import { cx } from "@/components/ui/styles";
import { BTN_PRIMARY, BTN_QUIET, Check, StepRow, type StepState } from "./primitives";
import { FrameStrip } from "./strip";
import { SHOTS } from "./shot";
import s from "./stage.module.css";

// Home in its first state, from the moment setup finishes until the first
// article is live: the site work first (the blog switched on, Google's
// confirmation - nothing touches their site before the card), then the
// article. Not a separate page - the same card shows on EVERY dashboard page
// in place of its content until that first article is live, so nothing is
// ever half-unlocked. Setup asked for everything once; this never asks.

/** A step that cannot finish by itself, and the one thing that unblocks it.
 *  The step keeps its spinner ("doing"): it resumes the moment this clears. */
export type StuckNote = { text: string; href?: string | null; linkLabel?: string | null };
export type ProgressStep = "blog" | "google" | "reading" | "topics" | "writing" | "publishing";

export type FirstArticleProgress = {
  /** Switching on /blog (or checking the existing one) - one small change
   *  to the site, after setup finished, never before. */
  blog: StepState;
  /** Google confirming the site is theirs; null when it already was. */
  google: StepState | null;
  reading: StepState;
  topics: StepState;
  writing: StepState;
  publishing: StepState;
  /** How many measured keywords research found, once it has. */
  keywordsFound?: number | null;
  /** The chosen topic, once the writer has it. */
  topic?: string | null;
  /** The live URL, once published. */
  liveUrl?: string | null;
  /** Steps waiting on something only the owner (or Google) can do. */
  stuck?: Partial<Record<ProgressStep, StuckNote>> | null;
  /** The one thing standing between a WRITTEN article and the site, when
   *  only the owner can clear it. Shown as its own card above the steps.
   *  "repo": the connected repository is empty or isn't the site's code
   *  (repo-site-check.ts); `href` starts GitHub's repo picker, and on the way
   *  back we find the right repo ourselves and publish the waiting article. */
  blocker?: { kind: "repo"; repo: string; empty: boolean; domain: string; href: string; topic: string | null } | null;
};

function StuckDetail({ note }: { note: StuckNote }) {
  return (
    <>
      {note.text}
      {note.href ? (
        <>
          {" "}
          <a href={note.href} target={/^https?:/.test(note.href) ? "_blank" : undefined} rel="noreferrer" className="font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
            {note.linkLabel ?? "Open it"}
          </a>
        </>
      ) : null}
    </>
  );
}

type RepoBlocker = Extract<NonNullable<FirstArticleProgress["blocker"]>, { kind: "repo" }>;

/** The connected repository can't carry the article to the site (empty, or
 *  not the site's code). The article is written and held; this card is the
 *  only place the owner hears about it (we never email a fix-it), so it sits
 *  above everything, says it once, and offers the one way out. */
function RepoBlockerCard({ b }: { b: RepoBlocker }) {
  const steps = ["Pick your site\u2019s repo on GitHub", "Come back here", "Your article goes live"];
  return (
    <section
      aria-labelledby="repo-blocker-title"
      className={cx("relative mb-4 overflow-hidden rounded-3xl border border-[#8b5cf6]/25 bg-surface px-6 py-7 sm:px-8 sm:py-8", s.sceneIn)}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_0%,rgb(139_92_246/0.13),transparent_60%),radial-gradient(60%_60%_at_100%_100%,rgb(251_191_36/0.05),transparent_70%)]" />
      <div className="relative">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 19.5V5a2 2 0 0 1 2-2h11.5v14H7a2 2 0 0 0-2 2.5Zm0 0A2 2 0 0 0 7 21h11.5v-4" />
              <path d="M9 7.5h5.5M9 11h3.5" />
            </svg>
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="repo-blocker-title" className="text-[21px] font-semibold leading-snug tracking-tight text-ink sm:text-[24px]">
              Connect the repository {b.domain} is built from
            </h2>
            <p className="mt-2 max-w-[38rem] text-[15px] leading-relaxed text-ink-muted">
              <span className="break-all font-medium text-ink">{b.repo}</span> {b.empty ? "is empty" : <>doesn&apos;t hold {b.domain}&apos;s code</>}, so your article can&apos;t
              reach your site from there. You don&apos;t need a new repo for us, just the one your site&apos;s code already lives in.
            </p>
          </div>
        </div>

        <figure className={cx("mt-6 flex items-center gap-3.5 rounded-2xl border border-line-soft bg-canvas/50 px-4 py-3.5 sm:ml-[60px]", s.riseIn)} style={{ "--d": "120ms" } as React.CSSProperties}>
          <span aria-hidden="true" className="relative grid h-10 w-8 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
            <span className="flex w-4 flex-col gap-[3px]">
              <span className="h-[2px] w-full rounded-full bg-ink-faint/70" />
              <span className="h-[2px] w-full rounded-full bg-ink-faint/50" />
              <span className="h-[2px] w-2/3 rounded-full bg-ink-faint/50" />
            </span>
            <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-ok text-canvas ring-2 ring-surface">
              <Check className="h-2.5 w-2.5" />
            </span>
          </span>
          <figcaption className="min-w-0">
            {b.topic ? <p className="line-clamp-2 text-[14.5px] font-medium leading-snug text-ink">&ldquo;{b.topic}&rdquo;</p> : null}
            <p className={cx("text-[13.5px] text-ink-muted", b.topic ? "mt-0.5" : "")}>
              {b.topic ? "Written and waiting. It goes live as soon as you connect." : "Your first article is written. It goes live as soon as you connect."}
            </p>
          </figcaption>
        </figure>

        <div className="@container mt-6 sm:ml-[60px]">
          <a href={b.href} className={cx(BTN_PRIMARY, "w-full sm:w-auto")}>
            <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Connect your site&apos;s repository
          </a>
          <ol aria-label="What happens next" className="m-0 mt-4 flex list-none flex-col gap-2 p-0 @[37rem]:flex-row @[37rem]:items-center @[37rem]:gap-0">
            {steps.map((label, i) => (
              <li key={label} className="flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-muted">
                {i > 0 ? <span aria-hidden="true" className="mx-2.5 hidden h-px w-4 bg-line @[37rem]:block" /> : null}
                <span aria-hidden="true" className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-line text-[10.5px] font-semibold tabular-nums text-ink-faint">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function FirstArticleWait({ siteName, progress: p, estimate = "usually 20 to 60 minutes" }: { siteName: string; progress: FirstArticleProgress; estimate?: string }) {
  const live = p.publishing === "done";
  // Waiting on the owner (the card above says what): no "close this tab" and
  // no "nothing else to do" - both would contradict it.
  const blocked = Boolean(p.blocker) && !live;
  const stuck = p.stuck ?? {};
  const note = (k: ProgressStep) => (stuck[k] ? <StuckDetail note={stuck[k]!} /> : undefined);
  return (
    <div className="mx-auto w-full max-w-3xl">
      {p.blocker?.kind === "repo" ? <RepoBlockerCard b={p.blocker} /> : null}
      <section aria-labelledby="wait-title" className={cx("overflow-hidden rounded-3xl border border-line-soft bg-surface", s.sceneIn)}>
        <div className="relative px-6 pt-7 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 sm:flex-nowrap">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium uppercase tracking-wide text-accent">{siteName}</p>
              <h1 id="wait-title" className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[30px]">
                {live ? "Your first article is live." : "Your first article is on its way"}
              </h1>
              <p className="mt-2 text-[15px] text-ink-muted">
                {live ? (
                  <>
                    It&apos;s at{" "}
                    <a href={p.liveUrl ?? "#"} className="text-ink underline decoration-line underline-offset-4">
                      {p.liveUrl?.replace(/^https?:\/\//, "")}
                    </a>
                    . The next one is already scheduled.
                  </>
                ) : (
                  blocked ? (
                    <>Written and ready. It goes out the moment you connect your site&apos;s repository above, and we&apos;ll email you when it&apos;s live.</>
                  ) : (
                    <>This {estimate}. You can close this tab; we&apos;ll email you when it&apos;s live.</>
                  )
                )}
              </p>
            </div>
            <div className="relative w-[min(220px,70vw)] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-surface-3 to-surface-2 px-2 pb-2 pt-3">
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(70%_80%_at_45%_100%,var(--color-accent-soft),transparent_72%)]" />
              <PixelReporter mood="working" decorative className="relative w-full" />
            </div>
          </div>
        </div>

        <ol className="m-0 list-none px-6 pb-6 pt-5 sm:px-8">
          <StepRow index={0} state={p.blog} label="Switching on your blog" detail={note("blog") ?? (p.blog === "done" ? "One small change to your site. yoursite.com/blog answers." : undefined)} />
          {p.google ? <StepRow index={1} state={p.google} label="Google confirms the site is yours" detail={note("google") ?? (p.google === "done" ? "It\u2019s in your Search Console now." : undefined)} /> : null}
          <StepRow index={0} state={p.reading} label="Reading your site" detail={note("reading") ?? (p.reading === "done" ? "What you sell, and to whom." : undefined)} />
          <StepRow index={1} state={p.topics} label="Finding topics people search for" detail={note("topics") ?? (p.topics === "done" && p.keywordsFound ? `${p.keywordsFound} keywords with real search numbers. The first one is picked.` : undefined)} />
          <StepRow index={2} state={p.writing} label={p.topic ? `Writing “${p.topic}”` : "Writing your first article"} detail={note("writing") ?? (p.writing !== "todo" ? "Facts from real sources, checked figure by figure." : undefined)} />
          <StepRow index={3} state={p.publishing} label="Publishing to your site" detail={note("publishing") ?? (p.publishing === "done" ? "Live, with its cover, links and a link back to you." : undefined)} />
        </ol>
        {stuck.google ? (
          // Google would not confirm by itself (an older grant, or a site
          // whose deploy never served the file): the same two Search Console
          // clicks the setup's Google scene shows.
          <div className="px-6 pb-7 sm:px-8">
            <FrameStrip
              frames={[
                { caption: "Type your address under \u201cURL prefix\u201d, click \u201cContinue\u201d.", ...SHOTS.gscPropertyType },
                { caption: "Click \u201cVerify\u201d.", ...SHOTS.gscVerify },
              ]}
            />
            <div className="mt-5 text-center">
              <a href={stuck.google.href ?? "https://search.google.com/search-console"} target="_blank" rel="noreferrer" className={BTN_QUIET}>
                Open Search Console
              </a>
              <p className="mt-4 text-[13.5px] text-ink-faint">
                Then pick it on the{" "}
                <a href="/google" className="text-ink-muted underline decoration-line underline-offset-4">
                  Google page
                </a>
                . Your first article doesn&apos;t wait for this.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {blocked ? null : (
      <p className={cx("mt-4 flex items-center gap-2 rounded-2xl border border-line-soft bg-surface px-4 py-3 text-[14px] text-ink-muted", s.riseIn)} style={{ "--d": "300ms" } as React.CSSProperties}>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="h-3.5 w-3.5" />
        </span>
        Setup is done. There is nothing else to do, ever: clicks and impressions from Google appear here as Google starts showing your pages.
      </p>
      )}
    </div>
  );
}
