"use client";

import { useEffect, useRef } from "react";

// The article waiting for review, read-only, drawn the way the blog draws
// it: the stored rendered HTML inside a shadow root carrying the blog's own
// stylesheet and the site's palette (hosted-blog.ts editorStyles) - the
// in-place editor's stage without the editing. The shadow root keeps the
// blog's CSS and the dashboard's apart in both directions.
//
// The HTML arrives already cleaned on the server (no JSON-LD script, the
// blog's decorateBody applied). Scripts set through innerHTML never run in
// any case. Links open in a new tab so reading never leaves the review.

const PREVIEW_CSS = `
.page{min-height:0}
main{padding-top:40px}
.cover{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:14px;margin:0 0 32px;background:var(--bg2)}
`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function ReviewPreview({
  html,
  title,
  metaLine,
  coverUrl,
  styles,
  lang,
  dir,
}: {
  /** The article body, cleaned and decorated on the server. */
  html: string;
  title: string;
  /** Byline, date and reading time, as the page prints them under the title. */
  metaLine: string;
  coverUrl: string | null;
  styles: string;
  lang: string;
  dir: "ltr" | "rtl";
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const cover = coverUrl ? `<img class="cover" src="${esc(coverUrl)}" alt="" width="1200" height="675" decoding="async">` : "";
    // Parsed in an inert <template> first (nothing loads, nothing fires),
    // then stripped of anything that could run, then attached. The HTML is
    // our own renderer's, sanitized when it was stored; this is belt and braces.
    const tpl = document.createElement("template");
    tpl.innerHTML = `<style>${styles}${PREVIEW_CSS}</style><div class="page" lang="${esc(lang)}" dir="${dir}"><main><article><h1>${esc(title)}</h1><p class="meta">${esc(metaLine)}</p>${cover}<div class="body">${html}</div></article></main></div>`;
    for (const el of tpl.content.querySelectorAll("script, iframe, object, embed")) el.remove();
    for (const el of tpl.content.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || (/^(href|src|xlink:href|action|formaction)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name);
      }
    }
    root.replaceChildren(tpl.content);
    // A cover that won't load leaves no broken-image box behind.
    root.querySelector("img.cover")?.addEventListener("error", (e) => (e.currentTarget as HTMLElement).remove(), { once: true });
    for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (a.getAttribute("href")?.startsWith("#")) continue;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  }, [html, title, metaLine, coverUrl, styles, lang, dir]);

  return (
    // Light-DOM children show only until the shadow root attaches: a calm
    // placeholder in the article's own shape, never an empty frame.
    <div ref={hostRef} className="min-h-[60vh]">
      <div className="mx-auto max-w-[44rem] space-y-4 px-6 py-10 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-8 w-4/5 rounded bg-surface-3" />
        <div className="h-3.5 w-1/3 rounded bg-surface-2" />
        <div className="aspect-[16/9] w-full rounded-xl bg-surface-2" />
        <div className="h-3.5 w-full rounded bg-surface-2" />
        <div className="h-3.5 w-11/12 rounded bg-surface-2" />
        <div className="h-3.5 w-4/5 rounded bg-surface-2" />
      </div>
    </div>
  );
}
