"use client";

import { PixelReporter } from "@/components/pixel-dispatcher";
import { cx } from "@/components/ui/styles";
import { BTN_QUIET, Check, StepRow, type StepState } from "./primitives";
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

export function FirstArticleWait({ siteName, progress: p, estimate = "usually 20 to 60 minutes" }: { siteName: string; progress: FirstArticleProgress; estimate?: string }) {
  const live = p.publishing === "done";
  const stuck = p.stuck ?? {};
  const note = (k: ProgressStep) => (stuck[k] ? <StuckDetail note={stuck[k]!} /> : undefined);
  return (
    <div className="mx-auto w-full max-w-3xl">
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
                  <>This {estimate}. You can close this tab; we&apos;ll email you when it&apos;s live.</>
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

      <p className={cx("mt-4 flex items-center gap-2 rounded-2xl border border-line-soft bg-surface px-4 py-3 text-[14px] text-ink-muted", s.riseIn)} style={{ "--d": "300ms" } as React.CSSProperties}>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="h-3.5 w-3.5" />
        </span>
        Setup is done. There is nothing else to do, ever: clicks and impressions from Google appear here as Google starts showing your pages.
      </p>
    </div>
  );
}
