"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { approveArticleAction, discardArticleAction } from "@/app/autopilot-actions";
import type { ActionState } from "@/components/ui/action-state";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Toast } from "@/components/ui/toast";
import { cx } from "@/components/ui/styles";

// The review screen's controls (article-review.ts): one bar that sticks under
// the dashboard header while the owner reads, so Publish is never a scroll
// away. Green on purpose - the owner asked for a green button to release the
// article; the rest of the bar stays grey so it is the one thing that reads.
//
// After Publish the page revalidates and the article is no longer "review",
// so this bar unmounts with the action's answer still in hand. The answer
// goes to a module-level note instead, and <PublishFlash> (rendered on the
// article page in every state) says it once the page has re-rendered.

const PUBLISH =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-ok px-4 text-[14px] font-semibold text-emerald-950 shadow-sm shadow-ok/25 outline-none transition-colors hover:bg-emerald-300 focus-visible:ring-2 focus-visible:ring-ok/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60 sm:px-5";

// ---- the note that outlives the bar ------------------------------------------

type Flash = { message: string; at: number };
const flashes = new Map<string, Flash>();
const listeners = new Set<() => void>();
const FLASH_MS = 10 * 60_000;

function flashPublished(id: string, message: string) {
  flashes.set(id, { message, at: Date.now() });
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** "Sent to your site", with what happens next, on the article page right
 *  after its Publish. Nothing at all otherwise (and nothing after a reload). */
export function PublishFlash({ id }: { id: string }) {
  const flash = useSyncExternalStore(
    subscribe,
    () => flashes.get(id) ?? null,
    () => null,
  );
  if (!flash || Date.now() - flash.at > FLASH_MS) return null;
  return (
    <Callout tone="ok" role="status" title="Sent to your site" className="arrive-up">
      {flash.message}
    </Callout>
  );
}

// ---- the bar -------------------------------------------------------------------

export function ReviewBar({
  id,
  slug,
  updatedAt,
  readOnlyNote,
}: {
  id: string;
  slug: string;
  /** The version the page rendered: Publish refuses a newer one unread. */
  updatedAt: string;
  /** The operator viewing another site: the bar says so and offers nothing. */
  readOnlyNote?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, publish, publishing] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await approveArticleAction(prev, fd);
    if (r?.ok) flashPublished(id, r.message);
    return r;
  }, null);
  const [dropState, drop, dropping] = useActionState(discardArticleAction, null);
  const busy = publishing || dropping;
  const sent = Boolean(state?.ok);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dropping) setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, dropping]);

  const submit = (action: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  return (
    // Sticks just under the dashboard header (h-14, z-20 in the layout),
    // full-bleed across the main column's padding - the editor's bar, too.
    <div className="sticky top-14 z-10 -mx-4 border-b border-line-soft bg-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/articles" className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-[13px] font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="max-sm:sr-only">All articles</span>
          </Link>
          <p className="hidden min-w-0 items-center gap-2 text-[13px] text-ink-muted md:flex">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            <span className="truncate">{readOnlyNote ?? "Ready for review. Nothing is on your site yet."}</span>
          </p>
        </div>

        {readOnlyNote ? null : sent ? (
          <p role="status" className="flex shrink-0 items-center gap-2 text-[14px] font-medium text-ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Publishing
          </p>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming((o) => !o)} aria-expanded={confirming} aria-controls="dont-publish" disabled={busy}>
              Don&apos;t publish
            </Button>
            <Link
              href={`/articles/${encodeURIComponent(id)}/edit`}
              aria-disabled={busy || undefined}
              className={cx(buttonClass("secondary", "md"), busy && "pointer-events-none opacity-60")}
            >
              Edit
            </Link>
            <form onSubmit={submit(publish)}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="updated_at" value={updatedAt} />
              <button type="submit" className={PUBLISH} disabled={busy} aria-busy={publishing || undefined}>
                {publishing ? (
                  <svg viewBox="0 0 24 24" className="dispatch-spin h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
                {publishing ? "Publishing" : "Publish"}
              </button>
            </form>
          </div>
        )}

        {/* "Don't publish", asked once, in words: never window.confirm. */}
        {confirming && !sent && !readOnlyNote ? (
          <form
            id="dont-publish"
            onSubmit={submit(drop)}
            className="dispatch-fade-in absolute right-0 top-full z-10 mt-4 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-danger/30 bg-surface p-4 shadow-xl shadow-black/40"
          >
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="id" value={id} />
            <p className="text-[14px] font-medium text-ink">Don&apos;t publish this article?</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">It&apos;s set aside for good and never reaches your site. The next article comes on your plan&apos;s schedule.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="submit" variant="danger" size="sm" pending={dropping}>
                Don&apos;t publish
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={dropping} autoFocus>
                Keep it
              </Button>
            </div>
            <Toast state={dropState} className="mt-2 empty:hidden" />
          </form>
        ) : null}
      </div>

      {/* A refusal ("changed since you opened it", nowhere to publish) stays
          under the bar until the next try; it has to be read. */}
      {state && !state.ok ? (
        <div className="mx-auto mt-2 flex max-w-5xl justify-end">
          <Toast state={state} />
        </div>
      ) : null}
    </div>
  );
}
