"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { previewArticle, saveArticleEdit } from "@/app/autopilot-actions";
import { EDIT_LIMITS, type ArticleRoute } from "@/lib/article-owner-shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";
import { cx, FOCUS_RING } from "@/components/ui/styles";

type Initial = { title: string; metaDescription: string; body: string };

/** Title, description, body - and Save. The body is the article's own
 *  markdown, which reads as plain text with a few marks (## for a heading,
 *  **bold**); a section goes by deleting its heading and the text under it.
 *  Preview renders it the way the page will, with nothing around it. */
export function ArticleEditor({ id, slug, initial, updatedAt, fileSha, url, route, repo, autoMerge }: { id: string; slug: string; initial: Initial; updatedAt: string; fileSha: string | null; url: string | null; route: ArticleRoute | null; repo: string | null; autoMerge: boolean }) {
  const [title, setTitle] = useState(initial.title);
  const [meta, setMeta] = useState(initial.metaDescription);
  const [body, setBody] = useState(initial.body);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<{ forBody: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(saveArticleEdit, null);
  // What was last saved, so "unsaved changes" and the browser's leave
  // warning follow the real state rather than the initial one.
  const [saved, setSaved] = useState(initial);
  const lastSavedAt = useRef<number | null>(null);

  useEffect(() => {
    if (state?.ok && state.at !== lastSavedAt.current) {
      lastSavedAt.current = state.at;
      setSaved({ title, metaDescription: meta, body });
    }
    // Only the action's answer should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const dirty = title !== saved.title || meta !== saved.metaDescription || body !== saved.body;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Preview is rendered on the server (the same renderer the page uses) when
  // the tab opens, and again only when the body changed since.
  useEffect(() => {
    if (tab !== "preview" || preview?.forBody === body) return;
    let cancelled = false;
    setPreviewError(null);
    previewArticle(slug, body).then(
      (r) => {
        if (cancelled) return;
        if ("error" in r) setPreviewError(r.error);
        else setPreview({ forBody: body, html: r.html });
      },
      () => {
        if (!cancelled) setPreviewError("The preview didn't load. Try again.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tab, body, slug, preview?.forBody]);

  const where =
    route === "repo"
      ? autoMerge
        ? `Saving opens a pull request in ${repo ?? "your repo"}; it merges on its own once your site's checks pass.`
        : `Saving opens a pull request in ${repo ?? "your repo"}. Merge it on GitHub and your site shows the change.`
      : route === "wordpress"
        ? "Saving updates the post on your WordPress site."
        : "Saving updates the live page within a few minutes.";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("body", body);
        startTransition(() => formAction(fd));
      }}
      className="arrive-in space-y-6"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      {/* The version this editor opened: a save is refused if the article
          changed since (another tab, your agent, a link added by us). */}
      <input type="hidden" name="updated_at" value={updatedAt} />
      {fileSha ? <input type="hidden" name="file_sha" value={fileSha} /> : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">Edit article</h1>
          <p className="mt-1 text-[15px] text-ink-muted">{where}</p>
        </div>
        <div className="flex items-center gap-3">
          <Toast state={state} />
          {state?.ok && !dirty && url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
              Open the live article
            </a>
          ) : null}
          <Button type="submit" variant="primary" size="md" pending={pending} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </div>

      <div className="space-y-5 rounded-3xl border border-line-soft bg-surface p-5 sm:p-7">
        <Field id="edit-title" label="Title" aside={`${title.length}/${EDIT_LIMITS.title}`} error={state && !state.ok && state.field === "title" ? state.message : null}>
          <Input id="edit-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={EDIT_LIMITS.title} required className="h-12 text-[17px] font-medium" />
        </Field>
        <Field
          id="edit-meta"
          label="Description"
          hint="The line Google shows under the title. Around 150 characters reads best."
          aside={`${meta.length}/${EDIT_LIMITS.metaDescription}`}
        >
          <Textarea id="edit-meta" name="meta_description" value={meta} onChange={(e) => setMeta(e.target.value)} maxLength={EDIT_LIMITS.metaDescription} rows={2} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <div role="tablist" aria-label="Body" className="flex gap-1 rounded-lg bg-surface-2 p-1">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cx("rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink", FOCUS_RING)}
                >
                  {t === "write" ? "Write" : "Preview"}
                </button>
              ))}
            </div>
            <span className="text-[12px] tabular-nums text-ink-faint">{wordCount(body)} words</span>
          </div>

          {tab === "write" ? (
            <>
              <Textarea
                id="edit-body"
                aria-label="Article body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={28}
                spellCheck
                className="min-h-[60vh] text-[15.5px] leading-[1.7]"
              />
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                Plain text with a few marks: <code className="rounded bg-surface-2 px-1">## Heading</code> starts a section, <code className="rounded bg-surface-2 px-1">**bold**</code>, and a link is <code className="rounded bg-surface-2 px-1">[words](https://…)</code>. To drop a section, delete its heading and the text under it.
              </p>
            </>
          ) : previewError ? (
            <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] text-danger">{previewError}</p>
          ) : preview?.forBody === body ? (
            <article className="min-h-[60vh] rounded-xl border border-line-soft bg-canvas/40 px-6 py-6 sm:px-10 sm:py-8">
              <h1 className="text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2.15rem]">{title}</h1>
              {/* Our own renderer's output over text it escaped first (article-render.ts): no HTML from the owner reaches here unescaped. */}
              <div className={PREVIEW_PROSE} dangerouslySetInnerHTML={{ __html: preview.html }} />
            </article>
          ) : (
            <div className="min-h-[60vh] animate-pulse rounded-xl border border-line-soft bg-surface-2/60 motion-reduce:animate-none" aria-busy="true" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/articles/${encodeURIComponent(id)}`} className="text-[13px] font-medium text-ink-muted hover:text-ink">
          {dirty ? "Leave without saving" : "Back to the article"}
        </Link>
        <Button type="submit" variant="primary" size="md" pending={pending} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function wordCount(s: string): number {
  const m = s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** The article's reading styles, scoped to the preview. Mirrors the hosted
 *  blog's proportions on the dashboard's own tokens: one measure, headings
 *  that step down, quiet tables and a callout for the opening summary. */
const PREVIEW_PROSE = cx(
  "mt-6 max-w-[68ch] text-[16px] leading-[1.75] text-ink",
  "[&_p]:my-4 [&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/40 [&_a]:underline-offset-[3px]",
  "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[1.4rem] [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-tight",
  "[&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-[1.1rem] [&_h3]:font-semibold",
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5",
  "[&_strong]:font-semibold [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-[0.92em]",
  "[&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-surface-2 [&_pre]:p-4 [&_pre]:text-[13.5px] [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-ink-muted",
  "[&_.tldr]:my-5 [&_.tldr]:rounded-xl [&_.tldr]:border [&_.tldr]:border-accent/25 [&_.tldr]:bg-accent-soft/40 [&_.tldr]:px-5 [&_.tldr]:py-4 [&_.tldr_.tldr-k]:block [&_.tldr_.tldr-k]:text-[12px] [&_.tldr_.tldr-k]:font-semibold [&_.tldr_.tldr-k]:uppercase [&_.tldr_.tldr-k]:tracking-wide [&_.tldr_.tldr-k]:text-accent [&_.tldr_p]:my-2",
  "[&_.tbl]:my-5 [&_.tbl]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14.5px] [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border-b [&_td]:border-line-soft [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_.takeaways]:my-6 [&_.takeaways]:rounded-xl [&_.takeaways]:border [&_.takeaways]:border-line-soft [&_.takeaways]:bg-surface [&_.takeaways]:px-5 [&_.takeaways]:py-4 [&_.takeaways_h2]:mt-0 [&_.takeaways_h2]:text-[1.05rem]",
  "[&_details.faq]:border-b [&_details.faq]:border-line-soft [&_details.faq]:py-3 [&_details.faq_summary]:cursor-pointer [&_details.faq_summary]:font-medium [&_details.faq_div]:pt-2 [&_details.faq_div]:text-ink-muted",
  "[&_img]:my-5 [&_img]:max-w-full [&_img]:rounded-xl [&_hr]:my-8 [&_hr]:border-line-soft",
);
