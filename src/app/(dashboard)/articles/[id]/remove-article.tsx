"use client";

import { startTransition, useActionState, useState } from "react";
import { removeArticleAction } from "@/app/autopilot-actions";
import type { ArticleRoute } from "@/lib/article-owner-shared";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";

/** "Remove from site": a quiet text link that opens into one plain question
 *  with the consequence spelled out for this article's route, then the
 *  button that does it. The action lands on the list; this component only
 *  ever shows the refusal. */
export function RemoveArticle({ id, pageId, slug, route, autoMerge, recheck = false }: { id: string; /** An article from before the writer (a page row): adopted into a draft first. */ pageId?: string; slug: string; route: ArticleRoute | null; autoMerge: boolean; /** A removal already waiting on its pull request: one button that looks at the PR now. */ recheck?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(removeArticleAction, null);

  if (recheck) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
        className="mt-3 flex flex-wrap items-center gap-3"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="slug" value={slug} />
        <Button type="submit" variant="secondary" size="sm" pending={pending}>
          Check again
        </Button>
        <Toast state={state} />
      </form>
    );
  }

  const consequence =
    route === "repo"
      ? autoMerge
        ? "We open a pull request that deletes its file; it merges on its own once your site's checks pass, and the page is gone after the next deploy."
        : "We open a pull request that deletes its file; merge it on GitHub and the page is gone, or close it and the article stays."
      : route === "wordpress"
        ? "The post moves to your WordPress trash, where you can still restore it."
        : "It leaves your blog within a few minutes, and Google is told the page is gone.";

  if (!open) {
    return (
      <Button type="button" variant="danger" size="lg" onClick={() => setOpen(true)}>
        Delete article
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="max-w-md rounded-2xl border border-danger/30 bg-danger/5 p-4"
    >
      <input type="hidden" name="id" value={id} />
      {pageId ? <input type="hidden" name="page_id" value={pageId} /> : null}
      <input type="hidden" name="slug" value={slug} />
      <p className="text-[14px] font-medium text-ink">Delete this article from your site?</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{consequence}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" size="sm" pending={pending}>
          Yes, delete it
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Keep it
        </Button>
        <Toast state={state} />
      </div>
    </form>
  );
}
