"use client";

import { PixelReporter } from "@/components/pixel-dispatcher";
import { CardMascot } from "@/components/card-mascot";
import { cx } from "@/components/ui/styles";
import { BTN_PRIMARY, BTN_QUIET, Check, GithubMark, StepRow, type StepState } from "./primitives";
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
 *  above everything, says it once, and offers the one way out.
 *  The picture is the point: the finished page, the clay dispatcher sitting
 *  on it with its legs over the edge, ready to deliver. It lands once (the
 *  page settles, the agent drops on), then only blinks. */
function RepoBlockerCard({ b }: { b: RepoBlocker }) {
  const steps = ["Pick it on GitHub", "Come back here", "Your article goes live"];
  return (
    <section
      aria-labelledby="repo-blocker-title"
      className={cx("relative mb-4 overflow-hidden rounded-3xl border border-[#8b5cf6]/25 bg-surface", s.sceneIn)}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_0%_0%,rgb(139_92_246/0.14),transparent_60%),radial-gradient(60%_60%_at_100%_100%,rgb(147_51_234/0.07),transparent_70%)]" />
      <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[15rem_minmax(0,1fr)] md:items-center md:gap-8">
        <HeldArticle topic={b.topic} />
        <div className="min-w-0">
          <h2 id="repo-blocker-title" className="text-balance text-[22px] font-semibold leading-snug tracking-tight text-ink sm:text-[25px]">
            Connect the repository {b.domain} is built from
          </h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
            <span className="break-all font-medium text-ink">{b.repo}</span> {b.empty ? "is empty" : <>doesn&apos;t hold {b.domain}&apos;s code</>}, so your article can&apos;t
            reach your site from there. Connect the repo your site&apos;s code already lives in (no new one needed) and it goes live right away.
          </p>
          <a href={b.href} className={cx(BTN_PRIMARY, "mt-6 w-full sm:w-auto")}>
            <GithubMark />
            Connect your site&apos;s repository
          </a>
        </div>
      </div>
      <div className="@container relative border-t border-line-soft px-5 py-4 sm:px-7">
        <ol aria-label="What happens next" className="m-0 flex list-none flex-col gap-2.5 p-0 @[34rem]:flex-row @[34rem]:items-center @[34rem]:gap-0">
          {steps.map((label, i) => (
            <li key={label} className="flex items-center gap-2 whitespace-nowrap text-[13.5px] text-ink-muted">
              {i > 0 ? <span aria-hidden="true" className="mx-3 hidden h-px w-6 bg-line @[34rem]:block" /> : null}
              <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[11px] font-semibold tabular-nums text-ink-faint">
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The written article as a printed page on a little stage, the dispatcher
 *  perched on its top edge, a speech bubble beside it. */
function HeldArticle({ topic }: { topic: string | null }) {
  return (
    <figure className="relative m-0 flex min-h-[15rem] items-end justify-center overflow-hidden rounded-2xl border border-line-soft bg-gradient-to-b from-surface-3 to-surface-2 px-4 pb-7 pt-[5.5rem]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(70%_80%_at_50%_100%,var(--color-accent-soft),transparent_72%)]" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-4 left-1/2 h-3 w-36 -translate-x-1/2 rounded-[50%] bg-black/40 blur-md" />

      <div aria-hidden="true" className={cx("relative w-[9.75rem]", s.paperIn)} style={{ "--d": "120ms" } as React.CSSProperties}>
        <div className="rounded-lg bg-ink p-3 text-canvas shadow-[0_20px_40px_-14px_rgb(0_0_0/0.75)]">
          <span className="block h-9 rounded-md bg-gradient-to-br from-[#ddd6fe] via-[#ede9fe] to-[#f5d0fe]" />
          {topic ? (
            <span className="mt-2.5 line-clamp-3 text-[11.5px] font-semibold leading-[1.28]">{topic}</span>
          ) : (
            <span className="mt-2.5 flex flex-col gap-1.5">
              <span className="h-2 w-full rounded-full bg-canvas/70" />
              <span className="h-2 w-3/4 rounded-full bg-canvas/70" />
            </span>
          )}
          <span className="mt-2.5 flex flex-col gap-[5px]">
            <span className="h-[3px] w-full rounded-full bg-canvas/15" />
            <span className="h-[3px] w-full rounded-full bg-canvas/15" />
            <span className="h-[3px] w-2/3 rounded-full bg-canvas/15" />
          </span>
        </div>
        <span className="absolute -bottom-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-ok text-canvas ring-[3px] ring-surface-2">
          <Check className="h-3.5 w-3.5" delay={700} />
        </span>
        <span className={cx("absolute -top-[50px] left-1 z-10 block h-[60px] w-[60px] drop-shadow-[0_6px_8px_rgb(0_0_0/0.45)]", s.perch)} style={{ "--d": "420ms" } as React.CSSProperties}>
          <CardMascot className={cx("block h-full w-full", s.blink)} />
        </span>
      </div>

      <span
        aria-hidden="true"
        className={cx("absolute right-3 top-4 max-w-[7.25rem] rounded-2xl rounded-bl-md border border-line bg-surface px-3 py-2 text-[12.5px] font-medium leading-snug text-ink shadow-lg shadow-black/30", s.bubble)}
        style={{ animationDelay: "900ms" }}
      >
        Written! Where do I take it?
      </span>

      <figcaption className="sr-only">
        {topic ? <>Your article &ldquo;{topic}&rdquo; is written and waiting.</> : "Your first article is written and waiting."}
      </figcaption>
    </figure>
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
                {live ? "Your first article is live." : blocked ? "Your first article is ready" : "Your first article is on its way"}
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
                    <>Written and ready, but it can&apos;t go out until you connect your site&apos;s repository above. Then it goes live right away, and we&apos;ll email you.</>
                  ) : (
                    <>This {estimate}. You can close this tab; we&apos;ll email you when it&apos;s live.</>
                  )
                )}
              </p>
            </div>
            <div className="relative w-[min(220px,70vw)] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-surface-3 to-surface-2 px-2 pb-2 pt-3">
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(70%_80%_at_45%_100%,var(--color-accent-soft),transparent_72%)]" />
              <PixelReporter mood={blocked ? "idle" : "working"} flag={blocked} decorative className="relative w-full" />
            </div>
          </div>
        </div>

        <ol className="m-0 list-none px-6 pb-6 pt-5 sm:px-8">
          <StepRow index={0} state={p.blog} label="Switching on your blog" detail={note("blog") ?? (p.blog === "done" ? "One small change to your site. yoursite.com/blog answers." : undefined)} />
          {p.google ? <StepRow index={1} state={p.google} label="Google confirms the site is yours" detail={note("google") ?? (p.google === "done" ? "It\u2019s in your Search Console now." : undefined)} /> : null}
          <StepRow index={0} state={p.reading} label="Reading your site" detail={note("reading") ?? (p.reading === "done" ? "What you sell, and to whom." : undefined)} />
          <StepRow index={1} state={p.topics} label="Finding topics people search for" detail={note("topics") ?? (p.topics === "done" && p.keywordsFound ? `${p.keywordsFound} keywords with real search numbers. The first one is picked.` : undefined)} />
          <StepRow index={2} state={p.writing} label={p.topic ? `Writing “${p.topic}”` : "Writing your first article"} detail={note("writing") ?? (p.writing !== "todo" ? "Facts from real sources, checked figure by figure." : undefined)} />
          <StepRow
            index={3}
            state={blocked ? "you" : p.publishing}
            label={blocked ? "Connect your site\u2019s repository" : "Publishing to your site"}
            detail={blocked ? "We can\u2019t publish until you do. Use the button above; the article goes live right after." : (note("publishing") ?? (p.publishing === "done" ? "Live, with its cover, links and a link back to you." : undefined))}
          />
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
